# DASH.js CTA-WAVE Integration Guide

## Overview

[DASH.js](https://github.com/Dash-Industry-Forum/dash.js) v5.0.0+ has **native** support for CTA-WAVE Common Access Token as documented in [GitHub Issue #4395](https://github.com/Dash-Industry-Forum/dash.js/issues/4395).

Unlike HLS.js (which requires manual `xhrSetup` integration), DASH.js handles the token lifecycle automatically.

## Native Token Flow

### 1. Initial Request — Query Parameter

The player starts with the token in a query parameter:

```
https://cdn.example.com/video/manifest.mpd?CAT={TOKEN}
```

### 2. Token Renewal — Response Header

When the CDN detects the token is near expiry, it returns a renewed token in the response header:

```
Common-Access-Token: {NEW_TOKEN}
```

### 3. Subsequent Requests — Request Header

The player extracts the renewed token and sends it as a request header on all subsequent requests:

```
Common-Access-Token: {NEW_TOKEN}
```

The CDN prioritizes the request header over the query parameter.

## CORS Configuration

For the browser to read the renewal token from the response header, CloudFront must expose it:

```
Access-Control-Expose-Headers: Common-Access-Token
```

This solution's CloudFront Function validator includes CORS preflight handling that returns the appropriate headers for OPTIONS requests.

## Using with This Solution

### Option A: Query Parameter Placement

Generate tokens with `placement: "query"`:

```bash
curl -X POST https://<api-endpoint>/prod/token \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "paths": ["/video/"],
      "ttl": "2h",
      "placement": "query",
      "sessionId": "viewer-123"
    },
    "mediaUrl": "https://cdn.example.com/video/manifest.mpd"
  }'
```

Response:
```json
{
  "signedUrl": "https://cdn.example.com/video/manifest.mpd?CAT={TOKEN}",
  "token": "{TOKEN}",
  "expiresAt": 1776881062
}
```

Load in DASH.js:

```javascript
const player = dashjs.MediaPlayer().create();
player.initialize(videoElement, signedUrl, true);
// DASH.js handles renewal automatically via response headers
```

### Option B: Path-Based Placement

For path-based tokens (same as HLS.js), use DASH.js request interceptors:

```javascript
const player = dashjs.MediaPlayer().create();

player.extend('RequestModifier', function () {
    return {
        modifyRequestURL: function (url) {
            if (currentToken) {
                const u = new URL(url);
                const parts = u.pathname.split('/');
                if (parts[1] && parts[1].length > 50) {
                    parts[1] = currentToken;
                    return `${u.origin}${parts.join('/')}${u.search}`;
                }
            }
            return url;
        }
    };
});
```

## Compatibility

| Feature | DASH.js Native | Path-Based (Manual) |
|---------|---------------|-------------------|
| Token delivery | Query param → Header | Path segment |
| Renewal | Automatic (response header) | Manual (API call + swap) |
| CORS required | Yes (`Expose-Headers`) | No |
| CDN cache efficiency | Better (shared URLs) | Per-viewer URLs |
| Setup complexity | Minimal | Moderate |

## Comparison: CTA-WAVE vs CTA-5007-B

Both specifications use CBOR Web Tokens (CWT) with COSE MAC0 structure. The key differences:

| Aspect | CTA-WAVE (DASH.js native) | CTA-5007-B (this solution) |
|--------|--------------------------|---------------------------|
| Header name | `Common-Access-Token` | `CTA-Common-Access-Token` |
| Claim numbers | Varies by implementation | 401 (catu), 402 (catnip) |
| Renewal | CDN-initiated via response header | Client-initiated via API |
| Revocation | Not specified | KVS-based edge blocking |

This solution's CloudFront Function validator accepts tokens from both the `CTA-Common-Access-Token` header and URL path, making it compatible with both approaches.
