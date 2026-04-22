/**
 * CTA-5007-B Native SDK - Local Token Generation
 * Generates real CBOR-encoded CWT tokens with COSE MAC0 structure
 * compatible with CloudFront's cf.cwt.validateToken()
 */

const crypto = require('crypto');

// --- Minimal CBOR encoder (sufficient for CWT/COSE structures) ---

function cborEncodeUint(value) {
    if (value < 24) return Buffer.from([value]);
    if (value < 0x100) return Buffer.from([0x18, value]);
    if (value < 0x10000) {
        const buf = Buffer.alloc(3);
        buf[0] = 0x19;
        buf.writeUInt16BE(value, 1);
        return buf;
    }
    if (value < 0x100000000) {
        const buf = Buffer.alloc(5);
        buf[0] = 0x1a;
        buf.writeUInt32BE(value, 1);
        return buf;
    }
    // 64-bit
    const buf = Buffer.alloc(9);
    buf[0] = 0x1b;
    buf.writeBigUInt64BE(BigInt(value), 1);
    return buf;
}

function cborEncodeNegInt(value) {
    // CBOR negative: -1 - n, so encode (abs(value) - 1) with major type 1
    const n = -value - 1;
    const encoded = cborEncodeUint(n);
    encoded[0] = (encoded[0] & 0x1f) | 0x20; // Set major type 1
    return encoded;
}

function cborEncodeInt(value) {
    if (value >= 0) return cborEncodeUint(value);
    return cborEncodeNegInt(value);
}

function cborEncodeBytes(buf) {
    const head = cborEncodeUint(buf.length);
    head[0] = (head[0] & 0x1f) | 0x40; // Major type 2
    return Buffer.concat([head, buf]);
}

function cborEncodeString(str) {
    const strBuf = Buffer.from(str, 'utf8');
    const head = cborEncodeUint(strBuf.length);
    head[0] = (head[0] & 0x1f) | 0x60; // Major type 3
    return Buffer.concat([head, strBuf]);
}

function cborEncodeArray(items) {
    const head = cborEncodeUint(items.length);
    head[0] = (head[0] & 0x1f) | 0x80; // Major type 4
    return Buffer.concat([head, ...items.map(cborEncode)]);
}

function cborEncodeMap(obj) {
    const keys = Object.keys(obj);
    const head = cborEncodeUint(keys.length);
    head[0] = (head[0] & 0x1f) | 0xa0; // Major type 5
    const parts = [head];
    for (const k of keys) {
        // Map keys: use integer if numeric, string otherwise
        const numKey = Number(k);
        if (!isNaN(numKey) && Number.isInteger(numKey)) {
            parts.push(cborEncodeInt(numKey));
        } else {
            parts.push(cborEncodeString(k));
        }
        parts.push(cborEncode(obj[k]));
    }
    return Buffer.concat(parts);
}

function cborEncodeTag(tag, value) {
    const head = cborEncodeUint(tag);
    head[0] = (head[0] & 0x1f) | 0xc0; // Major type 6
    const encoded = cborEncode(value);
    return Buffer.concat([head, encoded]);
}

/**
 * Wrap raw CBOR bytes in a CBOR tag without re-encoding the content.
 */
function cborWrapTag(tag, rawCbor) {
    const head = cborEncodeUint(tag);
    head[0] = (head[0] & 0x1f) | 0xc0; // Major type 6
    return Buffer.concat([head, rawCbor]);
}

function cborEncode(value) {
    if (value === null || value === undefined) return Buffer.from([0xf6]); // null
    if (typeof value === 'boolean') return Buffer.from([value ? 0xf5 : 0xf4]);
    if (typeof value === 'number') return cborEncodeInt(value);
    if (typeof value === 'string') return cborEncodeString(value);
    if (Buffer.isBuffer(value)) return cborEncodeBytes(value);
    if (Array.isArray(value)) return cborEncodeArray(value);
    if (typeof value === 'object') return cborEncodeMap(value);
    throw new Error(`Cannot CBOR encode: ${typeof value}`);
}

// --- COSE MAC0 / CWT token generation ---

/**
 * Build a COSE_MAC0 structure:
 *   Tag(17) [ protectedHeaders, unprotectedHeaders, payload, tag ]
 *
 * MAC structure for HMAC computation (per RFC 8152 §6.3):
 *   MAC_structure = ["MAC0", protectedHeaders, external_aad, payload]
 */
