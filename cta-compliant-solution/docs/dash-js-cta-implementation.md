# DASH.js CTA-WAVE Common Access Token Implementation

## Overview
DASH.js has native support for CTA-WAVE Common Access Token (CAT) as documented in [GitHub Issue #4395](https://github.com/Dash-Industry-Forum/dash.js/issues/4395).

## Token Workflow

### Initial Request
- Player starts with token in URL query parameter: `https://example.com/segment1.mp4?CAT=123456abc`
- Makes GET request without custom headers

### Token Renewal
- CDN sends new token via response header: `Common-Access-Token: 333xyz`
- Player extracts token from response header
- Switches to header-based authentication for subsequent requests

### Subsequent Requests
- Player adds header: `Common-Access-Token: 333xyz`
- CDN prioritizes request header over query parameter
- Query parameter ignored when header present

## Technical Requirements

### CORS Configuration
```
Access-Control-Expose-Headers: Common-Access-Token
```
Required for JavaScript to access the response header.

### Token Format
- Uses CBOR Web Token (CWT) format
- Includes expiration claim (`exp`)
- CDN handles renewal timing automatically

### Scope
- One token per host by default
- Path-specific tokens handled via token claims internally
- Player doesn't need to parse token contents

## Implementation Status
- Merged to `development` branch in March 2024
- Available in DASH.js v5.0.0+
- Basic implementation focused on header-based renewal workflow

## Comparison to CTA-5007-B
Both implementations use:
- CWT (CBOR Web Token) format
- Hybrid path → header token transition
- CDN-managed token renewal
- Same fundamental workflow

Key difference: CTA-WAVE vs CTA-5007-B specification compliance for token claims structure.
