// VID-3464: tests for the CTA validator CloudFront Function.
//
// The validator ships as a Terraform .js.tftpl template that's rendered
// at `terraform apply` time and uploaded as a CloudFront Function. To
// test it in Node we (a) render the template with fixture values, (b)
// stub the `cloudfront` ES-module import, and (c) load the resulting
// JS in a `vm` context so top-level state (compiled RegExp array, etc.)
// initializes per test.
//
// Only VID-3464-scoped behavior is covered — legacy-client allowlist,
// token_enforcement_mode dispatch. Full token/DMA coverage is left to
// staging smoke.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TEMPLATE_PATH = path.join(__dirname, '..', 'cta_token_validator.js.tftpl');

function render(overrides) {
  const defaults = {
    token_enforcement_mode: 'enforce',
    dma_enforcement_mode: 'off',
    legacy_client_allowlist_json: '[]',
    dma_bypass_allowlist_json: '[]',
  };
  const values = Object.assign({}, defaults, overrides || {});
  let src = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  for (const key of Object.keys(values)) {
    // ${var} → literal value (raw substitution matches templatefile()).
    src = src.split('${' + key + '}').join(values[key]);
  }
  return src;
}

// Load the rendered validator into a fresh vm context and return its
// handler. The `cf` import is replaced with a stub because CloudFront
// Functions ESM syntax isn't available in Node's CommonJS jest runner.
function loadValidator(rendered, kvsMap, opts) {
  const validateToken = (opts && opts.validateToken) || (() => { throw new Error('cwt_stub_called'); });
  const logs = [];
  const kvs = {
    get: async (key) => {
      if (!(key in kvsMap)) throw new Error('KeyNotFound');
      return kvsMap[key];
    },
  };
  const cfMock = {
    kvs: () => kvs,
    cwt: { validateToken },
  };

  // Strip the ESM `import cf from 'cloudfront'` — inject `var cf` before eval.
  const stripped = rendered.replace(/^import cf from 'cloudfront';?/m, '');
  const wrapped = `
    var cf = __cfMock;
    var Buffer = { from: (s) => s };
    ${stripped}
    module.exports = { handler };
  `;

  const module = { exports: {} };
  const context = vm.createContext({
    __cfMock: cfMock,
    module,
    console: { log: (...args) => logs.push(args.join(' ')) },
    Math,
    Date,
    RegExp,
    String,
    Error,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(wrapped, context);
  return { handler: module.exports.handler, logs };
}

function makeRequest({ uri = '/broadcast/abc/720p30/live.m3u8', userAgent = 'Mozilla/5.0', method = 'GET', pathToken, metroCode, extraHeaders } = {}) {
  const headers = {};
  if (userAgent !== null) {
    headers['user-agent'] = { value: userAgent };
  }
  if (metroCode !== undefined) {
    headers['cloudfront-viewer-metro-code'] = { value: String(metroCode) };
  }
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      // CF viewer-request lowercases header names; mirror that here so
      // tests reflect the actual runtime shape (validator does
      // `request.headers["x-nfhs-client-version"]`).
      headers[name.toLowerCase()] = { value };
    }
  }
  const finalUri = pathToken ? `/${pathToken}${uri}` : uri;
  return {
    request: {
      uri: finalUri,
      method,
      headers,
      querystring: {},
    },
    viewer: { ip: '127.0.0.1' },
  };
}

