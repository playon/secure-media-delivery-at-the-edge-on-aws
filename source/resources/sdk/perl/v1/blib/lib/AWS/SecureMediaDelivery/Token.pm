package AWS::SecureMediaDelivery::Token;

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;

use Moose;
use namespace::autoclean;
use Crypt::JWT qw(encode_jwt);
use Net::IP;
use URI;
use Time::HiRes qw(time);
use Digest::HMAC_SHA256 qw(hmac_sha256_base64);
use MIME::Base64 qw(encode_base64url);
use Carp qw(croak);
use AWS::SecureMediaDelivery::Session;

our $VERSION = '1.2.7';

=head1 NAME

AWS::SecureMediaDelivery::Token - Generates JWT tokens with various security policies

=head1 SYNOPSIS

    use AWS::SecureMediaDelivery::Token;
    use AWS::SecureMediaDelivery::Secret;
    
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name => 'MyStack',
        ttl        => 300,
    );
    
    my $token = AWS::SecureMediaDelivery::Token->new(secret => $secret);
    
    my $viewer_attributes = {
        ip      => '192.168.1.1',
        co      => 'US',
        headers => {
            'user-agent' => 'Mozilla/5.0...',
            'referer'    => 'https://example.com',
        },
    };
    
    my $token_policy = {
        ip      => 1,
        co      => 1,
        headers => ['user-agent', 'referer'],
        paths   => ['/video/'],
        exp     => '+2h',
    };
    
    my $signed_url = $token->generate(
        $viewer_attributes,
        'https://example.cloudfront.net/video/stream.m3u8',
        $token_policy
    );

=head1 DESCRIPTION

This class creates secure tokens for media delivery with support for
IP validation, geolocation, headers, query strings, and session management.

=cut

has 'secret' => (
    is       => 'ro',
    isa      => 'AWS::SecureMediaDelivery::Secret',
    required => 1,
);

has 'default_token_policy' => (
    is  => 'ro',
    isa => 'Maybe[HashRef]',
);

has 'encoded_jwt' => (
    is     => 'rw',
    isa    => 'Maybe[Str]',
    writer => '_set_encoded_jwt',
);

has 'output_playback_url' => (
    is     => 'rw',
    isa    => 'Maybe[Str]',
    writer => '_set_output_playback_url',
);

has 'payload_ssn' => (
    is     => 'rw',
    isa    => 'Maybe[Str]',
    writer => '_set_payload_ssn',
);

has 'debug' => (
    is      => 'rw',
    isa     => 'Bool',
    default => 0,
);

=head1 METHODS

=head2 new(%args)

Creates a new Token generator.

=over 4

=item * secret - AWS::SecureMediaDelivery::Secret instance (required)

=item * default_token_policy - Default policy for token generation (optional)

=back

=cut

=head2 generate($viewer_attributes, $playback_url, $token_policy, $secret_alias)

Generate a secure JWT token.

    my $signed_url = $token->generate(
        $viewer_attributes,  # HashRef of viewer attributes
        $playback_url,       # String (optional)
        $token_policy,       # HashRef of token policy
        $secret_alias        # String (optional, default: 'primary')
    );

=cut

