# CTA-5007-B SDK Comparison

All three SDKs implement the same COSE MAC0 / CWT token generation and produce byte-identical output.

## SDK Overview

| Language | Dependencies | File |
|----------|-------------|------|
| **Node.js** | `cbor-x` | `source/resources/sdk/javascript/cta-client.js` |
| **Python** | None (built-in CBOR) | `source/resources/sdk/python/cta_client.py` |
| **Ruby** | None (`openssl` stdlib) | `source/lambda-ruby/cta_client.rb` |

## API Comparison

### Node.js

```javascript
const { generateToken, CWT, CAT, CATU, MATCH, parseTTL } = require('./cta-client');

const claims = new Map();
claims.set(CWT.ISS, 'cta-secure-media');
claims.set(CWT.EXP, Math.floor(Date.now() / 1000) + 7200);
claims.set(CAT.CATU, new Map([[CATU.PATH, new Map([[MATCH.PREFIX, '/video/']])]]));

const tokenBuffer = generateToken(claims, signingKey);
const token = tokenBuffer.toString('base64url');
```

### Python

```python
from cta_client import generate_token, CWT, CAT, CATU, MATCH, parse_ttl

claims = {
    CWT.ISS: 'cta-secure-media',
    CWT.EXP: int(time.time()) + 7200,
    CAT.CATU: {CATU.PATH: {MATCH.PREFIX: '/video/'}},
}

token_bytes = generate_token(claims, signing_key)
token = base64.urlsafe_b64encode(token_bytes).rstrip(b'=').decode()
```

### Ruby

```ruby
require_relative 'cta_client'

claims = {
  CTA::CWT::ISS => 'cta-secure-media',
  CTA::CWT::EXP => Time.now.to_i + 7200,
  CTA::CAT::CATU => { CTA::CATU::PATH => { CTA::MATCH::PREFIX => '/video/' } },
}

token_bytes = CTA.generate_token(claims, signing_key)
token = Base64.urlsafe_encode64(token_bytes, padding: false)
```

## Lambda Endpoints

| Endpoint | Runtime | Handler |
|----------|---------|---------|
| `POST /token` | Node.js 22 | `cta_token_generator.handler` |
| `POST /token-python` | Python 3.13 | `handler.handler` |
| `POST /token-ruby` | Ruby 3.3 | `handler.handler` |

All endpoints accept the same request format and return the same response structure.

## Key Differences

| Feature | Node.js | Python | Ruby |
|---------|---------|--------|------|
| CBOR encoding | `cbor-x` library | Built-in encoder | Built-in encoder |
| HMAC | `crypto.createHmac` | `hmac.new` | `OpenSSL::HMAC.digest` |
| External deps | 1 (`cbor-x`) | 0 | 0 |
| Lambda runtime | Node.js 22.x | Python 3.13 | Ruby 3.3 |
