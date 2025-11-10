# CTA-5007-B Native Secure Media Delivery

Pure implementation of CTA-5007-B Common Access Token specification for secure media delivery with AI-powered threat detection.

## Features

- **Native CWT**: Uses CloudFront's `cf.cwt` module for CBOR Web Token handling
- **CTA-5007-B Compliant**: Implements standardized claims (catu, catnip, catgeoiso3166)
- **AI-Powered Security**: Amazon Bedrock Nova for intelligent threat detection
- **Hybrid Token Renewal**: Path tokens transition to headers for streaming compatibility
- **Player Examples**: HLS.js and DASH.js integration examples included
- **Interactive Deployment**: Built-in wizard for easy configuration

## Quick Start

```bash
cd source
npm install
npm run wizard    # Interactive configuration
npx cdk deploy    # Deploy to AWS
```

## Deployment Wizard

The wizard will prompt you for:
- **Stack name** and AWS region
- **Demo website** deployment (optional)
- **Auto-revocation** with Bedrock Nova (optional)
- **Revocation frequency** (5m, 10m, 30m, 1h)
- **Bedrock model** (Nova Pro vs Nova Lite)

## Token Generation

Local token generation using signing keys from AWS Secrets Manager:

```javascript
const client = new CTAClient({
  region: 'us-east-1',
  secretName: 'cta-signing-keys'
});

const signedUrl = await client.generateSignedUrl({
  url: 'https://cdn.example.com/video/stream.m3u8',
  paths: ['/video/'],
  ttl: '2h',
  countries: ['us', 'ca'],
  clientCountry: 'us'
});

console.log(signedUrl);
```

## Token Renewal for Streaming

Solves the streaming player token renewal problem with hybrid approach:

1. **Initial Request**: `/{TOKEN}/content.m3u8` (path-based)
2. **Token Renewal**: CDN sends new token via `CTA-Common-Access-Token` response header
3. **Subsequent Requests**: Player uses header-based tokens for segments

### HLS.js Example
```javascript
const hls = new Hls({
  xhrSetup: function(xhr, url) {
    if (tokenManager.currentToken && !url.includes('TOKEN_PLACEHOLDER')) {
      xhr.setRequestHeader('CTA-Common-Access-Token', tokenManager.currentToken);
    }
  }
});

hls.on(Hls.Events.MANIFEST_PARSED, async () => {
  await tokenManager.refreshToken();
});
```

See `examples/hls-player-example.html` for complete implementation.

## Player Compatibility

- **HLS.js**: Custom implementation with hybrid token support
- **DASH.js**: Native CTA-WAVE support since v5.0.0 (similar workflow)
- **Native Players**: iOS/Android support via custom URL schemes

Documentation: `docs/dash-js-cta-implementation.md`

## Architecture

```
Demo Website → CloudFront → CTA Validator (cf.cwt + KV lookup)
                        ↓
SDK Client → Secrets Manager (fetch signing keys)
          ↓
Local Token Generation
                        ↓
EventBridge → Step Functions → Athena → Bedrock Nova → KeyValueStore
```

## CTA-5007-B Claims

| Claim | Code | Purpose |
|-------|------|---------|
| `catu` | 312 | URI restrictions |
| `catnip` | 311 | Network IP restrictions |
| `catgeoiso3166` | 316 | Country restrictions |
| `exp` | 4 | Token expiration |
| `cti` | 7 | Token ID (replay protection) |

## AI-Powered Security

Uses Amazon Bedrock Nova to analyze CloudFront logs for:
- Abnormal request patterns
- Geographic anomalies  
- Bot-like behavior
- Token sharing indicators
- Path enumeration attempts

Automatically revokes suspicious tokens via CloudFront KeyValueStore for instant edge blocking.

This solution is built from scratch for CTA-5007-B compliance without any legacy AWS-specific token format support.