describe('CTA validator — VID-3464 UA allowlist', () => {
  test('empty allowlist forwards through to token validation (missing_token → 401 in enforce)', async () => {
    const { handler } = loadValidator(render({}), { 'key:default': 'test-signing-key' });
    const res = await handler(makeRequest());
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('allowlisted UA bypasses token validation and forwards request', async () => {
    const { handler } = loadValidator(
      render({ legacy_client_allowlist_json: '["^Roku/DVP-", "^NFHS Network/"]' }),
      {}
    );
    const rokuRes = await handler(makeRequest({ userAgent: 'Roku/DVP-15.2 (15.2.4.3450-H2)' }));
    expect(rokuRes.statusCode).toBeUndefined();
    expect(rokuRes.uri).toBe('/broadcast/abc/720p30/live.m3u8');

    const legacyAndroid = await handler(makeRequest({ userAgent: 'NFHS Network/1.11.7 (Linux;Android 9) AndroidXMedia3/1.7.1' }));
    expect(legacyAndroid.statusCode).toBeUndefined();
  });

  test('non-allowlisted UA still enforces token check', async () => {
    const { handler } = loadValidator(
      render({ legacy_client_allowlist_json: '["^Roku/DVP-"]' }),
      { 'key:default': 'test-signing-key' }
    );
    const res = await handler(makeRequest({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }));
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('missing User-Agent header is not an allowlist match', async () => {
    const { handler } = loadValidator(
      render({ legacy_client_allowlist_json: '["^.*"]' }),  // matches everything
      { 'key:default': 'test-signing-key' }
    );
    const res = await handler(makeRequest({ userAgent: null }));
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('regex escaping: pattern with . as literal (com.playon.nfhslive) does not match arbitrary chars', async () => {
    const { handler } = loadValidator(
      render({ legacy_client_allowlist_json: '["^com\\\\.playon\\\\.nfhslive/"]' }),
      {}
    );
    const good = await handler(makeRequest({ userAgent: 'com.playon.nfhslive/3.6.4' }));
    expect(good.statusCode).toBeUndefined();

    const bad = await handler(makeRequest({ userAgent: 'comXplayonXnfhslive/3.6.4' }));
    expect(bad.statusCode).toBe(401);
  });

  test('bad regex in allowlist is skipped at compile — handler still serves (no init crash)', async () => {
    // Terraform's regexall is RE2 (plan-time). JS RegExp differs; a
    // pattern that passes plan can still throw at CF Function init. If
    // we didn't guard, the throw would take out the whole handler and
    // every viewer request 5xxs. Test both: bad pattern doesn't crash,
    // and the good sibling still matches.
    const { handler, logs } = loadValidator(
      render({ legacy_client_allowlist_json: '["[unclosed-bracket", "^Roku/DVP-"]' }),
      {},
    );
    // Bad pattern was skipped at compile-time, log line emitted.
    expect(logs.some(l => l.includes('allowlist_pattern_compile_error') && l.includes('[unclosed-bracket'))).toBe(true);
    // Good sibling still works — handler didn't crash on init.
    const res = await handler(makeRequest({ userAgent: 'Roku/DVP-15.2' }));
    expect(res.statusCode).toBeUndefined();
  });
});

describe('CTA validator — VID-3464 token_enforcement_mode', () => {
  test('mode=log forwards request even when token is missing', async () => {
    const { handler } = loadValidator(render({ token_enforcement_mode: 'log' }), {});
    const res = await handler(makeRequest());
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });

  test('mode=off short-circuits before allowlist even runs', async () => {
    // Use an allowlist that DOES match the UA — if off bypasses first
    // we should NOT see the allowlist_bypass log line. If the code ever
    // reordered so the allowlist ran before the off short-circuit,
    // this test would emit the log line and fail.
    const { handler, logs } = loadValidator(
      render({
        token_enforcement_mode: 'off',
        legacy_client_allowlist_json: '["^match-anything"]',
      }),
      {}
    );
    const res = await handler(makeRequest({ userAgent: 'match-anything/1.0' }));
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
    expect(logs.some(l => l.includes('allowlist_bypass'))).toBe(false);
  });

  test('mode=log strips path token before forwarding when validation fails', async () => {
    // Regression: log mode was forwarding /<token>/broadcast/... to
    // origin on bad path tokens, causing 404s. Token must be stripped
    // BEFORE validation so failure-forwarding is safe.
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'log' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => { throw new Error('bad_signature'); } }
    );
    const req = makeRequest({ pathToken: 'x'.repeat(60), uri: '/broadcast/abc/720p30/live.m3u8' });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    // Path token stripped even though validation threw.
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });

  // VID-3493 (phase 2 of VID-3492): path-segment transport works on
  // hls.bcast only if the token cascades from the playlist URL to
  // segment requests via VID-3492's relative URIs. The validator has to
  // strip the token from BOTH playlist URIs (/broadcast/…) AND segment
  // URIs (/{bkey}/…/segs/…) so cache lookup + origin fetch see the
  // untokenized shape in either case.
  //
  // These tests lock in the segment-URI branch of that guarantee. The
  // existing tests above cover the playlist-URI branch.
  test('mode=log strips path token from segment URI before forwarding', async () => {
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'log' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => { throw new Error('bad_signature'); } }
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/bdc123/720p30/segs/bdc123_seg_000000.ts',
    });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/bdc123/720p30/segs/bdc123_seg_000000.ts');
  });

  test('mode=enforce strips path token from segment URI on valid token', async () => {
    const validPayload = {}; // no CATU / CATNIP / EXP claims → validateClaims is a no-op
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => ({ payload: validPayload }) }
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/bdc123/720p30/segs/bdc123_seg_000000.ts',
    });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/bdc123/720p30/segs/bdc123_seg_000000.ts');
  });

  test('mode=enforce rejects untokenized segment URI with 401 missing_token', async () => {
    // Untokenized segment request from a client that skipped the
    // playlist. Position-1 segment is the bkey (~13 chars) which is
    // below the extractPathToken length threshold — correctly not
    // detected as a token, so enforce rejects.
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' }
    );
    const req = makeRequest({ uri: '/bdc123/720p30/segs/bdc123_seg_000000.ts' });
    const res = await handler(req);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('mode=enforce rejects segment URI with invalid token — 401 bad_signature', async () => {
    // Security-relevant rejection path: enforce mode, token present
    // in the position-1 slot, signature check fails, segment URI.
    // Guarantees a forged token can't reach S3 via the segment
    // branch.
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => { throw new Error('bad_signature'); } }
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/bdc123/720p30/segs/bdc123_seg_000000.ts',
    });
    const res = await handler(req);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('bad_signature');
  });

  // ---------------------------------------------------------------------
  // CATU path-prefix asymmetry between playlist and segment URI shapes.
  //
  // The generator (cta_token_generator.js:108-110) mints CATU.PATH.PREFIX
  // whenever `policy.paths[0]` is set. The validator (line 95) checks it
  // against `request.uri` AFTER the token has been spliced out
  // (validator lines 151-153). That works for the playlist branch —
  // stripped URI is `/broadcast/{bkey}/…` and matches a claim of
  // `/broadcast/{bkey}/`. It does NOT work for the segment branch:
  // stripped URI is `/{bkey}/{variantId}/segs/…`, which never matches
  // `/broadcast/{bkey}/` and 401s with `uri_not_allowed`.
  //
  // The two tests below make the asymmetry explicit in the suite:
  //   * playlist baseline — passes, locks in the working behavior.
  //   * segment demonstration — fails today with uri_not_allowed. Held
  //     as a failing-behavior test (assertions match what the code
  //     actually does) so it flips to a pass exactly when the design
  //     fix lands. See VID-3493 follow-up for the design call:
  //     normalize segment URIs under /broadcast/ for the claim check,
  //     or dual-prefix CATU, or evaluate against the pre-strip URI.
  //
  // Blocks the VID-3493 TF path_pattern swap
  // (iac-tf-aws-project-video-common#45) — that's the change that
  // starts routing tokenized traffic through this validator in
  // earnest, so the segment 401 becomes a live incident there.
  test('mode=enforce accepts playlist URI when token carries a CATU path prefix', async () => {
    // CATU: "401", PATH: "2", PREFIX: "1" (see validator constants).
    const validPayload = {
      "401": { "2": { "1": "/broadcast/bdc123/" } },
    };
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => ({ payload: validPayload }) }
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/broadcast/bdc123/720p30/live.m3u8',
    });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/bdc123/720p30/live.m3u8');
  });

  test('mode=enforce rejects segment URI when token carries a /broadcast/ CATU prefix (demonstrates VID-3493 blocker)', async () => {
    // The stripped URI is `/bdc123/720p30/segs/…`. The CATU claim
    // is `/broadcast/bdc123/`. `startsWith` fails → uri_not_allowed
    // 401. This is the specific case that blocks the VID-3493
    // rollout: `cta_token_generator.js` mints this claim shape
    // whenever a policy path is set (which is the common case for
    // per-broadcast tokens), and after the TF path_pattern swap
    // every segment request through this validator will be
    // rejected.
    const validPayload = {
      "401": { "2": { "1": "/broadcast/bdc123/" } },
    };
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => ({ payload: validPayload }) }
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/bdc123/720p30/segs/bdc123_seg_000000.ts',
    });
    const res = await handler(req);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('uri_not_allowed');
  });

  test('mode=log strips ?CAT= query before forwarding when validation fails', async () => {
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'log' }),
      { 'key:default': 'signing-key' },
      { validateToken: () => { throw new Error('bad_signature'); } }
    );
    const evt = makeRequest();
    evt.request.querystring.CAT = { value: 'bad-token-value' };
    const res = await handler(evt);
    expect(res.statusCode).toBeUndefined();
    expect(res.request === undefined || !('CAT' in (res.querystring || {}))).toBe(true);
    // The mutated request object is what's forwarded — check its querystring.
    expect(res.querystring.CAT).toBeUndefined();
  });

  // VID-3462: cross-origin JS must be able to read the rejection status
  // + body. Without Access-Control-Allow-Origin on the validator-generated
  // response, browsers block JS from seeing the response at all (fetch
  // rejects opaquely, XHR body is unreadable) — so a client-side
  // HEAD-then-branch-on-451 check silently fails and falls back to a less
  // reliable path. The 200-success path already carries CORS from the
  // origin's response; the validator-generated 401/410/451 paths must
  // mirror it. Confirmed as a real gap during the VID-3462 client
  // integration on stage: enforce-mode 451 responses were opaque to the
  // client because ACAO was missing.
  test('mode=enforce rejection carries Access-Control-Allow-Origin so cross-origin JS can read it', async () => {
    const { handler } = loadValidator(render({}), { 'key:default': 'test-signing-key' });
    const res = await handler(makeRequest());
    expect(res.statusCode).toBe(401);
    expect(res.headers['access-control-allow-origin'].value).toBe('*');
  });

  test('mode=enforce blackout_dma 451 carries Access-Control-Allow-Origin', async () => {
    // Same CORS invariant applies to the DMA branch — a cross-origin
    // browser check for "am I blacked out?" reads the 451 status only if
    // the header is present.
    const { handler } = loadValidator(
      render({ token_enforcement_mode: 'off', dma_enforcement_mode: 'enforce' }),
      { 'blackout:abc': '524' },
    );
    const req = makeRequest();
    req.request.headers['cloudfront-viewer-metro-code'] = { value: '524' };
    const res = await handler(req);
    expect(res.statusCode).toBe(451);
    expect(res.body).toBe('blackout_dma');
    expect(res.headers['access-control-allow-origin'].value).toBe('*');
    expect(res.headers['cache-control'].value).toBe('no-store, max-age=0');
  });

  test('OPTIONS preflight still returns 204 + CORS headers (regression guard)', async () => {
    // The OPTIONS branch was the only place CORS lived pre-VID-3462; make
    // sure adding CORS to the reject path didn't inadvertently swap it in.
    const { handler } = loadValidator(render({}), {});
    const res = await handler(makeRequest({ method: 'OPTIONS' }));
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin'].value).toBe('*');
    expect(res.headers['access-control-allow-methods'].value).toBe('GET, HEAD, OPTIONS');
  });

  test('mode=enforce rejects with 401 on missing_token (default)', async () => {
    const { handler } = loadValidator(render({}), { 'key:default': 'test-signing-key' });
    const res = await handler(makeRequest());
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control'].value).toBe('no-store, max-age=0');
  });

});

