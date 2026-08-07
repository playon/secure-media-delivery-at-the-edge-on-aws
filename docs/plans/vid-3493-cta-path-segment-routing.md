# VID-3493 — Path-segment CTA transport on a multi-behavior distribution

Last updated: 2026-08-07
Status: Design — pending review

## Problem

CTA-5007-B lets a token ride in one of three transports on a request:

1. Query — `/foo.m3u8?CAT=<token>`
2. Header — `CTA-Common-Access-Token: <token>`
3. Path segment — `/<token>/foo.m3u8`

Query works today. Header triggers CORS preflight per request and can't be
set on native `<video src="…">` players. Path-segment 403s on
`hls.bcast.nfhsnetwork.com`, and this doc is about how to enable it.

## Why path-segment matters

Reference-solution author's position (2026-08 meeting): **path-segment
is the expected usage**; query-string transport carries substantial
overhead in real deployments. The specific overheads worth being honest
about:

- **Cache-key/auth-bypass hazard.** If `CAT` isn't in the cache-key
  policy, a valid-token success caches under the bare URI and a
  tokenless viewer requesting the same path gets that success — a
  documented leak (§1a leak #3 of the meeting brief). If `CAT` *is* in
  the cache-key policy, every viewer's token fragments the cache and
  hit rate collapses. Path-segment tokens naturally participate in the
  cache key without operator vigilance.
- **URL construction fragility.** Appending `?CAT=` to URLs that
  already carry query strings needs care in every client. Path-segment
  is invariant.
- **Intermediary behavior.** Some middleware strips query strings for
  privacy or normalizes them for caching. Path is more resilient.
- **Analytics/log-line bloat.** CATs run ~500 bytes; every log line
  carries them if they're in the query string.
- **Semantic fit.** Query-string tokens read as "URL parameters"
  (session-like, freely rotatable); path-segment tokens read as "part
  of the resource identity." The latter matches CTA-5007-B's model.

## Why path-segment breaks on hls.bcast

`hls.bcast` is a **multi-behavior** distribution:

| Cache behavior | Origin |
|---|---|
| `/broadcast/*` | playlist-lambda (dynamic manifests) |
| Default `*` | S3 (segments served as objects) |

CloudFront picks the cache behavior from the **original** request URI —
**before** any viewer-request function runs. A request for
`/<token>/broadcast/{bkey}/720p30/live.m3u8` matches the default
behavior, not `/broadcast/*`. The validator can strip the token in
viewer-request, but the routing decision is already made — the request
is destined for S3, which doesn't have a dynamically-generated playlist
to serve. 403.

Two CloudFront primitives shape the option space:

- **Cache-behavior path patterns are strict-suffix wildcards.** You can
  say `/broadcast/*` or `/cta/*` but not `/*/broadcast/*`. A
  variable-length token prefix at position 0 breaks pattern matching.
- **CloudFront Functions cannot change origin.** `event.request`
  exposes `.uri`, `.querystring`, `.headers`, `.method`, `.cookies` —
  no `.origin`. Only Lambda@Edge origin-request can reroute across
  origins.

Everything below works around these two facts.

## Recommended: Option A — `/cta/*` behavior + Lambda@Edge origin router

**Shape.** Client sends `/cta/<token>/broadcast/…` and
`/cta/<token>/<bkey>/…`. Add one `/cta/*` cache behavior.

**Wiring.**
1. **Viewer-request CF Function** — validator: parse `<token>` from URI,
   validate, strip `/cta/<token>` from `event.request.uri`. Downstream
   gates (DMA, UA allowlist) evaluate against the stripped URI.
2. **Origin-request Lambda@Edge** — inspect the stripped URI. If it
   starts with `/broadcast/`, set `event.Records[0].cf.request.origin`
   to the playlist-lambda origin; otherwise the S3 origin.

**Why this works.**
- Fixed literal `/cta/` prefix makes routing deterministic.
- CF Function URI rewrite happens *before* cache lookup, so cache keys
  use the stripped URI. Tokens don't fragment the cache; multi-transport
  clients (query + path-segment) can even share cache entries.
- Direct-to-S3 segment serving is preserved via Lambda@Edge
  origin-selection — segments don't traverse an extra hop.

**Cost, honestly.**
- Lambda@Edge origin-request adds latency **only on cache miss**. For
  live streaming with wide fan-out, segment cache hit rate is high
  (typically >95%); the Lambda@Edge tax is on <5% of segment requests.
  Warm invocations 5–15 ms, cold starts 50–100 ms per PoP per version.
- Lambda@Edge deploys are slower to propagate globally (minutes) and
  versions pin by ARN. Rollback is deliberate, not instant.
- Cache-key policy for `/cta/*` needs to match the underlying behaviors'
  policies so the shared-cache-across-transports property actually
  holds. Sanity-check with real traffic during soak.

**Effort.** ~2 weeks.
- New Lambda@Edge function + IAM + tests
- Validator update to parse and strip `/cta/<token>/`
- New `/cta/*` behavior in TF (both `secure-media-delivery-at-the-edge-on-aws`
  and `terraform-aws-cta-secure-media`)
- CircleCI + staged rollout on stage + 24 h soak
- Docs + client integration example

**Rollout plan.**
1. Deploy Option A to stage behind `enable_path_segment_transport = false`.
2. Flip the flag on stage; measure segment latency and cache hit rate
   for 24 h. No client traffic yet.
3. Migrate one internal test client to `/cta/<token>/…`; validate all
   three players (hls.js, iOS Safari native, Android ExoPlayer).
4. Prod deploy behind the same flag; flip after a second stage soak.
5. Migrate real clients one at a time. `?CAT=` remains as fallback
   until all clients cut over.
6. Deprecate `?CAT=` support in a later ticket once traffic is <1%.

## Alternatives considered

### Option B — router lambda behind `/cta/*`

Same client shape as A. `/cta/*` behavior points at a single lambda
that fetches from the right upstream after stripping the token.

**Rejected because:** every request pays an extra HTTP hop (CF →
router → playlist-lambda or S3). Segments today serve direct from S3
with sub-30 ms end-to-end; adding a lambda hop is a step back. Also
adds a new service to run, monitor, and secure.

### Option C — deprecate path-segment; ship only query

Keep `?CAT=<token>`; document path-segment as unsupported.

**Rejected because:** the meeting made clear that the reference-solution
author considers query overhead substantial and path-segment the
intended usage. C also fixes the ergonomics on hls.bcast only —
partners installing the whitelabel module would inherit the same
compromise indefinitely. The cache-key hazard alone (§1a leak #3) is a
recurring footgun in query-transport deployments.

### Option D — collapse hls.bcast to single-behavior

Restructure so playlist-lambda serves manifests directly and
proxies-through to S3 for segments. Everything runs through
`/broadcast/*`. Path-segment becomes trivial.

**Rejected because:** every segment request now traverses
playlist-lambda instead of hitting S3 direct — lambda cost + latency
added to the hot path for *all* traffic, not just CTA traffic. Also
touches more than the security stack and needs cross-team sign-off.
~3–4 weeks vs A's ~2. Worse cost profile, more coordination.

### Option E — token at position 2 of the URL, no Lambda@Edge

Insert token at position 2: `/broadcast/<token>/{bkey}/…` for
playlists, `/<bkey>/<token>/…` for segments. Both shapes route to
their existing behavior — the routing decision is preserved because
the token isn't at position 0. Validator strips in viewer-request.

**Rejected because:**
- Playlist-lambda has to know the token at render time so it can embed
  it at position 2 of every child segment reference. That couples the
  token machinery to playlist-lambda in a way A doesn't.
- URL shapes diverge: token position is "after `/broadcast/`" for
  playlists but "after `/{bkey}/`" for segments. Ugly for partners
  writing clients from scratch; doesn't match the reference solution's
  uniform shape.
- Only works on hls.bcast — partners with different URL shapes can't
  reuse the pattern.

Effort would be lower (~1 week, no Lambda@Edge), but the shape debt
isn't worth the savings.

## Cache-key composition

Independent of the routing choice, cache-key policy for the `/cta/*`
behavior must be set intentionally:

- **URI (rewritten):** by the time cache lookup happens, viewer-request
  has stripped the token. Cache keys naturally use the untokenized URI.
- **Country/metro headers:** needed for the DMA gate. Two viewers with
  different metro codes must not share a cache entry — one might be
  blackout-blocked.
- **Query strings:** don't include `CAT` — path-segment doesn't use
  query. Include only what origin needs (nothing today).
- **Headers:** don't include `Authorization` unless we're mirroring
  header-transport support.

Sanity check during soak: pull cache-hit-rate metrics and confirm
they match the underlying `/broadcast/*` and default behaviors within
5 percentage points. Larger deviation means the cache-key policy is
wrong.

## What we're deliberately not deciding here

- **Whether to keep `?CAT=` at all long-term.** Keep it during
  rollout; deprecate in a follow-up ticket once path-segment adoption
  is proven.
- **Header transport support.** Neither this ticket nor VID-3492 does
  anything for header transport. Same rationale: not required, has real
  cost (CORS preflight, native-player limits).

## Open questions for review

1. Does the Lambda@Edge cold-start profile matter enough to prefer
   Option E's playlist-lambda coupling instead? My read is no —
   cold starts hit <1% of segment requests on a well-cached broadcast
   and only during deploy churn — but if we can measure this on stage
   before committing, that's the honest answer.
2. Is a single `/cta/*` prefix acceptable, or should we scope it
   further (e.g., `/cta/v1/*`)? Versioning would make future breaking
   changes easier; adds one path segment to every URL.
3. Rollout gate: which internal client migrates first? nfhs-player
   web is the natural pick — hls.js can construct any URL shape
   trivially. iOS/Android native players second, after we prove
   URL-cascade behavior on native players.
