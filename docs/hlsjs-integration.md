# HLS.js CTA-5007-B Integration Guide

## Overview

This guide covers integrating CTA-5007-B token-based content protection with [HLS.js](https://github.com/video-dev/hls.js/). The demo website included in this solution provides a working reference implementation.

HLS.js supports request interception via `xhrSetup`, which allows token injection and renewal without modifying the library itself.

## Token Delivery: Path-Based

Tokens are embedded in the URL path as the first segment:

```
https://cdn.example.com/{TOKEN}/video/stream.m3u8
```

This approach works well with HLS because:
- HLS.js resolves segment URLs **relative to the manifest URL**, so all segment requests automatically inherit the token prefix
- No custom headers needed — avoids CORS preflight requests
- CloudFront Function strips the token before forwarding to origin

## Basic Setup

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<video id="video" controls></video>

<script>
const video = document.getElementById('video');
const signedUrl = 'https://cdn.example.com/{TOKEN}/video/stream.m3u8';

if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(signedUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = signedUrl;
}
</script>
```

This is sufficient for short-lived content where the token won't expire during playback.

## Token Renewal

For long-running streams or short TTLs, the player needs to swap expired tokens for fresh ones. The approach:

1. Schedule a renewal timer at 2/3 of the token TTL
2. Call the token generation API for a fresh token
3. In `xhrSetup`, replace the old path token with the new one

```javascript
let currentToken = null;  // Set after initial token generation
let tokenExpiry = 0;

// Schedule renewal at 2/3 of TTL
function scheduleRenewal(expiresAt) {
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    const renewIn = Math.max((ttl * 2 / 3) * 1000, 5000);
    setTimeout(renewToken, renewIn);
}

async function renewToken() {
    const resp = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            policy: { paths: ['/video/'], ttl: '2h', placement: 'path' },
            mediaUrl: 'https://cdn.example.com/video/stream.m3u8'
        })
    });
    const result = await resp.json();
    currentToken = result.token;
    tokenExpiry = result.expiresAt;
    scheduleRenewal(tokenExpiry);
}

const hls = new Hls({
    xhrSetup(xhr, url) {
        if (currentToken) {
            // Replace old path token with renewed token
            const u = new URL(url);
            const parts = u.pathname.split('/');
            if (parts[1] && parts[1].length > 50) {
                parts[1] = currentToken;
                xhr.open('GET', `${u.origin}${parts.join('/')}${u.search}`, true);
            }
        }
    }
});
```

### How Token Swap Works

When HLS.js loads the manifest from `/{OLD_TOKEN}/video/stream.m3u8`, it resolves segment URLs relative to that path. A segment like `url_0/segment.ts` becomes `/{OLD_TOKEN}/video/url_0/segment.ts`.

The `xhrSetup` hook intercepts every XHR request. It detects the old token (any first path segment longer than 50 characters) and replaces it with the current token. The request goes to CloudFront as `/{NEW_TOKEN}/video/url_0/segment.ts`.

## Revocation Handling

When CloudFront returns HTTP 401, the player should stop playback and inform the user:

```javascript
hls.on(Hls.Events.ERROR, (_, data) => {
    if (data.response && data.response.code === 401) {
        const reason = data.response.text || 'unauthorized';
        console.log('Access denied:', reason);
        // reason is one of: "expired", "token_revoked", "ip_restricted",
        //                    "uri_not_allowed", "missing_token"
        hls.destroy();
        video.pause();
    }
});
```

## Complete Example

See `source/resources/demo-website/index.html` for a full working implementation with:
- Token generation via API (Node.js, Python, or Ruby SDK)
- Automatic renewal with countdown timer
- Token swap in `xhrSetup`
- Revocation with error display
- Request logging

## Safari / Native HLS

Safari uses native HLS playback via `<video src="...">`. Since there's no `xhrSetup` equivalent:

- **Short sessions**: Use a TTL that covers the entire viewing session
- **Long sessions**: Use a server-side proxy that refreshes tokens, or use CloudFront signed cookies as an alternative

## Limitations

- **Token in URL**: The token is visible in the URL path. For additional security, use short TTLs with renewal.
- **IPv6 privacy extensions**: Browsers may use different IPv6 addresses for different requests. IP-restricted tokens may fail if the browser rotates its address. Consider omitting IP restrictions for browser-based playback.
- **Cached segments**: After revocation, segments already in the player's buffer continue playing. New segment requests are blocked within ~15 seconds (KVS propagation time).
