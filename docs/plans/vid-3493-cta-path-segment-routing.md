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
`hls.bcast.nfhsnetwork.com`, and this doc is about whether to fix that
and how.

## Why path-segment breaks on hls.bcast

`hls.bcast` is a **multi-behavior** distribution:

| Cache behavior | Origin |
|---|---|
| `/broadcast/*` | playlist-lambda (dynamic manifests) |
| Default `*` | S3 (segments served as objects) |

CloudFront picks the cache behavior from the **original** request URI —
**before** any viewer-request function runs. A request for
`/<token>/broadcast/{bkey}/720p30/live.m3u8` matches the default
behavior, not `/broadcast/*`. The validator function attached to the
default behavior can strip the token from `event.request.uri`, but the
routing decision is already made — the request is destined for S3,
which doesn't have a dynamically-generated playlist to serve. 403.

Two CloudFront primitives shape the option space:

- **Cache-behavior path patterns are strict-suffix wildcards.** You can
  say `/broadcast/*` or `/cta/*` but not `/*/broadcast/*`. The token's
  variable position makes it un-matchable by pattern.
- **CloudFront Functions cannot change origin.** The `event.request`
  object exposes `.uri`, `.querystring`, `.headers`, `.method`,
  `.cookies` — no `.origin`. Only Lambda@Edge origin-request can
  reroute across origins.

Everything below is a workaround for these two constraints.

## Options

### Option A — dedicated `/cta/*` behavior with Lambda@Edge origin router

**Shape.** Client sends `/cta/<token>/broadcast/…` and
`/cta/<token>/<bkey>/…`. Add one cache behavior with pattern `/cta/*`.

**Wiring.**
1. Viewer-request CF Function — validator: parse `<token>` from URI,
   validate, strip `/cta/<token>` from `event.request.uri`.
2. Origin-request Lambda@Edge — inspect the stripped URI. If it starts
   with `/broadcast/`, dispatch to playlist-lambda origin; otherwise
   dispatch to S3 origin.

**Pros.**
- Fully-realized path-segment transport. Any client that can construct
  a URL can use it.
- Native `<video src="…">` on iOS Safari works without a query string.
- Symmetric with the reference solution's intent.

**Cons.**
- **Lambda@Edge is the wrong tool for hot-path routing.** Regional
  execution (not edge PoP), cold starts, ~10–50 ms p50 vs sub-ms for
  CF Functions. Adds latency to every segment request.
- Lambda@Edge deploys are slow (up to 10 min to propagate globally)
  and painful to roll back — versions are pinned by ARN.
- Cache-key composition still needs care so per-token cache
  fragmentation doesn't tank hit rate. (Include the stripped URI, not
  the tokenized one.)
- More moving parts to reason about during on-call.

**Effort.** ~2 weeks. New Lambda@Edge function + TF wiring +
CircleCI + staged rollout + soak. Two repos affected
(`secure-media-delivery-at-the-edge-on-aws` and
`terraform-aws-cta-secure-media`).

### Option B — router lambda behind `/cta/*`

Same client shape as A. `/cta/*` behavior points at a single lambda
that fetches from the right upstream (playlist-lambda or S3) after
stripping the token. Effectively moves the origin-selection logic from
Lambda@Edge into a regional lambda function.

**Pros.** Simpler CloudFront config than A; one origin per behavior.

**Cons.**
- Every request goes through an extra HTTP hop (CF → router lambda →
  playlist-lambda or S3). Segments in particular are today served
  direct from S3 with minimal latency; routing them through a lambda
  is a step back.
- Same cache-fragmentation concern as A.
- Router lambda is a new service to run, monitor, and secure.

**Effort.** ~2–3 weeks. New service repo, deploy pipeline, IAM,
observability, plus the CloudFront + validator changes.

### Option C — deprecate path-segment; ship only query and header

Keep the current `?CAT=<token>` transport as the supported path.
Document header as available for MSE-based players that can set custom
headers. Document path-segment as unsupported on multi-behavior
distributions.

**Pros.**
- Zero engineering cost.
- Zero new moving parts on the hot path.
- Query transport already works on every player we care about,
  including iOS Safari native (query strings *do* work on
  `<video src="…?CAT=xyz">`).
- Client-side integration is already aligned on `?CAT=` per Slack
  thread with Ajay's team.

