package CTAClient;

use strict;
use warnings;
use JSON;
use MIME::Base64 qw(encode_base64url decode_base64url);
use Digest::HMAC_SHA256 qw(hmac_sha256);
use Time::HiRes qw(time);
use URI;
use Paws;

=head1 NAME

CTAClient - CTA-5007-B Perl SDK for Local Token Generation

=head1 SYNOPSIS

    use CTAClient;
    
    my $client = CTAClient->new(
        stack_name => 'CTASecureMedia',
        region     => 'us-east-1'
    );
    
    $client->init_secrets_manager();
    $client->get_signing_keys();
    
    my $signed_url = $client->generate_signed_url(
        'https://cdn.example.com/video/stream.m3u8',
        {
            paths => ['/video/'],
            ttl   => '2h'
        },
        { country => 'us' }
    );

=cut

sub new {
    my ($class, %args) = @_;
    
    my $self = {
        stack_name      => $args{stack_name} || die "stack_name required",
        region          => $args{region} || 'us-east-1',
        keys            => undef,
        secrets_client  => undef,
    };
    
    return bless $self, $class;
}

sub init_secrets_manager {
    my ($self, %args) = @_;
    
    $self->{secrets_client} = Paws->service('SecretsManager',
        region => $self->{region},
        %args
    );
    
    return $self;
}

sub get_signing_keys {
    my ($self) = @_;
    
    die "Call init_secrets_manager() first" unless $self->{secrets_client};
    
    my $secret_name = $self->{stack_name} . '_CTAKey';
    
    eval {
        my $response = $self->{secrets_client}->GetSecretValue(
            SecretId => $secret_name
        );
        
        my $secret = decode_json($response->SecretString);
        
        $self->{keys} = {
            primary => {
                value => $secret->{signingKey},
                uuid  => 'primary'
            }
        };
    };
    
    if ($@) {
        die "Failed to get signing keys: $@";
    }
    
    return $self->{keys};
}

sub generate_cwt_token {
    my ($self, $policy, $viewer) = @_;
    
    die "No signing keys available. Call get_signing_keys() first" 
        unless $self->{keys};
    
    $viewer ||= {};
    my $now = int(time());
    
    # CTA-5007-B compliant claims
    my $claims = {
        4 => $now + $self->_parse_ttl($policy->{ttl} || '2h'), # exp
        5 => $now,  # nbf
        6 => $now   # iat
    };
    
    # URI restrictions (catu claim)
    if ($policy->{paths} && @{$policy->{paths}}) {
        $claims->{312} = {
            3 => { 1 => $policy->{paths}->[0] }
        };
    }
    
    # Country restrictions (catgeoiso3166 claim)
    if ($policy->{countries} && @{$policy->{countries}}) {
        $claims->{316} = $policy->{countries};
    }
    
    # Session ID for replay protection
    if ($policy->{sessionId}) {
        $claims->{7} = $policy->{sessionId}; # cti
    }
    
    # Create and sign token
    my $header = {
        alg => 'HS256',
        typ => 'CWT'
    };
    
    my $token = $self->_sign_token($header, $claims, $self->{keys}->{primary}->{value});
    
    return {
        token     => $token,
        claims    => $claims,
        expiresAt => $claims->{4}
    };
}

sub generate_signed_url {
    my ($self, $media_url, $policy, $viewer) = @_;
    
    my $result = $self->generate_cwt_token($policy, $viewer);
    my $token = $result->{token};
    
    # Apply token based on placement preference
    my $placement = $policy->{placement} || 'path';
    
    if ($placement eq 'query') {
        my $separator = ($media_url =~ /\?/) ? '&' : '?';
        return $media_url . $separator . "CAT=" . $token;
    }
    elsif ($placement eq 'header') {
        return {
            url     => $media_url,
            headers => { 'CTA-Common-Access-Token' => $token }
        };
    }
    else {
        # Default: path placement
        my $uri = URI->new($media_url);
        return $uri->scheme . '://' . $uri->host . '/' . $token . $uri->path . 
               ($uri->query ? '?' . $uri->query : '');
    }
}

sub _sign_token {
    my ($self, $header, $payload, $key) = @_;
    
    my $encoded_header = $self->_base64url_encode(encode_json($header));
    my $encoded_payload = $self->_base64url_encode(encode_json($payload));
    my $signing_input = $encoded_header . '.' . $encoded_payload;
    
    my $signature = hmac_sha256($signing_input, $key);
    my $encoded_signature = encode_base64url($signature);
    
    return $signing_input . '.' . $encoded_signature;
}

sub _parse_ttl {
    my ($self, $ttl) = @_;
    
    return $ttl if $ttl =~ /^\d+$/;
    
    if ($ttl =~ /^(\d+)([smhd])$/) {
        my ($value, $unit) = ($1, $2);
        
        my %multipliers = (
            s => 1,
            m => 60,
            h => 3600,
            d => 86400
        );
        
        return $value * ($multipliers{$unit} || 3600);
    }
    
    return 7200; # Default 2 hours
}

sub _base64url_encode {
    my ($self, $data) = @_;
    
    my $encoded = encode_base64url($data);
    $encoded =~ s/=+$//; # Remove padding
    
    return $encoded;
}

# Usage examples
our %EXAMPLES = (
    basic => {
        policy => { paths => ['/video/'], ttl => '2h' },
        viewer => { country => 'us' }
    },
    geo_restricted => {
        policy => { 
            paths     => ['/premium/'], 
            ttl       => '24h', 
            countries => ['us', 'ca'] 
        },
        viewer => { country => 'us' }
    },
    session_based => {
        policy => {
            paths     => ['/live/'],
            ttl       => '1h',
            sessionId => 'session-123'
        }
    }
);

1;

__END__

=head1 DESCRIPTION

CTAClient provides local CTA-5007-B compliant token generation for Perl applications.
Tokens are generated locally after fetching signing keys from AWS Secrets Manager.

=head1 METHODS

=head2 new(%args)

Creates a new CTAClient instance.

    my $client = CTAClient->new(
        stack_name => 'CTASecureMedia',
        region     => 'us-east-1'
    );

=head2 init_secrets_manager(%args)

Initializes AWS Secrets Manager client.

=head2 get_signing_keys()

Fetches signing keys from AWS Secrets Manager.

=head2 generate_cwt_token($policy, $viewer)

Generates a CTA-5007-B compliant token locally.

=head2 generate_signed_url($media_url, $policy, $viewer)

Generates a signed URL with embedded CTA token.

=head1 AUTHOR

Amazon Web Services

=head1 LICENSE

Apache 2.0

=cut