function buildCoseMac0(protectedHeaders, unprotectedHeaders, payload, key) {
    const protectedEncoded = cborEncode(protectedHeaders);
    const payloadEncoded = cborEncode(payload);

    // MAC_structure = ["MAC0", protectedEncoded, h'', payloadEncoded]
    const macStructure = cborEncodeArray([
        "MAC0",
        protectedEncoded,
        Buffer.alloc(0),  // external_aad
        payloadEncoded
    ]);

    // Compute HMAC-SHA256 tag
    const tag = crypto.createHmac('sha256', key).update(macStructure).digest();

    // COSE_MAC0 = [protectedEncoded, unprotectedHeaders, payloadEncoded, tag]
    const mac0Array = [protectedEncoded, unprotectedHeaders, payloadEncoded, tag];

    // Wrap in COSE_MAC0 tag (17) — use cborWrapTag since the array
    // contains pre-encoded CBOR buffers that must not be double-encoded
    const encodedArray = cborEncodeArray(mac0Array);
    return cborWrapTag(17, encodedArray);
}

/**
 * Generate a CWT token (optionally wrapped in CWT tag 61)
 */
function generateCWT(protectedHeaders, unprotectedHeaders, payload, key, options = {}) {
    const mac0 = buildCoseMac0(protectedHeaders, unprotectedHeaders, payload, key);

    if (options.cwtTag) {
        return cborWrapTag(61, mac0);
    }
    return mac0;
}

// --- CTA Client ---

class CTAClient {
    constructor(stackName, region = 'us-east-1') {
        this.stackName = stackName;
        this.region = region;
        this.keys = null;
    }

    async initSecretsManager(credentials = {}) {
        const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
        this.smClient = new SecretsManagerClient({ region: this.region, ...credentials });
        this._GetSecretValueCommand = GetSecretValueCommand;
    }

    async getSigningKeys() {
        if (!this.smClient) throw new Error("Call initSecretsManager() first");

        const command = new this._GetSecretValueCommand({ SecretId: `${this.stackName}_CTAKey` });
        const response = await this.smClient.send(command);
        const secret = JSON.parse(response.SecretString);
        this.keys = { primary: { value: secret.signingKey, uuid: 'primary' } };
        return this.keys;
    }

    /**
     * Generate a real CBOR-encoded CWT token with COSE MAC0 structure.
     * The output is compatible with cf.cwt.validateToken().
     */
    generateCWTToken(policy, viewer = {}) {
        if (!this.keys) throw new Error("No signing keys. Call getSigningKeys() first");

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            4: now + this.parseTTL(policy.ttl || '2h'), // exp
            5: now,  // nbf
            6: now   // iat
        };

        // URI restrictions: catu(312) → path(2) → prefix_match(1)
        if (policy.paths && policy.paths.length > 0) {
            payload[312] = { 2: { 1: policy.paths[0] } };
        }

        // Country restrictions: catgeoiso3166(316)
        if (policy.countries && policy.countries.length > 0) {
            payload[316] = policy.countries;
        }

        // Session ID: cti(7)
        if (policy.sessionId) {
            payload[7] = policy.sessionId;
        }

        const key = Buffer.from(this.keys.primary.value, 'base64');
        const protectedHeaders = { 1: 5 }; // alg: HMAC-SHA256
        const unprotectedHeaders = {};

        const tokenBuffer = generateCWT(protectedHeaders, unprotectedHeaders, payload, key, { cwtTag: true });
        const token = tokenBuffer.toString('base64url');

        return { token, claims: payload, expiresAt: payload[4] };
    }

    generateSignedUrl(mediaUrl, policy, viewer = {}) {
        const result = this.generateCWTToken(policy, viewer);

        if (policy.placement === 'query') {
            const separator = mediaUrl.includes('?') ? '&' : '?';
            return `${mediaUrl}${separator}CAT=${result.token}`;
        } else if (policy.placement === 'header') {
            return { url: mediaUrl, headers: { 'CTA-Common-Access-Token': result.token } };
        } else {
            const url = new URL(mediaUrl);
            return `${url.protocol}//${url.host}/${result.token}${url.pathname}${url.search}`;
        }
    }

    parseTTL(ttl) {
        if (typeof ttl === 'number') return ttl;
        const match = ttl.match(/^(\d+)([smhd])$/);
        if (!match) return 7200;
        const value = parseInt(match[1]);
        switch (match[2]) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 7200;
        }
    }
}

if (typeof module !== 'undefined') module.exports = { CTAClient, generateCWT, cborEncode };
else window.CTAClient = CTAClient;