**Cons.**
- One documented transport we can't offer to partners with distributions
  shaped like ours. Reads as a footnote in partner-facing docs.
- If a future partner or client genuinely can't send query strings
  (rare — most inability-to-modify-URL scenarios also can't set the
  path either), we're back to designing this.

**Effort.** ~1 day. Documentation only — meeting brief §3 already
carries the technical narrative; ports into the whitelabel repo's README
and the CTA integration guide.

### Option D — collapse to single-behavior

Restructure `hls.bcast` so `/broadcast/*` (playlists) and `/{bkey}/*`
(segments) both flow through **one** cache behavior with **one** origin
in front. That origin becomes playlist-lambda-with-S3-passthrough —
playlist-lambda serves manifests directly, and for any other path
proxies to S3 and returns the response.

**Pros.**
- Path-segment transport becomes trivial (single behavior, validator can
  strip in viewer-request, done).
- Architecturally cleaner. Removes the special-case S3 default behavior.

**Cons.**
- Every segment request now traverses playlist-lambda instead of hitting
  S3 direct. Lambda cost + latency added to the hot path.
- Big refactor touching more than the security stack. Needs sign-off
  from anyone depending on the current behavior split.
- Doesn't help partners running their own distribution unless they
  adopt the same pattern.

**Effort.** ~3–4 weeks. Requires playlist-lambda enhancement (S3
passthrough), CloudFront restructure, and coordinated rollout so
segment traffic doesn't lose CloudFront-in-front caching semantics.

## Recommendation

**Ship Option C.** Deprecate path-segment as unsupported on
multi-behavior distributions; document `?CAT=` as the supported
transport for `hls.bcast`. Preserve VID-3492's Phase 1 work
(relative segment URIs) — that change is worth keeping regardless
because it also lets future single-behavior deployments use path-segment
without any further playlist-lambda changes.

**Revisit trigger.** If any of these becomes true, reopen this design:

- A named client needs path-segment specifically (they've said as much
  in writing).
- A partner adopting `terraform-aws-cta-secure-media` runs into
  path-segment friction on their own multi-behavior distribution and
  we can offer a supported pattern.
- The reference-solution meeting (2026-08 window) surfaces an approach
  we haven't found.

The rest of this doc keeps Option A written up for future-us if the
trigger fires.

## If we do build Option A — implementation sketch

Not the plan, but if we come back to it:

**Client URL shape:** `/cta/<token>/<original-path>`. Example:
`/cta/eyJhb.../broadcast/bdc123/720p30/live.m3u8`.

**Validator function** (viewer-request, CF Function). New URI-parsing
branch:

```js
// Path-segment token transport (VID-3493)
const CTA_URI_PREFIX = '/cta/';
if (uri.startsWith(CTA_URI_PREFIX)) {
  const rest = uri.slice(CTA_URI_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return respond(401, 'malformed_cta_uri');
  const token = rest.slice(0, slash);
  const stripped = rest.slice(slash); // includes leading '/'
  const claims = verifyToken(token);
  if (!claims) return respond(401, 'invalid_token');
  event.request.uri = stripped;
  // fall through — same downstream gates (DMA etc.) apply to `stripped`
}
```

**Origin-request Lambda@Edge** (new). Reads `event.Records[0].cf.request.uri`,
selects origin:

```js
if (request.uri.startsWith('/broadcast/')) {
  request.origin = { custom: { /* playlist-lambda origin config */ } };
  request.headers['host'] = [{ key: 'host', value: PLAYLIST_LAMBDA_HOST }];
} else {
  request.origin = { s3: { /* S3 origin config */ } };
  request.headers['host'] = [{ key: 'host', value: S3_HOST }];
}
```

**Cache-key policy** for `/cta/*` behavior: same as `/broadcast/*` and
default. Because `event.request.uri` is rewritten in viewer-request
*before* the cache lookup, CF's cache key uses the stripped URI —
tokens don't fragment the cache. Verify this empirically before rollout;
it's subtle and easy to break.

**Rollback plan.** Feature-flag the `/cta/*` behavior behind
`enable_path_segment_transport` in TF. Off in prod until soak passes.

## Decisions still open

None — this doc recommends C, which needs no further design. The
Option A sketch is future work if the trigger fires.
