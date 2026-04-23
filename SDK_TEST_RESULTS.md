# CTA-5007-B SDK Test Results

## Overview

3 programming language SDKs have been validated for the CTA-5007-B Secure Media Delivery solution. All three produce byte-identical COSE MAC0 / CWT tokens verified against CloudFront Functions `cf.cwt.validateToken()`.

## Test Environment

- **Stack**: CTASecureMedia (us-east-1)
- **Standard**: CTA-5007-B (COSE MAC0 / CWT)
- **Token Structure**: Tag(61) CWT > Tag(17) COSE_Mac0 > [protected, unprotected, payload, HMAC-SHA256]

## SDK Test Results

### ✅ Node.js SDK — FULLY FUNCTIONAL

- **Status**: Production ready
- **Dependencies**: `cbor-x` (CBOR encoding)
- **File**: `source/resources/sdk/javascript/cta-client.js`
- **Lambda**: `cta_token_generator.js` (POST /token)
- **API**: `generateToken(claims, key)` → CBOR-encoded CWT buffer

### ✅ Python SDK — FULLY FUNCTIONAL

- **Status**: Production ready
- **Dependencies**: None (built-in CBOR encoder)
- **File**: `source/resources/sdk/python/cta_client.py`
- **Lambda**: `lambda-python/handler.py` (POST /token-python)
- **API**: `generate_token(claims, key)` → CBOR-encoded CWT bytes

### ✅ Ruby SDK — FULLY FUNCTIONAL

- **Status**: Production ready
- **Dependencies**: None (`openssl` from stdlib)
- **File**: `source/lambda-ruby/cta_client.rb`
- **Lambda**: `lambda-ruby/handler.rb` (POST /token-ruby)
- **API**: `CTA.generate_token(claims, key)` → CBOR-encoded CWT bytes

## Cross-SDK Validation

All three SDKs produce byte-identical tokens when given the same inputs:

- Same CBOR encoding of CWT claims map (integer keys per RFC 8392)
- Same COSE MAC_structure construction per RFC 8152 §6.3
- Same HMAC-SHA256 computation over the MAC_structure
- Same CBOR tag wrapping: Tag(17) COSE_Mac0, Tag(61) CWT

## Test Scripts

- `sdk-tests/run_all_sdk_tests.sh` — Runs all SDK tests
- `sdk-tests/validate_sdks.sh` — SDK structure validation
- `sdk-tests/sdk_validation_summary.sh` — Cross-SDK comparison

## CWT Claims Supported

| Claim | Key | All SDKs |
|-------|-----|----------|
| `iss` | 1 | ✅ |
| `exp` | 4 | ✅ |
| `nbf` | 5 | ✅ |
| `iat` | 6 | ✅ |
| `cti` | 7 | ✅ |
| `catu` | 401 | ✅ |
| `catnip` | 402 | ✅ |
| `catgeoiso3166` | 316 | ✅ |
