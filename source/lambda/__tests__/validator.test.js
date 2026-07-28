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
    token_validation_enabled: 'true',
    token_enforcement_mode: 'enforce',
    geo_validation_enabled: 'false',
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
function loadValidator(rendered, kvsMap) {
  const kvs = {
    get: async (key) => {
      if (!(key in kvsMap)) throw new Error('KeyNotFound');
      return kvsMap[key];
    },
  };
  const cfMock = {
    kvs: () => kvs,
    cwt: {
      // Bare stub — tests exercising real CWT paths supply their own.
      validateToken: () => { throw new Error('cwt_stub_called'); },
    },
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
    console: { log: () => {} },
    Math,
    Date,
    RegExp,
    String,
    Error,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(wrapped, context);
  return module.exports.handler;
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
    const handler = loadValidator(render({}), { 'key:default': 'test-signing-key' });
    const res = await handler(makeRequest());
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('allowlisted UA bypasses token validation and forwards request', async () => {
    const handler = loadValidator(
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
    const handler = loadValidator(
      render({ legacy_client_allowlist_json: '["^Roku/DVP-"]' }),
      { 'key:default': 'test-signing-key' }
    );
    const res = await handler(makeRequest({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }));
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('missing User-Agent header is not an allowlist match', async () => {
    const handler = loadValidator(
      render({ legacy_client_allowlist_json: '["^.*"]' }),  // matches everything
      { 'key:default': 'test-signing-key' }
    );
    const res = await handler(makeRequest({ userAgent: null }));
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('missing_token');
  });

  test('regex escaping: pattern with . as literal (com.playon.nfhslive) does not match arbitrary chars', async () => {
    const handler = loadValidator(
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
    const handler = loadValidator(render({ token_enforcement_mode: 'log' }), {});
    const res = await handler(makeRequest());
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });

  test('mode=off short-circuits before allowlist even runs', async () => {
    const handler = loadValidator(
      render({
        token_enforcement_mode: 'off',
        // Provide an allowlist that WOULD match — verifies off bypasses first.
        legacy_client_allowlist_json: '["never-matches"]',
      }),
      {}
    );
    const res = await handler(makeRequest({ userAgent: 'anything' }));
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/broadcast/abc/720p30/live.m3u8');
  });

  test('mode=enforce rejects with 401 on missing_token (default)', async () => {
    const handler = loadValidator(render({}), { 'key:default': 'test-signing-key' });
    const res = await handler(makeRequest());
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control'].value).toBe('no-store, max-age=0');
  });

  test('token_validation_enabled=false takes precedence over token_enforcement_mode', async () => {
    const handler = loadValidator(
      render({
        token_validation_enabled: 'false',
        token_enforcement_mode: 'enforce',
      }),
      {}
    );
    const res = await handler(makeRequest());
    expect(res.statusCode).toBeUndefined();
  });
});
