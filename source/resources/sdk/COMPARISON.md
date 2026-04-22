# SDK Comparison Guide

This document compares all available SDKs for the Secure Media Delivery at the Edge solution.

## SDK Status Overview

| Language | Status | Stability | Recommended Use |
|----------|--------|-----------|-----------------|
| **Node.js** | ✅ Stable | 🟢 Production Ready | ✅ Production workloads |
| **Python** | 🚧 Development | 🟡 Feature Complete | ⚠️ Development/Testing only |

> **For production workloads, use the Node.js SDK until other versions reach stable release.**

## Basic Usage Comparison

### Token Generation

#### Node.js
```javascript
const awsSMD = require("aws-secure-media-delivery");

const secret = new awsSMD.Secret('MyStack', 300);
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

secret = Secret('MyStack', 'us-east-1')
token = Token(secret)

signed_url = token.generate(
    {"ip": "192.168.1.1", "co": "US"},
    "https://example.cloudfront.net/video/stream.m3u8",
    {"ip": True, "co": True, "paths": ["/video/"], "exp": "+2h"}
)
```

## Key Differences

| Feature | Node.js | Python |
|---------|---------|--------|
| **Async Pattern** | Promises | async/await |
| **Booleans** | true/false | True/False |
| **Package Manager** | npm | pip |
| **Memory Usage** | ~50-100MB | ~60-120MB |
| **Cold Start** | ~100-200ms | ~200-400ms |

## Installation

| Language | Installation Command |
|----------|---------------------|
| **Node.js** | `npm install aws-secure-media-delivery` |
| **Python** | `pip install aws-secure-media-delivery` |

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

Both SDKs provide identical functionality - the choice depends on your environment, performance requirements, and development preferences.