describe('CTA validator — VID-3581 DMA-bypass allowlist', () => {
  const BLOCKED_METRO = 602; // Chicago in Nielsen DMAs
  const BLOCKED_KVS = { 'blackout:abc': '602,524' }; // abc is blacked out in Chicago and Atlanta

  test('empty dma_bypass_allowlist → matching viewer still gets 451', async () => {
    const { handler } = loadValidator(
      render({ dma_enforcement_mode: 'enforce', token_enforcement_mode: 'off' }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBe(451);
    expect(res.body).toBe('blackout_dma');
  });

  test('bypass-allowlisted UA in blocked metro forwards (skips DMA gate)', async () => {
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/", "^Roku/DVP-"]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471 (Apple TV; U; CPU OS 26_5)' }));
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
    // RegExp.source escapes '/' to '\/', so the pattern in the log line is the escaped form.
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit') && l.includes('broadcast=abc') && l.includes('pattern=^AppleCoreMedia\\/'))).toBe(true);
  });

  test('bypass-allowlisted UA in NON-blocked metro forwards, but bypass log is NOT emitted', async () => {
    // Log fires only when the bypass actually prevented a block —
    // rights-compliance wants "how many blocks did the bypass let
    // through", not "how many bypass-allowlisted requests happened."
    // A viewer in a non-blocked metro would have forwarded anyway;
    // no bypass audit event to record.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: 501, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(false);
  });

  test('non-bypass-allowlisted UA in blocked metro still gets 451', async () => {
    const { handler } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^Roku/DVP-"]', // only Roku bypasses; Apple does not
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBe(451);
  });

  test('dma_enforcement_mode=off short-circuits BEFORE bypass check (no bypass log)', async () => {
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'off',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBeUndefined();
    // No bypass hit log when DMA is entirely off — bypass check is nested inside checkDmaBlackout.
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(false);
  });

  test('log mode + bypass allowlisted UA + blocked metro → forwards, blackout_dma log NOT emitted', async () => {
    // Bypass short-circuits before the metro comparison, so the
    // per-request "would-have-been-blocked" log line doesn't fire for
    // this UA. The `dma_bypass_allowlist_hit` line replaces it as the
    // audit signal.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'log',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(true);
    expect(logs.some(l => l.includes('blackout_dma broadcast='))).toBe(false);
  });

  test('missing user-agent → does not match bypass allowlist (still 451)', async () => {
    const { handler } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^.*"]', // matches everything if UA present
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: null }));
    expect(res.statusCode).toBe(451);
  });

  test('bypass allowlist and legacy allowlist are independent — UA on legacy only still gets DMA', async () => {
    // Category: Roku bypasses TOKEN check (legacy) but is expected to
    // display blackout UI, so does NOT bypass DMA. Result: Roku in
    // blocked metro gets 451, not the token 401.
    const { handler } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'enforce',
        legacy_client_allowlist_json: '["^Roku/DVP-"]',
        dma_bypass_allowlist_json: '[]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'Roku/DVP-15.2 (15.2.4.3449-H0)' }));
    expect(res.statusCode).toBe(451);
    expect(res.body).toBe('blackout_dma');
  });

  test('bypass allowlist and legacy allowlist are independent — UA on both bypasses both', async () => {
    // Category: Apple TV bypasses BOTH — no token minter yet AND no
    // blackout UI yet. Forwards through everything.
    const { handler } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'enforce',
        legacy_client_allowlist_json: '["^AppleCoreMedia/"]',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS
    );
    const res = await handler(makeRequest({ metroCode: BLOCKED_METRO, userAgent: 'AppleCoreMedia/1.0.0.23L471' }));
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });
});

