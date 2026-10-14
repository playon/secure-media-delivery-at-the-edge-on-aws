# CTA-5007-B Secure Media Delivery

COSE MAC0 / CWT token-based content protection for Amazon CloudFront, implementing the CTA-5007-B Common Access Token specification.

## Features

- **Spec-compliant tokens**: COSE MAC0 structure with HMAC-SHA256, validated by CloudFront Functions `cf.cwt.validateToken()`
- **Multi-language SDKs**: Node.js, Python, and Ruby — all produce byte-identical tokens
- **Path-based token delivery**: `/{TOKEN}/video/stream.m3u8` with automatic token stripping at the edge
- **Client-side token renewal**: Player swaps expired path tokens for fresh ones without interrupting playback
- **Session revocation**: Instant token blocking via CloudFront KeyValueStore
- **IP and country restrictions**: Enforced at the edge using `event.viewer.ip` and `CloudFront-Viewer-Country`
- **Interactive demo**: Aura-styled website with HLS.js + DASH.js players, token generation, renewal, and revocation
- **Real-time log analysis**: Kinesis Data Stream → Lambda → Bedrock Nova Lite for AI-powered session anomaly detection
- **Auto-revocation**: Suspicious sessions flagged by Bedrock are automatically revoked in CloudFront KeyValueStore
- **Revocation dashboard**: Aura-styled dashboard showing revoked sessions with editable Bedrock analysis prompts
- **KVS cleanup**: Scheduled Lambda purges expired revocation entries from KeyValueStore

## Quick Start

```bash
cd source
npm install
npx cdk bootstrap    # First time only
npx cdk deploy CTASecureMedia -c enableDemo=true
```

The demo website URL and API endpoint are printed in the stack outputs.

## Architecture

```
Browser (HLS.js / DASH.js)
  │
  ├─ GET /{TOKEN}/video/stream.m3u8
  │     ↓
  │  CloudFront (default behavior)
  │     → CTA Validator Function (cf.cwt.validateToken)
  │        → Validates COSE MAC0 signature
  │        → Checks exp, catu (URI), catnip (IP), country
  │        → Checks revocation in KeyValueStore
  │        → Strips token from path → forwards to origin
  │
  ├─ POST /token (or /token-python, /token-ruby)
  │     ↓
  │  API Gateway → Lambda (Node/Python/Ruby)
  │     → Reads signing key from Secrets Manager
  │     → Builds CWT claims, generates COSE MAC0 token via SDK
  │     → Returns { token, signedUrl, expiresAt }
  │
  ├─ POST /revoke
  │     ↓
  │  API Gateway → Lambda
  │     → Writes revoked:{sessionId} to KeyValueStore
  │     → Edge enforcement within ~15 seconds
  │
  └─ Real-Time Log Pipeline
        CloudFront Real-Time Logs → Kinesis Data Stream
           → Lambda (kinesis_analyzer)
              → Aggregates session metrics
              → Sends to Bedrock Nova Lite/Pro for analysis
              → Auto-revokes flagged sessions in KVS

Dashboard (/website/dashboard.html)
  ├─ GET /revoked → Lists revoked sessions from KVS
  ├─ GET /prompt → Reads Bedrock analysis prompt from SSM
  └─ PUT /prompt → Updates Bedrock analysis prompt in SSM
```

## Token Structure

Tokens follow the COSE MAC0 / CWT structure per RFC 8152 and RFC 8392:

```
Tag(61) CWT {
  Tag(17) COSE_Mac0 {
    [ protectedHeaders, unprotectedHeaders, payload, hmacTag ]
  }
}
```

### CWT Claims

| Claim | Key | Description |
|-------|-----|-------------|
| `iss` | 1 | Issuer identifier |
| `exp` | 4 | Expiration (Unix timestamp) |
| `nbf` | 5 | Not before (Unix timestamp) |
| `iat` | 6 | Issued at (Unix timestamp) |
| `cti` | 7 | Token ID (session ID for revocation) |
| `catu` | 401 | URI restrictions (path prefix matching) |
| `catnip` | 402 | IP restrictions (array of allowed IPs) |
| `catgeoiso3166` | 316 | Country restrictions (ISO 3166-1 codes) |

