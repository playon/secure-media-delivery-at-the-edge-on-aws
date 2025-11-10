# CTA-5007-B Perl SDK

Local token generation SDK for CTA-5007-B Common Access Token specification.

## Installation

```bash
# Install required CPAN modules
cpan install JSON MIME::Base64 Digest::HMAC_SHA256 Time::HiRes URI Paws
```

## Usage

```perl
use CTAClient;

# Initialize client
my $client = CTAClient->new(
    stack_name => 'CTASecureMedia',
    region     => 'us-east-1'
);

# Setup AWS connection
$client->init_secrets_manager();
$client->get_signing_keys();

# Generate signed URL
my $signed_url = $client->generate_signed_url(
    'https://cdn.example.com/video/stream.m3u8',
    {
        paths => ['/video/'],
        ttl   => '2h',
        countries => ['us']
    },
    { country => 'us' }
);

print "Signed URL: $signed_url\n";
```

## Token Policies

### Basic Protection
```perl
{
    paths => ['/video/'],
    ttl   => '2h'
}
```

### Geographic Restrictions
```perl
{
    paths     => ['/premium/'],
    ttl       => '24h',
    countries => ['us', 'ca', 'gb']
}
```

### Session-based
```perl
{
    paths     => ['/live/'],
    ttl       => '1h',
    sessionId => 'user-session-123'
}
```

## Token Placement

- **Path** (default): `/{TOKEN}/video/stream.m3u8`
- **Query**: `/video/stream.m3u8?CAT={TOKEN}`
- **Header**: `CTA-Common-Access-Token: {TOKEN}`

## Examples

Run the example script:
```bash
perl example.pl
```

## Dependencies

- JSON
- MIME::Base64
- Digest::HMAC_SHA256
- Time::HiRes
- URI
- Paws (AWS SDK for Perl)

## CTA-5007-B Compliance

This SDK generates tokens compliant with the CTA-5007-B specification:
- Uses CBOR Web Token (CWT) format
- Implements standardized claims (catu, catnip, catgeoiso3166)
- HMAC-SHA256 signing
- Local token generation for performance
