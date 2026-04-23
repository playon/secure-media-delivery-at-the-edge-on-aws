# CTA-5007-B Test Report

**Date**: April 22, 2026
**Total Tests**: 93
**Passed**: 93
**Failed**: 0

## Summary

| Language | Framework | Tests | Assertions | Status |
|----------|-----------|-------|------------|--------|
| Node.js | Jest | 36 | 36 | ✅ All passing |
| Python | unittest | 29 | 29 | ✅ All passing |
| Ruby | minitest | 28 | 37 | ✅ All passing |

## Running Tests

```bash
# Node.js (SDK + Lambda handlers)
cd cta-compliant-solution/source/lambda && npx jest --verbose

# Python
cd cta-compliant-solution/source/lambda-python && python3 -m unittest test_cta_client -v

# Ruby
cd cta-compliant-solution/source/lambda-ruby && ruby test_cta_client.rb -v
```

## Node.js — SDK Tests (19 tests)

File: `lambda/__tests__/cta-client.test.js`

### parseTTL (7 tests)

| Test | Result |
|------|--------|
| Parses seconds (`30s` → 30) | ✅ |
| Parses minutes (`5m` → 300) | ✅ |
| Parses hours (`2h` → 7200) | ✅ |
| Parses days (`1d` → 86400) | ✅ |
| Passes through integers | ✅ |
| Defaults invalid input to 7200 | ✅ |
| Defaults empty string to 7200 | ✅ |

### generateToken (9 tests)

| Test | Result |
|------|--------|
| Returns a Buffer | ✅ |
| Starts with CWT tag (0xd8 0x3d) then COSE_Mac0 tag (0xd8 0x11) | ✅ |
| Skips CWT tag when `cwtTag=false` | ✅ |
| Produces deterministic output for same inputs | ✅ |
| Produces different output for different keys | ✅ |
| HMAC tag is 32 bytes (SHA-256) | ✅ |
| HMAC is verifiable against reconstructed MAC_structure | ✅ |
| Uses custom kid in unprotected headers | ✅ |
| Encodes URI restriction claims (catu/path/prefix) | ✅ |

### CWT/CAT Constants (3 tests)

| Test | Result |
|------|--------|
| CWT claim numbers match RFC 8392 (ISS=1, EXP=4, NBF=5, IAT=6, CTI=7) | ✅ |
| CAT claim numbers match CloudFront docs (CATU=401, CATNIP=402) | ✅ |
| CATU/MATCH constants (PATH=2, PREFIX=1) | ✅ |

## Node.js — Lambda Handler Tests (17 tests)

File: `lambda/__tests__/handlers.test.js`

AWS SDK clients are mocked (SecretsManager, CloudFront KVS, SSM).

### cta_token_generator (7 tests)

| Test | Result |
|------|--------|
| Generates token with valid input | ✅ |
| Returns path-based signed URL by default | ✅ |
| Returns query-based signed URL when `placement=query` | ✅ |
| Includes session ID in token | ✅ |
| Returns 500 for missing policy | ✅ |
| Returns 500 for invalid mediaUrl | ✅ |
| Includes CORS header | ✅ |

### cta_revocation (3 tests)

| Test | Result |
|------|--------|
| Revokes a token and returns success | ✅ |
| Defaults reason to "manual" | ✅ |
| Returns 400 for missing tokenId | ✅ |

### list_revoked (3 tests)

| Test | Result |
|------|--------|
| Returns revoked sessions sorted by time (newest first) | ✅ |
| Filters out non-revoked keys (key:default, etc.) | ✅ |
| Handles empty KVS | ✅ |

### prompt_manager (4 tests)

| Test | Result |
|------|--------|
| GET returns the prompt from SSM | ✅ |
| PUT updates the prompt in SSM | ✅ |
| PUT returns 400 for missing prompt | ✅ |
| Returns 405 for unsupported HTTP method | ✅ |

## Python — SDK Tests (29 tests)

File: `lambda-python/test_cta_client.py`

### cbor_encode (11 tests)

| Test | Result |
|------|--------|
| Integer 0 | ✅ |
| Small integer (23) | ✅ |
| One-byte integer (24) | ✅ |
| String | ✅ |
| Bytes | ✅ |
| List | ✅ |
| Dict | ✅ |
| None | ✅ |
| Boolean true | ✅ |
| Boolean false | ✅ |
| Negative integer | ✅ |

### parse_ttl (6 tests)

| Test | Result |
|------|--------|
| Seconds, minutes, hours, days | ✅ |
| Integer passthrough | ✅ |
| Invalid input defaults to 7200 | ✅ |

### generate_token (9 tests)

| Test | Result |
|------|--------|
| Returns bytes | ✅ |
| CWT tag (0xd8 0x3d) | ✅ |
| COSE_Mac0 tag (0xd8 0x11) | ✅ |
| No CWT tag option | ✅ |
| Deterministic output | ✅ |
| Different keys produce different tokens | ✅ |
| HMAC is 32 bytes | ✅ |
| HMAC is verifiable | ✅ |
| Path claim encoded correctly | ✅ |

### Constants (3 tests)

| Test | Result |
|------|--------|
| CWT claim numbers | ✅ |
| CAT claim numbers | ✅ |
| CATU/MATCH constants | ✅ |

## Ruby — SDK Tests (28 tests, 37 assertions)

File: `lambda-ruby/test_cta_client.rb`

### cbor_encode (11 tests)

| Test | Result |
|------|--------|
| Zero, small int, one-byte int | ✅ |
| String, bytes | ✅ |
| List, dict | ✅ |
| Nil, true, false | ✅ |
| Negative integer | ✅ |

### parse_ttl (6 tests)

| Test | Result |
|------|--------|
| Seconds, minutes, hours, days | ✅ |
| Integer passthrough | ✅ |
| Invalid input defaults to 7200 | ✅ |

### generate_token (9 tests)

| Test | Result |
|------|--------|
| Returns string (binary) | ✅ |
| CWT tag (0xd8 0x3d) | ✅ |
| COSE_Mac0 tag (0xd8 0x11) | ✅ |
| No CWT tag option | ✅ |
| Deterministic output | ✅ |
| Different keys produce different tokens | ✅ |
| HMAC is 32 bytes | ✅ |
| HMAC is verifiable | ✅ |
| Path claim encoded correctly | ✅ |

### Constants (2 tests)

| Test | Result |
|------|--------|
| CWT claim numbers (ISS, EXP, NBF, IAT, CTI) | ✅ |
| CAT claim numbers (CATU, CATNIP) | ✅ |

## Cross-SDK Verification

All three SDKs are tested against the same verification pattern:

1. **CBOR encoding** — Primitive types produce identical byte sequences
2. **Token structure** — Tag(61) CWT wrapping Tag(17) COSE_Mac0
3. **HMAC verification** — MAC_structure is reconstructed independently and HMAC-SHA256 is recomputed to verify the token's authentication tag
4. **Determinism** — Same claims + same key = identical token bytes
5. **Key isolation** — Different keys produce different tokens