## SDKs

All three SDKs expose the same API and produce byte-identical COSE MAC0 tokens.

### Node.js

```javascript
const { CTAClient } = require('./sdk/javascript/cta-client');

const client = new CTAClient('CTASecureMedia');
await client.initSecretsManager();
await client.getSigningKeys();

const result = client.generateSignedUrl(
  'https://cdn.example.com/video/stream.m3u8',
  { paths: ['/video/'], ttl: '2h', sessionId: 'viewer-123' }
);
console.log(result.signedUrl);
```

Requires `cbor-x` for CBOR encoding.

### Python

```python
from cta_client import CTAClient

client = CTAClient('CTASecureMedia')
client.init_secrets_manager()
client.get_signing_keys()

result = client.generate_signed_url(
    'https://cdn.example.com/video/stream.m3u8',
    {'paths': ['/video/'], 'ttl': '2h', 'sessionId': 'viewer-123'}
)
print(result['signedUrl'])
```

Zero external dependencies — built-in CBOR encoder.

### Ruby

```ruby
require_relative 'cta_client'

client = CTA::Client.new('CTASecureMedia')
client.init_secrets_manager
client.get_signing_keys

result = client.generate_signed_url(
  'https://cdn.example.com/video/stream.m3u8',
  { 'paths' => ['/video/'], 'ttl' => '2h', 'sessionId' => 'viewer-123' }
)
puts result[:signed_url]
```

Zero external dependencies — uses `openssl` from stdlib.

## Token Generation API

All three Lambda endpoints accept the same request format:

```bash
curl -X POST https://<api-endpoint>/prod/token \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "paths": ["/video/"],
      "ttl": "2h",
      "placement": "path",
      "sessionId": "viewer-123",
      "ips": "203.0.113.50",
      "countries": ["us", "ca"]
    },
    "mediaUrl": "https://your-distribution.cloudfront.net/video/stream.m3u8"
  }'
```

**Endpoints:**
- `POST /token` — Node.js SDK
- `POST /token-python` — Python SDK
- `POST /token-ruby` — Ruby SDK
- `POST /revoke` — Token revocation

**Response:**
```json
{
  "token": "2D3YEYRDoQEF...",
  "signedUrl": "https://cdn/TOKEN/video/stream.m3u8",
  "expiresAt": 1776881062
}
```

## Token Renewal Flow

1. **Initial playback**: Player loads `/{TOKEN₁}/video/stream.m3u8`
2. **Renewal timer**: At 2/3 of TTL, player calls `POST /token` for a fresh token
3. **Token swap**: Player replaces the old path token with the new one in segment URLs
4. **Seamless playback**: No interruption — CloudFront validates the new token identically

## Session Revocation

```bash
curl -X POST https://<api-endpoint>/prod/revoke \
  -H "Content-Type: application/json" \
  -d '{"tokenId": "viewer-123", "reason": "manual"}'
```

The revocation propagates to CloudFront edge locations via KeyValueStore within ~15 seconds. Subsequent requests with the revoked session ID receive HTTP 401.

## CloudFront Distribution Layout

| Path | Behavior | Origin | Auth |
|------|----------|--------|------|
| `/website/*` | Static site + dashboard | S3 bucket | None |
| `/api/*` | API Gateway | REST API | None (CORS enabled) |
| `/*` (default) | Video content | HTTP origin | CTA Validator Function |

The demo website is at `/website/index.html` and the revocation dashboard is at `/website/dashboard.html`.

## Key Rotation

Scheduled rotation is **disabled by default**. Do not manually start rotation until the updated validators and mints are deployed together and the deployment checks below pass.

The Step Functions workflow uses one stable execution ARN as its rotation ID:

