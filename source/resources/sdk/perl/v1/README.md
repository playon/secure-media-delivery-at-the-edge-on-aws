# AWS Secure Media Delivery Perl SDK

Perl SDK for the Secure Media Delivery at the Edge on AWS Solution.

> **⚠️ Development Status**: This Perl SDK is currently under active development. While it provides full feature parity with the Node.js version, the **Node.js SDK is considered the most stable and production-ready** implementation at this time. Please use the Node.js SDK for production workloads until this Perl version reaches stable release.

## Installation

### From CPAN (when published)
```bash
cpan AWS::SecureMediaDelivery
```

### From Source
```bash
cd source/resources/sdk/perl/v1
perl Makefile.PL
make
make test
make install
```

## Quick Start

```perl
use AWS::SecureMediaDelivery::Secret;
use AWS::SecureMediaDelivery::Token;

# Initialize secret manager
my $secret = AWS::SecureMediaDelivery::Secret->new(
    stack_name => 'MyStack',
    ttl        => 300,
);
$secret->init_sm_client();

# Create token generator
my $token = AWS::SecureMediaDelivery::Token->new(secret => $secret);

# Define viewer attributes
my $viewer_attributes = {
    ip      => '192.168.1.1',
    co      => 'US',
    headers => {
        'user-agent' => 'Mozilla/5.0...',
        'referer'    => 'https://example.com',
    },
};

# Define token policy
my $token_policy = {
    ip      => 1,
    co      => 1,
    headers => ['user-agent', 'referer'],
    paths   => ['/video/'],
    exp     => '+2h',
};

# Generate signed URL
my $playback_url = 'https://example.cloudfront.net/video/stream.m3u8';
my $signed_url = $token->generate($viewer_attributes, $playback_url, $token_policy);
print "Signed URL: $signed_url\n";
```

## Features

- **Moose-based OOP**: Modern Perl object-oriented programming
- **Comprehensive POD**: Full documentation with perldoc
- **CPAN-ready**: Standard Perl module structure
- **AWS Integration**: Uses Paws for AWS API calls
- **JWT Support**: Crypt::JWT for token generation
- **IP Validation**: Net::IP for IPv4/IPv6 handling

## Modules

### AWS::SecureMediaDelivery::Secret
Manages cryptographic secrets for token signing.

### AWS::SecureMediaDelivery::Token
Generates JWT tokens with various security policies.

### AWS::SecureMediaDelivery::Session
Manages session revocation and tracking.

## Examples

See the `examples/` directory for comprehensive usage examples.

## Documentation

Full documentation is available via perldoc:

```bash
perldoc AWS::SecureMediaDelivery
perldoc AWS::SecureMediaDelivery::Secret
perldoc AWS::SecureMediaDelivery::Token
perldoc AWS::SecureMediaDelivery::Session
```

## Requirements

- Perl 5.14+
- Paws (AWS SDK for Perl)
- Moose
- Crypt::JWT
- Net::IP
- JSON

## Testing

```bash
make test
```

## License

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
