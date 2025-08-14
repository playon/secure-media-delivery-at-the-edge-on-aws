# SDK Comparison Guide

This document compares all available SDKs for the Secure Media Delivery at the Edge solution.

## SDK Status Overview

| Language | Status | Stability | Recommended Use |
|----------|--------|-----------|-----------------|
| **Node.js** | ✅ Stable | 🟢 Production Ready | ✅ Production workloads |
| **Python** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |
| **Ruby** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |
| **Go** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |
| **Java** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |
| **Perl** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |

> **For production workloads, use the Node.js SDK until other versions reach stable release.**

## Basic Usage Comparison

### Token Generation

#### Node.js
```javascript
const awsSMD = require("aws-secure-media-delivery");

const secret = new awsSMD.Secret('MyStack', 300);
secret.initSMClient();
const token = new awsSMD.Token(secret);

const signedUrl = await token.generate(
    { ip: "192.168.1.1", co: "US" },
    "https://example.cloudfront.net/video/stream.m3u8",
    { ip: true, co: true, paths: ["/video/"], exp: "+2h" }
);
```

#### Python
```python
from aws_secure_media_delivery import Secret, Token

secret = Secret(stack_name='MyStack', ttl=300)
secret.init_sm_client()
token = Token(secret)

signed_url = await token.generate(
    {"ip": "192.168.1.1", "co": "US"},
    "https://example.cloudfront.net/video/stream.m3u8",
    {"ip": True, "co": True, "paths": ["/video/"], "exp": "+2h"}
)
```

#### Ruby
```ruby
require 'aws_secure_media_delivery'

secret = AwsSecureMediaDelivery::Secret.new(stack_name: 'MyStack', ttl: 300)
secret.init_sm_client
token = AwsSecureMediaDelivery::Token.new(secret)

signed_url = token.generate(
  { ip: '192.168.1.1', co: 'US' },
  'https://example.cloudfront.net/video/stream.m3u8',
  { ip: true, co: true, paths: ['/video/'], exp: '+2h' }
)
```

#### Go
```go
import smd "github.com/aws-solutions/secure-media-delivery-go"

secret, _ := smd.NewSecretManager("MyStack", 5*time.Minute)
token := smd.NewTokenGenerator(secret)

signedURL, _ := token.Generate(ctx,
    &smd.ViewerAttributes{IP: "192.168.1.1", Country: "US"},
    "https://example.cloudfront.net/video/stream.m3u8",
    &smd.TokenPolicy{IP: true, Country: true, Paths: []string{"/video/"}, Exp: "+2h"}
)
```

#### Java
```java
import com.amazonaws.solutions.securemediadelivery.*;

SecretManager secret = new SecretManager("MyStack", Duration.ofMinutes(5));
TokenGenerator token = new TokenGenerator(secret);

CompletableFuture<String> signedUrl = token.generate(
    Map.of("ip", "192.168.1.1", "co", "US"),
    "https://example.cloudfront.net/video/stream.m3u8",
    Map.of("ip", true, "co", true, "paths", List.of("/video/"), "exp", "+2h")
);
```

#### Perl
```perl
use AWS::SecureMediaDelivery::Secret;
use AWS::SecureMediaDelivery::Token;

my $secret = AWS::SecureMediaDelivery::Secret->new(
    stack_name => 'MyStack', ttl => 300
);
$secret->init_sm_client();
my $token = AWS::SecureMediaDelivery::Token->new(secret => $secret);

my $signed_url = $token->generate(
    { ip => '192.168.1.1', co => 'US' },
    'https://example.cloudfront.net/video/stream.m3u8',
    { ip => 1, co => 1, paths => ['/video/'], exp => '+2h' }
);
```

## Key Differences

| Feature | Node.js | Python | Ruby | Go | Java | Perl |
|---------|---------|---------|------|----|----- |------|
| **Async Pattern** | Promises | async/await | Sync | Context | CompletableFuture | Sync |
| **Booleans** | true/false | True/False | true/false | true/false | true/false | 1/0 |
| **Package Manager** | npm | pip | gem | go get | Maven/Gradle | CPAN |
| **Memory Usage** | ~50-100MB | ~60-120MB | ~40-80MB | ~30-60MB | ~80-150MB | ~30-70MB |
| **Cold Start** | ~100-200ms | ~200-400ms | ~150-300ms | ~50-150ms | ~300-800ms | ~100-250ms |

## Installation

| Language | Installation Command |
|----------|---------------------|
| **Node.js** | `npm install aws-secure-media-delivery` |
| **Python** | `pip install aws-secure-media-delivery` |
| **Ruby** | `gem install aws-secure-media-delivery` |
| **Go** | `go get github.com/aws-solutions/secure-media-delivery-go` |
| **Java** | Add Maven/Gradle dependency |
| **Perl** | `cpan AWS::SecureMediaDelivery` |

## When to Use Each SDK

### Node.js ✅
- **Production applications**
- **AWS Lambda functions**
- **Fastest cold start times**
- **Most stable and tested**

### Python 🚧
- **Data science integrations**
- **Machine learning pipelines**
- **Django/Flask applications**
- **Development/testing only**

### Ruby 🚧
- **Rails applications**
- **Background job processing**
- **Thread-safe operations**
- **Development/testing only**

### Go 🚧
- **Cloud-native applications**
- **Kubernetes operators**
- **High-performance services**
- **Development/testing only**

### Java 🚧
- **Enterprise applications**
- **Spring Boot services**
- **Android applications**
- **Development/testing only**

### Perl 🚧
- **System administration**
- **Legacy system integration**
- **Text processing workflows**
- **Development/testing only**

## Common Token Policy

All SDKs support the same token policy structure:

```json
{
  "ip": true,
  "co": true,
  "headers": ["user-agent", "referer"],
  "paths": ["/video/", "/live/"],
  "exp": "+2h"
}
```

## Getting Started

1. **For Production**: Use the Node.js SDK
2. **For Development**: Choose your preferred language
3. **For Testing**: Any SDK provides full functionality
4. **For Migration Planning**: Test with your target language SDK

All SDKs provide identical functionality - the choice depends on your environment, performance requirements, and development preferences.