1. **Prepare:** atomically publish the new raw signing key at `key:default`, the old key at `key:previous` as `{"signingKey":"…","expiresAt":null}`, and ownership state at `key:rotation`. The mint still reads the old Secrets Manager `AWSCURRENT` version. Both keys validate; normal token expiry, revocation, and policy checks still apply.
2. **Wait for propagation:** wait at least 300 seconds, measured from confirmation of the atomic KVS update. This is a configured propagation allowance, **not an acknowledgement from every edge location**. Verify the allowance for each deployment before allowing rotation; increase it if needed.
3. **Promote:** create an idempotent `AWSPENDING` secret version, then move `AWSCURRENT` with the old version as an ownership guard. Confirm the new version before starting the overlap clock.
4. **Finalize overlap:** set the previous-key expiry to promotion confirmation + configured overlap + 60-second mint-cache allowance + 60-second in-flight allowance. Overlap must be at least 86400 seconds. At expiry, validators reject old-key signatures even if physical cleanup is delayed.
5. **Cleanup:** after the deadline, confirm the mint still uses the new version, remove the pending label, and atomically delete `key:previous` and remove signing material from active rotation state. A key-free completion tombstone prevents old execution retries from affecting later rotations.

Lambda mints refresh their signing key within **60 seconds** of a fetch starting, including fetch latency. A failed refresh refuses to mint with stale cached material. Supported TTLs are positive integer seconds or integer `s/m/h/d` durations, up to **86400 seconds (1 day)**; only an omitted TTL defaults to `2h`.

### Failure recovery and deployment gate

- Deploy validators and mints before changing rotation behavior. Keep existing EventBridge rotation rules disabled during rollout; applying these changes sets the schedule disabled unless explicitly opted in. Do not invoke the old `{rotate:true}` Lambda interface.
- Inventory legacy/custom issuer TTLs. Previously issued tokens longer than one day must expire before the first rotation, or the configured overlap must cover their maximum remaining lifetime. All continuing issuers must comply with the supported TTL/cache bounds.
- Verify old- and new-key requests through the actual CloudFront distribution, warm mint refresh, original token expiry, revocation/policy checks, and previous-key expiry/deletion. Local cryptographic tests do not prove AWS edge propagation.
- Redrive a failed Step Functions execution with its **same execution ARN**. Do not start a second rotation or overwrite KVS/secret state. CAS ownership rejects competing executions. Initial deployment sync skips an active rotation rather than resetting it.
- Before confirmed promotion, the previous-key deadline stays `null`, so a partial failure cannot expire the key still used by the mint. Resume the execution to finish promotion/finalization. After finalization, an interrupted cleanup does not extend signature acceptance; resume cleanup to physically delete the retained key.
- Rotation inputs, outputs, and logs contain no signing material. Do not enable SDK wire logging or print KVS/secret contents during troubleshooting.

Terraform controls: `rotation_enabled = false`, `rotation_overlap_seconds = 86400`, and `rotation_propagation_seconds = 300` by default. The monthly cadence applies only after opt-in.

Terraform removes full-line JavaScript comments from the uploaded validator, retaining readable source while leaving room for configured allowlists within CloudFront's 10 KiB limit.


## Real-Time Log Analysis (Auto-Revocation Stack)

An optional second CDK stack adds AI-powered session analysis:

1. CloudFront real-time access logs stream to Kinesis Data Streams
2. A Lambda consumer aggregates session metrics (IPs, countries, user agents, request rates)
3. Bedrock Nova Lite/Pro analyzes the metrics and flags suspicious sessions
4. Flagged sessions are automatically revoked in CloudFront KeyValueStore

The analysis prompt is editable via the revocation dashboard or the Prompt API (`GET/PUT /prompt`).

Deploy with:

```bash
npx cdk deploy --all -c enableAutoRevocation=true -c enableDemo=true
```

## KVS Cleanup

A scheduled Lambda runs hourly to purge expired revocation entries from KeyValueStore (default TTL: 24 hours).

## Stacks

| Stack | Description |
|-------|-------------|
| `CTASecureMedia` | Main stack: CloudFront, KVS, API Gateway, Lambdas, Secrets Manager, Kinesis, Step Functions |
| `CTAAutoRevocation` | Optional: Bedrock-powered Kinesis consumer, SSM prompt parameter, Prompt API |

## Requirements

- Node.js 22+
- AWS CDK v2.79.1+
- AWS account with CloudFront Functions CWT support