describe('CTA validator — path-token DMA-check regression (extractBroadcastId anchor)', () => {
  // VID-3581 follow-up: the DMA check runs BEFORE the path token is
  // stripped from the URI. `extractBroadcastId` used to require the URI
  // to START with `/broadcast/` — a path-token URI (`/<token>/broadcast/…`)
  // returned null there, and every path-token request silently skipped
  // the blackout gate. Verified against stage bdc2959b2cd02: header-token
  // requests logged blackout_dma correctly; a path-token curl to the same
  // broadcast in a blocked metro sailed through with 200.
  //
  // Fix: drop the ^ anchor on the extractBroadcastId regex so `/broadcast/`
  // matches anywhere in the URI. CTA tokens are base64url (no slashes),
  // so a token can never contain `/broadcast/` as a substring; safe.
  const BLOCKED_METRO = 602;
  const BLOCKED_KVS = { 'blackout:abc': '602,524' };

  test('path-token URI + blocked metro + non-bypass UA → 451 (regression: was 200)', async () => {
    const { handler } = loadValidator(
      render({ dma_enforcement_mode: 'enforce', token_enforcement_mode: 'enforce' }),
      { ...BLOCKED_KVS, 'key:default': 'signing-key' },
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/broadcast/abc/720p30/live.m3u8',
      metroCode: BLOCKED_METRO,
    });
    const res = await handler(req);
    expect(res.statusCode).toBe(451);
    expect(res.body).toBe('blackout_dma');
  });

  test('path-token URI + blocked metro + bypass-allowlisted UA → forwards (bypass fires on the same path shape)', async () => {
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'enforce',
        legacy_client_allowlist_json: '["^AppleCoreMedia/"]',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS,
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/broadcast/abc/720p30/live.m3u8',
      metroCode: BLOCKED_METRO,
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
    });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit') && l.includes('broadcast=abc'))).toBe(true);
  });

  test('path-token URI + broadcast NOT in blocklist → still forwards (extractBroadcastId returns id but KVS is empty)', async () => {
    // Sanity: the relaxed regex shouldn't produce false positives — a
    // path-token URL for a broadcast that isn't blacked out anywhere
    // should still forward normally.
    const { handler } = loadValidator(
      render({ dma_enforcement_mode: 'enforce', token_enforcement_mode: 'enforce' }),
      { 'key:default': 'signing-key' }, // no blackout: entries
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/broadcast/xyz/720p30/live.m3u8',
      metroCode: BLOCKED_METRO,
    });
    const res = await handler(req);
    // Token validation still runs (and fails because we're using stub cwt), so we expect 401 — key point is we didn't hit 451.
    expect(res.statusCode).not.toBe(451);
  });

  test('legacy_client_allowlist bypass forwards a STRIPPED URI (regression: was forwarding `/<token>/broadcast/…` → origin 403)', async () => {
    // Discovered on stage: AppleCoreMedia + path token + blocked
    // broadcast bypassed DMA correctly but the allowlist bypass path
    // then forwarded the unstripped URI to origin, which 403'd because
    // MediaPackage can't route `/<50+char token>/broadcast/…`. Path
    // token strip has to happen upfront, before any bypass returns.
    const { handler } = loadValidator(
      render({
        dma_enforcement_mode: 'off',
        token_enforcement_mode: 'enforce',
        legacy_client_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      {},
    );
    const req = makeRequest({
      pathToken: 'x'.repeat(60),
      uri: '/broadcast/abc/720p30/live.m3u8',
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
    });
    const res = await handler(req);
    expect(res.statusCode).toBeUndefined();
    // Origin should see the clean URI, no token prefix.
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });
});