sub generate {
    my ($self, $viewer_attributes, $playback_url, $token_policy, $secret_alias) = @_;
    
    $secret_alias //= 'primary';
    $token_policy //= $self->default_token_policy;
    
    croak "No token policy provided and no default policy set" unless $token_policy;
    
    my $keys = $self->secret->retrieve_keys('all');
    croak "Provided secret alias '$secret_alias' can't be found in the retrieved secret"
        unless exists $keys->{$secret_alias};
    
    my $playback_url_qs = {};
    if ($playback_url) {
        my $uri = URI->new($playback_url);
        $playback_url_qs = { $uri->query_form };
    }
    
    my $jwt_payload = {
        ip      => 0,
        co      => 0,
        cty     => 0,
        reg     => 0,
        ssn     => 0,
        exp     => '',
        headers => [],
        qs      => [],
        intsig  => '',
        paths   => [],
        exc     => [],
    };
    
    $jwt_payload = $self->_populate_jwt_payload(
        $token_policy, $viewer_attributes, $jwt_payload, 
        $playback_url_qs, $keys->{$secret_alias}
    );
    
    $self->_set_encoded_jwt(
        encode_jwt(
            payload => $jwt_payload,
            key     => $keys->{$secret_alias}->{value},
            alg     => 'HS256',
            extra_headers => {
                kid => $keys->{$secret_alias}->{uuid},
            },
        )
    );
    
    if ($playback_url) {
        my @url_parts = split '/', $playback_url;
        my $token_part = $self->payload_ssn ? 
            $self->payload_ssn . '.' . $self->encoded_jwt : 
            $self->encoded_jwt;
        splice @url_parts, 3, 0, $token_part;
        $self->_set_output_playback_url(join '/', @url_parts);
        return $self->output_playback_url;
    }
    
    return $self->payload_ssn ? 
        $self->payload_ssn . '.' . $self->encoded_jwt : 
        $self->encoded_jwt;
}

=head2 set_debug($debug)

Enable or disable debug logging.

    $token->set_debug(1);

=cut

sub set_debug {
    my ($self, $debug) = @_;
    $self->debug($debug ? 1 : 0);
}

# Private methods

sub _sign {
    my ($self, $input, $key, $method) = @_;
    
    if ($method eq 'sha256') {
        my $signature = hmac_sha256_base64($input, $key);
        # Convert to base64url encoding
        $signature =~ tr/+\//-_/;
        $signature =~ s/=+$//;
        return $signature;
    }
    
    croak "Unsupported hash method: $method";
}

sub _populate_ip {
    my ($self, $viewer_attributes, $jwt_payload) = @_;
    
    my $ip = $viewer_attributes->{ip};
    my $ip_obj = Net::IP->new($ip);
    
    croak "Invalid viewer's IP format: $ip" unless $ip_obj;
    
    my $full_ip;
    if ($ip_obj->version == 4) {
        $jwt_payload->{ip_ver} = 4;
        $full_ip = $ip_obj->ip;
    } elsif ($ip_obj->version == 6) {
        $jwt_payload->{ip_ver} = 6;
        $full_ip = $self->_expand_ipv6($ip_obj->ip);
    } else {
        croak "Invalid IP address format: $ip";
    }
    
    return {
        fullIP      => $full_ip,
        jwt_payload => $jwt_payload,
    };
}

sub _expand_ipv6 {
    my ($self, $address) = @_;
    
    my $ip_obj = Net::IP->new($address);
    return $ip_obj ? lc($ip_obj->ip) : $address;
}

