package AWS::SecureMediaDelivery::Secret;

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;

use Moose;
use namespace::autoclean;
use Paws;
use JSON;
use Time::HiRes qw(time);
use Carp qw(croak);

our $VERSION = '1.2.7';

=head1 NAME

AWS::SecureMediaDelivery::Secret - Manages cryptographic secrets for token signing

=head1 SYNOPSIS

    use AWS::SecureMediaDelivery::Secret;
    
    # Native AWS Secrets Manager retrieval
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name => 'MyStack',
        ttl        => 300,
    );
    
    # Custom secret retrieval
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name       => 'MyStack',
        ttl              => 300,
        retrieve_mode    => 'custom',
        retrieve_function => sub {
            my ($stack_name) = @_;
            return {
                primary => {
                    uuid  => 'custom-uuid',
                    value => 'custom-value',
                },
            };
        },
    );
    
    # Retrieve keys
    my $keys = $secret->retrieve_keys();
    my $primary_key = $secret->retrieve_keys('primary');

=head1 DESCRIPTION

This class handles the retrieval and caching of secrets from AWS Secrets Manager
or custom sources for use in JWT token generation.

=cut

has 'stack_name' => (
    is       => 'ro',
    isa      => 'Str',
    required => 1,
);

has 'ttl' => (
    is       => 'ro',
    isa      => 'Int',
    required => 1,
);

has 'retrieve_mode' => (
    is      => 'ro',
    isa     => 'Str',
    default => 'native',
);

has 'retrieve_function' => (
    is        => 'ro',
    isa       => 'CodeRef',
    predicate => 'has_retrieve_function',
);

has 'retrieve_function_args' => (
    is      => 'ro',
    isa     => 'ArrayRef',
    default => sub { [] },
);

has '_sm_client' => (
    is      => 'rw',
    isa     => 'Maybe[Object]',
    lazy    => 1,
    builder => '_build_sm_client',
);

has '_keys' => (
    is  => 'rw',
    isa => 'Maybe[HashRef]',
);

has '_last_updated' => (
    is  => 'rw',
    isa => 'Maybe[Num]',
);

has '_lock' => (
    is      => 'ro',
    isa     => 'Bool',
    default => 0,
    writer  => '_set_lock',
);

has 'debug' => (
    is      => 'rw',
    isa     => 'Bool',
    default => 0,
);

=head1 METHODS

=head2 new(%args)

Creates a new Secret instance.

=over 4

=item * stack_name - CloudFormation stack name (required)

=item * ttl - Time-to-live for cached secrets in seconds (required)

=item * retrieve_mode - 'native' for AWS Secrets Manager or 'custom' for custom function (default: 'native')

=item * retrieve_function - Custom function to retrieve secrets (CodeRef)

=item * retrieve_function_args - Arguments for custom retrieve function (ArrayRef)

=back

=cut

sub BUILD {
    my ($self) = @_;
    
    if ($self->retrieve_mode eq 'custom' && !$self->has_retrieve_function) {
        croak "retrieve_function is required when retrieve_mode is 'custom'";
    }
}

=head2 init_sm_client(%params)

Initialize AWS Secrets Manager client.

    $secret->init_sm_client(region => 'us-east-1');

=cut

sub init_sm_client {
    my ($self, %params) = @_;
    
    eval {
        my $paws = Paws->new(%params);
        $self->_sm_client($paws->service('SecretsManager'));
        return 1;
    };
    
    if ($@) {
        $self->_debug_log("Couldn't create SecretsManager client: $@");
        return 0;
    }
    
    return 1;
}

=head2 retrieve_keys($key_alias)

Retrieve cryptographic keys with caching.

    my $all_keys = $secret->retrieve_keys();
    my $primary = $secret->retrieve_keys('primary');
    my $secondary = $secret->retrieve_keys('secondary');

=cut

sub retrieve_keys {
    my ($self, $key_alias) = @_;
    $key_alias //= 'all';
    
    my $is_expired = $self->_check_if_expired();
    
    if ($self->_last_updated && (!$is_expired || $self->_lock)) {
        return $self->_filter_keys($self->_keys, $key_alias);
    }
    
    $self->_debug_log('Starting key retrieval');
    $self->_set_lock(1);
    
    my $keys;
    eval {
        if ($self->retrieve_mode eq 'native') {
            $keys = $self->_get_sm_secret();
        } elsif ($self->retrieve_mode eq 'custom') {
            $keys = $self->retrieve_function->($self->stack_name, @{$self->retrieve_function_args});
        } else {
            croak "Invalid retrieve mode: " . $self->retrieve_mode;
        }
        
        $self->_validate_keys($keys);
        $self->_keys($keys);
        $self->_last_updated(time());
    };
    
    my $error = $@;
    $self->_set_lock(0);
    
    if ($error) {
        $self->_debug_log("Failed to retrieve the keys: $error");
        croak "Key retrieval failed: $error";
    }
    
    if ($self->_keys) {
        return $self->_filter_keys($self->_keys, $key_alias);
    }
    
    croak "Key retrieval failed and no previously set key is available";
}

=head2 get_key_value($key_alias)

Get the value of a specific key.

    my $value = $secret->get_key_value('primary');

=cut

sub get_key_value {
    my ($self, $key_alias) = @_;
    return $self->_keys->{$key_alias}->{value};
}

