# Player Integration Guide

## HLS.js (Implemented in Demo)

The demo website uses HLS.js with client-side token renewal via `xhrSetup`.

### Token Placement

Tokens are embedded in the URL path:

```
https://cdn.example.com/{TOKEN}/video/stream.m3u8
```

CloudFront Function strips the token before forwarding to origin. HLS.js resolves segment URLs relative to the manifest URL, so all segment requests inherit the token prefix automatically.

### Token Renewal

The player schedules renewal at 2/3 of the token TTL. On renewal:

1. Calls `POST /token` to get a fresh COSE MAC0 token
2. In `xhrSetup`, replaces the old token in the URL path with the new one
3. Playback continues without interruption

```javascript
const hls = new Hls({
    xhrSetup(xhr, url) {
        if (renewedToken) {
            // Replace old path token with renewed token
            const u = new URL(url);
            const parts = u.pathname.split('/');
            if (parts[1] && parts[1].length > 50) {
                parts[1] = renewedToken;
            }
            xhr.open('GET', `${u.origin}${parts.join('/')}`, true);
        }
    }
});
```

### Revocation Handling

When CloudFront returns HTTP 401 (expired, revoked, or IP-restricted), the player stops playback and displays the reason:

```javascript
hls.on(Hls.Events.ERROR, (_, d) => {
    if (d.response && d.response.code === 401) {
        hls.destroy();
        // d.response.text contains: "expired", "token_revoked", "ip_restricted", etc.
    }
});
```

## DASH.js

DASH.js v5.0.0+ has native CTA-WAVE Common Access Token support via [GitHub Issue #4395](https://github.com/Dash-Industry-Forum/dash.js/issues/4395).

### Native CTA-WAVE Flow

1. **Initial request**: Token in query parameter `?CAT={TOKEN}`
2. **Renewal**: CDN returns new token in `Common-Access-Token` response header
3. **Subsequent requests**: Player sends token in `Common-Access-Token` request header

### CORS Requirement

For header-based token delivery, the CDN must expose the token header:

```
Access-Control-Expose-Headers: Common-Access-Token
```

### Compatibility with This Solution

This solution's CloudFront Function validator supports both:
- **Path tokens**: `/{TOKEN}/video/...` (used by HLS.js demo)
- **Header tokens**: `CTA-Common-Access-Token` request header

DASH.js can work with either approach. For path-based tokens, use the same `xhrSetup` pattern as HLS.js. For header-based tokens, DASH.js handles the flow natively.

## Native Players (iOS/Android)

Native HLS players (AVPlayer on iOS, ExoPlayer on Android) cannot modify segment request URLs or headers after the manifest is loaded. Options:

1. **Long-lived tokens**: Use a TTL that covers the entire viewing session
2. **Server-side renewal**: Proxy through a backend that refreshes tokens
3. **Cookie-based auth**: Use CloudFront signed cookies instead of path tokens

## Token Format

All players receive the same COSE MAC0 / CWT token regardless of delivery method. The token is base64url-encoded and contains:

- Expiration time
- URI path restrictions
- Optional IP and country restrictions
- Session ID for revocation

The token is opaque to the player — no client-side parsing is needed.