sub _populate_boolean_items {
    my ($self, $token_policy, $viewer_attributes, $jwt_payload) = @_;
    
    my $intsig_input = '';
    
    if ($token_policy->{ip}) {
        my $populated_ip = $self->_populate_ip($viewer_attributes, $jwt_payload);
        $jwt_payload = $populated_ip->{jwt_payload};
        $jwt_payload->{ip} = 1;
        $intsig_input .= $populated_ip->{fullIP} . ':';
    }
    
    if ($token_policy->{co}) {
        $jwt_payload->{co} = 1;
        $intsig_input .= ($viewer_attributes->{co} // '') . ':';
        $jwt_payload->{co_fallback} = 1 if $token_policy->{co_fallback};
    }
    
    if ($token_policy->{cty}) {
        $jwt_payload->{cty} = 1;
        $intsig_input .= ($viewer_attributes->{cty} // '') . ':';
    }
    
    if ($token_policy->{reg}) {
        $jwt_payload->{reg} = 1;
        $intsig_input .= ($viewer_attributes->{reg} // '') . ':';
        $jwt_payload->{reg_fallback} = 1 if $token_policy->{reg_fallback};
    }
    
    if ($token_policy->{ssn}) {
        $jwt_payload->{ssn} = 1;
        if ($viewer_attributes->{sessionId}) {
            $self->_set_payload_ssn($viewer_attributes->{sessionId});
        } else {
            my $session = AWS::SecureMediaDelivery::Session->new(
                autogenerate => 1,
                length       => $token_policy->{session_auto_generate} || 12,
            );
            $self->_set_payload_ssn($session->id);
        }
        $intsig_input .= $self->payload_ssn . ':';
    }
    
    return {
        jwt_payload  => $jwt_payload,
        intsig_input => $intsig_input,
    };
}

sub _populate_exp {
    my ($self, $token_policy, $jwt_payload) = @_;
    
    my $exp = $token_policy->{exp};
    
    if ($exp =~ /^\+(\d+)([hm])$/) {
        my ($value, $unit) = ($1, $2);
        my $current_time = int(time());
        if ($unit eq 'h') {
            $jwt_payload->{exp} = $current_time + $value * 3600;
        } elsif ($unit eq 'm') {
            $jwt_payload->{exp} = $current_time + $value * 60;
        }
    } elsif ($exp =~ /^\d+$/) {
        my $parsed_exp = int($exp);
        croak "Invalid exp format: $exp" if $parsed_exp <= 0;
        $jwt_payload->{exp} = $parsed_exp;
    } else {
        croak "Invalid exp format: $exp";
    }
    
    return $jwt_payload;
}

sub _populate_jwt_payload {
    my ($self, $token_policy, $viewer_attributes, $jwt_payload, $playback_url_qs, $secret_alias) = @_;
    
    my $boolean_items = $self->_populate_boolean_items($token_policy, $viewer_attributes, $jwt_payload);
    $jwt_payload = $boolean_items->{jwt_payload};
    my $intsig_input = $boolean_items->{intsig_input};
    
    if ($token_policy->{headers} && @{$token_policy->{headers}}) {
        for my $header (@{$token_policy->{headers}}) {
            push @{$jwt_payload->{headers}}, $header;
            if ($viewer_attributes->{headers} && $viewer_attributes->{headers}->{$header}) {
                $intsig_input .= $viewer_attributes->{headers}->{$header} . ':';
            }
        }
    }
    
    if ($token_policy->{querystrings} && @{$token_policy->{querystrings}}) {
        for my $qs_param (@{$token_policy->{querystrings}}) {
            push @{$jwt_payload->{qs}}, $qs_param;
            my $qs_value = $playback_url_qs->{$qs_param} || 
                          ($viewer_attributes->{qs} && $viewer_attributes->{qs}->{$qs_param});
            $intsig_input .= ($qs_value // '') . ':' if $qs_value;
        }
    }
    
    if ($intsig_input) {
        $intsig_input =~ s/:$//;
        $self->_debug_log("Input for internal signature: $intsig_input");
        $jwt_payload->{intsig} = $self->_sign($intsig_input, $secret_alias->{value}, 'sha256');
    } else {
        delete $jwt_payload->{intsig};
    }
    
    $jwt_payload->{paths} = $token_policy->{paths} || [];
    $jwt_payload->{exc} = $token_policy->{exc} if $token_policy->{exc};
    $jwt_payload->{nbf} = int($token_policy->{nbf}) if $token_policy->{nbf};
    
    $jwt_payload = $self->_populate_exp($token_policy, $jwt_payload);
    
    return $jwt_payload;
}

sub _debug_log {
    my ($self, $message) = @_;
    print STDERR "[DEBUG] Token: $message\n" if $self->debug;
}

__PACKAGE__->meta->make_immutable;

=head1 SEE ALSO

L<AWS::SecureMediaDelivery::Secret>, L<AWS::SecureMediaDelivery::Session>

=head1 AUTHOR

Amazon Web Services <aws-solutions@amazon.com>

=head1 LICENSE

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0

=cut

1;