=head2 get_key_uuid($key_alias)

Get the UUID of a specific key.

    my $uuid = $secret->get_key_uuid('primary');

=cut

sub get_key_uuid {
    my ($self, $key_alias) = @_;
    return $self->_keys->{$key_alias}->{uuid};
}

=head2 validate_keys($keys)

Validate the format of retrieved keys (class method).

    AWS::SecureMediaDelivery::Secret->validate_keys($keys);

=cut

sub validate_keys {
    my ($class, $keys) = @_;
    
    return 0 unless ref $keys eq 'HASH';
    
    my @top_level_keys = keys %$keys;
    
    if (@top_level_keys == 1) {
        return 0 unless exists $keys->{primary};
        my $primary = $keys->{primary};
        return 0 unless ref $primary eq 'HASH';
        my @low_level_keys = keys %$primary;
        return $class->_validate_primary(\@top_level_keys, \@low_level_keys, 
                                        $primary->{uuid}, $primary->{value});
    } elsif (@top_level_keys == 2) {
        return $class->_validate_secondary(\@top_level_keys, $keys);
    }
    
    return 0;
}

# Private methods

sub _build_sm_client {
    my ($self) = @_;
    return unless $self->retrieve_mode eq 'native';
    
    my $paws = Paws->new();
    return $paws->service('SecretsManager');
}

sub _get_sm_secret {
    my ($self) = @_;
    
    my $secret_name_primary = $self->stack_name . '_PrimarySecret';
    my $secret_name_secondary = $self->stack_name . '_SecondarySecret';
    
    my ($primary_secret_json, $secondary_secret_json);
    
    eval {
        my $primary_response = $self->_sm_client->GetSecretValue(SecretId => $secret_name_primary);
        my $secondary_response = $self->_sm_client->GetSecretValue(SecretId => $secret_name_secondary);
        
        $primary_secret_json = $self->_get_secret_kv($primary_response);
        $secondary_secret_json = $self->_get_secret_kv($secondary_response);
    };
    
    if ($@) {
        croak "Couldn't retrieve SecretsManager secrets: $@";
    }
    
    my @primary_keys = keys %$primary_secret_json;
    my @secondary_keys = keys %$secondary_secret_json;
    
    return {
        primary => {
            uuid  => $primary_keys[0],
            value => $primary_secret_json->{$primary_keys[0]},
        },
        secondary => {
            uuid  => $secondary_keys[0],
            value => $secondary_secret_json->{$secondary_keys[0]},
        },
    };
}

sub _get_secret_kv {
    my ($self, $sm_response) = @_;
    
    my $secret;
    if ($sm_response->SecretString) {
        $secret = $sm_response->SecretString;
    } else {
        require MIME::Base64;
        $secret = MIME::Base64::decode_base64($sm_response->SecretBinary);
    }
    
    return decode_json($secret);
}

sub _check_if_expired {
    my ($self) = @_;
    
    return unless $self->_last_updated;
    
    my $elapsed = time() - $self->_last_updated;
    return $elapsed > $self->ttl;
}

sub _validate_keys {
    my ($self, $keys) = @_;
    return $self->validate_keys($keys) || croak "Invalid format of the returned keys";
}

sub _validate_primary {
    my ($class, $top_level_keys, $low_level_keys, $uuid, $value) = @_;
    
    return 0 unless grep { $_ eq 'primary' } @$top_level_keys;
    return 0 unless @$low_level_keys == 2;
    return 0 unless grep { $_ eq 'uuid' } @$low_level_keys;
    return 0 unless grep { $_ eq 'value' } @$low_level_keys;
    return 0 unless defined $uuid && length $uuid;
    return 0 unless defined $value && length $value;
    
    return 1;
}

sub _validate_secondary {
    my ($class, $top_level_keys, $keys) = @_;
    
    return 0 unless grep { $_ eq 'primary' } @$top_level_keys;
    return 0 unless grep { $_ eq 'secondary' } @$top_level_keys;
    
    for my $key_name (qw(primary secondary)) {
        my $key_data = $keys->{$key_name};
        return 0 unless ref $key_data eq 'HASH';
        my @low_level_keys = keys %$key_data;
        return 0 unless @low_level_keys == 2;
        return 0 unless grep { $_ eq 'uuid' } @low_level_keys;
        return 0 unless grep { $_ eq 'value' } @low_level_keys;
        return 0 unless defined $key_data->{uuid} && length $key_data->{uuid};
        return 0 unless defined $key_data->{value} && length $key_data->{value};
    }
    
    return 1;
}

sub _filter_keys {
    my ($self, $keys, $key_alias) = @_;
    
    if ($key_alias eq 'primary') {
        return { primary => $keys->{primary} };
    } elsif ($key_alias eq 'secondary') {
        return exists $keys->{secondary} ? { secondary => $keys->{secondary} } : {};
    } else {
        return $keys;
    }
}

sub _debug_log {
    my ($self, $message) = @_;
    print STDERR "[DEBUG] Secret: $message\n" if $self->debug;
}

__PACKAGE__->meta->make_immutable;

=head1 SEE ALSO

L<AWS::SecureMediaDelivery::Token>, L<AWS::SecureMediaDelivery::Session>

=head1 AUTHOR

Amazon Web Services <aws-solutions@amazon.com>

=head1 LICENSE

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0

=cut

1;
