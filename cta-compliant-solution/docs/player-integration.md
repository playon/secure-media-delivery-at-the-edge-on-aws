# Player Integration

This solution supports multiple video players. See the dedicated guides:

- **[HLS.js Integration](hlsjs-integration.md)** — Path-based tokens with client-side renewal via `xhrSetup`. Working demo included.
- **[DASH.js Integration](dashjs-integration.md)** — Native CTA-WAVE support in v5.0.0+ with automatic header-based renewal.

## Quick Comparison

| Feature | HLS.js | DASH.js |
|---------|--------|---------|
| Token delivery | Path segment | Query param or path |
| Renewal method | Client-side API call + path swap | Automatic via response header |
| CTA-WAVE native | No (manual integration) | Yes (v5.0.0+) |
| CORS preflight | Not needed (path-based) | Required (header-based) |
| Demo included | ✅ | No |

## Native Players

Native HLS/DASH players (AVPlayer, ExoPlayer) cannot intercept segment requests. Options:

1. **Long-lived tokens** — TTL covers the entire session
2. **Server-side proxy** — Backend refreshes tokens transparently
3. **Signed cookies** — CloudFront signed cookies as an alternative to path tokens

## Token Format

All players receive the same COSE MAC0 / CWT token. The token is opaque to the player — no client-side parsing is needed. See the [README](../README.md) for token structure details.