describe('CTA validator — VID-3587 capable-client header revokes DMA bypass', () => {
  // nfhs-mobile 3.6.6+ (iOS + Android) sends X-NFHS-Client-Version on
  // manifest requests to signal "I ship a blackout-message UI, block
  // me if applicable." The validator revokes the UA-based DMA bypass
  // when that header is present with any non-empty value. The token
  // bypass (legacy_client_allowlist) is NOT gated by the header —
  // native clients still can't mint CTA tokens.
  const BLOCKED_METRO = 602;
  const BLOCKED_KVS = { 'blackout:abc': '602,524', 'key:default': 'signing-key' };

  test('header present + UA on DMA-bypass list + blocked metro → 451 (bypass revoked)', async () => {
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/", "^NFHS Network/[0-9.]+ \\\\(Linux;Android"]',
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'NFHS Network/3.6.6 (Linux;Android 14)',
      extraHeaders: { 'X-NFHS-Client-Version': '3.6.6' },
    }));
    expect(res.statusCode).toBe(451);
    expect(res.body).toBe('blackout_dma');
    // Revoke log fires with client_version value for context.
    expect(logs.some(l => l.includes('dma_bypass_revoked') && l.includes('broadcast=abc') && l.includes('client_version=3.6.6'))).toBe(true);
    // Original bypass-hit log MUST NOT fire — that would double-count.
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(false);
  });

  test('header absent + UA on DMA-bypass list + blocked metro → forwards (bypass fires as today)', async () => {
    // Regression guard on the pre-VID-3587 path: without the header,
    // Android UA still gets the DMA-bypass. Ensures the new logic
    // strictly ADDS a revoke path, doesn't change the header-absent
    // default.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^NFHS Network/[0-9.]+ \\\\(Linux;Android"]',
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'NFHS Network/3.5.0 (Linux;Android 13)', // pre-3.6.6, no header
    }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(true);
    expect(logs.some(l => l.includes('dma_bypass_revoked'))).toBe(false);
  });

  test('header present but UA NOT on DMA-bypass list → no bypass to revoke → 451 as normal', async () => {
    // Header is only meaningful in conjunction with a matched UA
    // bypass — a raw viewer UA that never matched shouldn't see any
    // different behavior. Ensures we didn't accidentally make the
    // header a standalone signal.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^Roku/DVP-"]', // no Android
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'NFHS Network/3.6.6 (Linux;Android 14)',
      extraHeaders: { 'X-NFHS-Client-Version': '3.6.6' },
    }));
    expect(res.statusCode).toBe(451);
    // Neither log fires — nothing to bypass, nothing to revoke.
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(false);
    expect(logs.some(l => l.includes('dma_bypass_revoked'))).toBe(false);
  });

  test('header present does NOT affect legacy_client_allowlist bypass — Android token bypass still fires', async () => {
    // This is the split-capability guarantee: iOS/Android 3.6.6 ships
    // the blackout UI but NOT CTA token minting. So a 3.6.6+ Android
    // client sending the header should still be TOKEN-bypassed via
    // legacy_client_allowlist while being DMA-blocked (if in a
    // blocked metro). Verify with DMA off so we isolate the token
    // path: token=enforce, header present, Android UA → forwards
    // (allowlist_bypass log), not 401.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'off',
        token_enforcement_mode: 'enforce',
        legacy_client_allowlist_json: '["^NFHS Network/[0-9.]+ \\\\(Linux;Android"]',
      }),
      { 'key:default': 'signing-key' },
    );
    const res = await handler(makeRequest({
      userAgent: 'NFHS Network/3.6.6 (Linux;Android 14)',
      extraHeaders: { 'X-NFHS-Client-Version': '3.6.6' },
    }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('allowlist_bypass') && l.includes('pattern=^NFHS Network'))).toBe(true);
    // Header-related logs must not fire when DMA is off.
    expect(logs.some(l => l.includes('dma_bypass'))).toBe(false);
  });

  test('empty header value is treated as absent (bypass still fires)', async () => {
    // Presence-only match uses `capableHeader.value` truthiness, so
    // an accidentally empty header should behave like no header at
    // all. Guards against a mobile-side quirk where the header key
    // is included with an empty string.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
      extraHeaders: { 'X-NFHS-Client-Version': '' },
    }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_allowlist_hit'))).toBe(true);
    expect(logs.some(l => l.includes('dma_bypass_revoked'))).toBe(false);
  });

  test('header value with control chars is sanitized before logging (log-injection guard)', async () => {
    // Cody's PR #38 blocker: capableHeader.value is fully
    // attacker-controlled and lands in the audit stream that
    // rights-compliance uses to measure blackout leakage. A CR/LF in
    // the value would forge fake dma_bypass_allowlist_hit /
    // blackout_dma entries and corrupt the audit trail. Sanitizer
    // replaces ASCII control chars (0x00-0x1F + DEL) with `_` and
    // caps at 64 chars.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
      extraHeaders: {
        'X-NFHS-Client-Version': '3.6.6\r\ndma_bypass_allowlist_hit broadcast=fake metro=999 pattern=x mode=enforce',
      },
    }));
    expect(res.statusCode).toBe(451);
    // Sanitized value replaces \r\n with underscores.
    const revokeLine = logs.find(l => l.includes('dma_bypass_revoked'));
    expect(revokeLine).toBeDefined();
    expect(revokeLine).not.toContain('\r');
    expect(revokeLine).not.toContain('\n');
    // The forged suffix survives as literal text (underscored) — not as a separate log line.
    expect(revokeLine).toContain('client_version=3.6.6__dma_bypass_allowlist_hit');
    // Test harness stores one console.log call per array entry — so a
    // successful injection would produce a second log entry that
    // *starts* with the forged text. startsWith bounds the check to
    // the log-line level, whereas .includes matches the sanitized
    // substring inside the revoke line's client_version=… segment.
    expect(logs.filter(l => l.startsWith('dma_bypass_allowlist_hit')).length).toBe(0);
  });

  test('header value longer than 64 chars is truncated', async () => {
    // Defensive cap so an outsize header value can't dominate the
    // log line and push useful fields out of view.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'enforce',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS,
    );
    const oversized = '3.6.6-' + 'x'.repeat(200);
    await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
      extraHeaders: { 'X-NFHS-Client-Version': oversized },
    }));
    const revokeLine = logs.find(l => l.includes('dma_bypass_revoked'));
    // client_version segment carries only the first 64 chars of the value.
    const m = revokeLine.match(/client_version=([^ ]*)/);
    expect(m).not.toBeNull();
    expect(m[1].length).toBe(64);
    expect(m[1]).toBe(oversized.slice(0, 64));
  });

  test('log mode + header present → forwards but revoke line + would-have-blocked line both fire', async () => {
    // Log-mode audit surface: the revoke line documents "we tightened
    // this UA's bypass because it signaled capability", and the
    // normal blackout_dma log downstream documents "the tightening
    // would have taken effect on this request." Both signals are
    // needed to reason about a log-mode → enforce-mode flip.
    const { handler, logs } = loadValidator(
      render({
        dma_enforcement_mode: 'log',
        token_enforcement_mode: 'off',
        dma_bypass_allowlist_json: '["^AppleCoreMedia/"]',
      }),
      BLOCKED_KVS,
    );
    const res = await handler(makeRequest({
      metroCode: BLOCKED_METRO,
      userAgent: 'AppleCoreMedia/1.0.0.23L471',
      extraHeaders: { 'X-NFHS-Client-Version': '3.6.6' },
    }));
    expect(res.statusCode).toBeUndefined();
    expect(logs.some(l => l.includes('dma_bypass_revoked') && l.includes('client_version=3.6.6'))).toBe(true);
    expect(logs.some(l => l.includes('blackout_dma broadcast=abc') && l.includes('mode=log'))).toBe(true);
  });
});
