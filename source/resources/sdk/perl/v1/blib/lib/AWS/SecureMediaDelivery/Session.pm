package AWS::SecureMediaDelivery::Session;

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;

use Moose;
use namespace::autoclean;
use Paws;
use Time::HiRes qw(time);
use Carp qw(croak);

our $VERSION = '1.2.7';

=head1 NAME

AWS::SecureMediaDelivery::Session - Manages session revocation and tracking

=head1 SYNOPSIS

    use AWS::SecureMediaDelivery::Session;
    
    # Initialize session management
    AWS::SecureMediaDelivery::Session->initialize('MyRevocationTable');
    
    # Create session with specific ID
    my $session = AWS::SecureMediaDelivery::Session->new(
        id => 'user-session-12345'
    );
    
    # Create session with auto-generated ID
    my $session = AWS::SecureMediaDelivery::Session->new(
        autogenerate => 1,
        length       => 16,
    );
    
    # Revoke session
    my $success = $session->revoke(
        expiry_period => 86400,
        reason        => 'COMPROMISED',
    );

=head1 DESCRIPTION

This class handles session creation, auto-generation, and revocation
for the secure media delivery system.

=cut

has 'id' => (
    is      => 'ro',
    isa     => 'Str',
    lazy    => 1,
    builder => '_build_id',
);

has 'suspicion_score' => (
    is      => 'ro',
    isa     => 'Int',
    default => 0,
);

has 'autogenerate' => (
    is      => 'ro',
    isa     => 'Bool',
    default => 0,
);

has 'length' => (
    is      => 'ro',
    isa     => 'Int',
    default => 12,
);

has 'debug' => (
    is      => 'rw',
    isa     => 'Bool',
    default => 0,
);

# Class variables
our $_ddb_client;
our $_revocation_table = '';
our $_debug = 0;

=head1 CLASS METHODS

=head2 initialize($table_name, %params)

Initialize session management with DynamoDB table.

    AWS::SecureMediaDelivery::Session->initialize(
        'MyRevocationTable',
        region => 'us-east-1'
    );

=cut

sub initialize {
    my ($class, $table_name, %params) = @_;
    
    $_revocation_table = $table_name;
    return $class->init_db_client(%params);
}

=head2 init_db_client(%params)

Initialize DynamoDB client.

    AWS::SecureMediaDelivery::Session->init_db_client(region => 'us-east-1');

=cut

sub init_db_client {
    my ($class, %params) = @_;
    
    eval {
        my $paws = Paws->new(%params);
        $_ddb_client = $paws->service('DynamoDB');
        return 1;
    };
    
    if ($@) {
        $class->_debug_log("Couldn't create DynamoDB client: $@");
        return 0;
    }
    
    return 1;
}

=head2 set_debug($debug)

Enable or disable debug logging (class method).

    AWS::SecureMediaDelivery::Session->set_debug(1);

=cut

sub set_debug {
    my ($class, $debug) = @_;
    $_debug = $debug ? 1 : 0;
}

=head2 auto_generate($length)

Auto-generate a random session ID (class method).

    my $session_id = AWS::SecureMediaDelivery::Session->auto_generate(16);

=cut

sub auto_generate {
    my ($class, $length) = @_;
    $length //= 12;
    
    my @chars = ('A'..'Z', 'a'..'z', '0'..'9');
    my $session_id = '';
    
    for (1..$length) {
        $session_id .= $chars[rand @chars];
    }
    
    return $session_id;
}

=head1 INSTANCE METHODS

=head2 new(%args)

Creates a new Session instance.

=over 4

=item * id - Session ID (optional, will be auto-generated if not provided)

=item * autogenerate - Whether to auto-generate session ID (default: 0)

=item * length - Length of auto-generated session ID (default: 12)

=item * suspicion_score - Suspicion score for the session (default: 0)

=back

=cut

sub BUILD {
    my ($self) = @_;
    
    if ($self->autogenerate && $self->length <= 6) {
        croak "Invalid length while autogenerate is enabled. It must be greater than 6";
    }
}

=head2 revoke(%args)

Revoke the session by adding it to the revocation table.

    my $success = $session->revoke(
        expiry_period => 86400,    # seconds
        reason        => 'COMPROMISED',
    );

=cut

sub revoke {
    my ($self, %args) = @_;
    
    my $expiry_period = $args{expiry_period} // 86400;
    my $reason = $args{reason} // 'COMPROMISED';
    
    croak "DynamoDB client hasn't been initialized" unless $_ddb_client;
    croak "Revocation Table name must be set" unless $_revocation_table;
    
    my $current_timestamp = int(time());
    my $expiry_time = $current_timestamp + $expiry_period;
    
    my $item = {
        session_id => {
            S => $self->id,
        },
        type => {
            S => 'MANUAL',
        },
        score => {
            N => $self->suspicion_score . '',
        },
        reason => {
            S => $reason,
        },
        last_updated => {
            N => $current_timestamp . '',
        },
        ttl => {
            N => $expiry_time . '',
        },
    };
    
    eval {
        $_ddb_client->PutItem(
            TableName => $_revocation_table,
            Item      => $item,
        );
        return 1;
    };
    
    if ($@) {
        print STDERR "ERROR: $@\n";
        $self->_debug_log("Manual session revoke operation failed when updating DynamoDB table: $@");
        return 0;
    }
    
    return 1;
}

# Private methods

sub _build_id {
    my ($self) = @_;
    
    if ($self->autogenerate) {
        return $self->auto_generate($self->length);
    }
    
    return $self->auto_generate(12);
}

sub _debug_log {
    my ($self, $message) = @_;
    
    my $debug = ref $self ? $self->debug : $_debug;
    print STDERR "[DEBUG] Session: $message\n" if $debug;
}

__PACKAGE__->meta->make_immutable;

=head1 SEE ALSO

L<AWS::SecureMediaDelivery::Secret>, L<AWS::SecureMediaDelivery::Token>

=head1 AUTHOR

Amazon Web Services <aws-solutions@amazon.com>

=head1 LICENSE

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0

=cut

1;
