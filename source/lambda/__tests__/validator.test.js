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

function makeRequest({ uri = '/broadcast/abc/720p30/live.m3u8', userAgent = 'Mozilla/5.0', method = 'GET', pathToken } = {}) {
  const headers = {};
  if (userAgent !== null) {
    headers['user-agent'] = { value: userAgent };
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
