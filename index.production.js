/**
 * CloudFront CAT (Common Access Token) - Production Implementation
 * 
 * A streamlined CloudFront Function for validating CBOR Web Tokens (CWT)
 * using the CloudFront CWT module.
 * 
 * Features:
 * - Token generation via /generate endpoint
 * - CWT validation using cf.cwt.validateToken()
 * - CloudFront KeyValueStore integration
 * - Enhanced error reporting and diagnostics
 * 
 * Version: 1.4.0 (Streamlined Production)
 * Size: ~5.5KB (optimized, within CloudFront Functions 10KB limit)
 * Status: Fully Operational ✅
 */
var cf = require('cloudfront');

function err(code, msg) {
    return { statusCode: code, headers: { "content-type": { value: "application/json" } }, body: msg };
}



function success(payload) {
    return { statusCode: 200, headers: { "content-type": { value: "application/json" } }, body: JSON.stringify({ status: "success", payload: payload }) };
}



async function handler(event) {
    try {
        console.log("[CAT] CloudFront CAT Production v1.4.0");

        var request = event.request;
        var uri = request.uri;
        var kvsHandle = cf.kvs();

        // TOKEN GENERATION ENDPOINT
        if (uri.includes('/generate')) {
            console.log("[CAT] === TOKEN GENERATION ===");

            var secretKey = await kvsHandle.get("key:default");
            if (!secretKey) return err(500, '{"error":"key_not_found"}');

            var currentTime = Math.floor(Date.now() / 1000);
            var tokenJSON = {
                protected: { 1: 5 }, // HMAC-SHA256
                unprotected: {},
                payload: {
                    1: "cloudfront-cat-issuer",           // iss
                    3: "d2ecxlwhoy2ewq.cloudfront.net",   // aud
                    4: currentTime + 3600,               // exp (1 hour)
                    5: currentTime,                      // nbf
                    6: currentTime,                      // iat
                    7: "prod-" + currentTime             // jti
                }
            };

            var genContext = { cwtTag: true, coseTag: "MAC0", key: secretKey };
            var tokenBuffer = cf.cwt.generateToken(tokenJSON, genContext);
            var token = tokenBuffer.toString('base64url');

            console.log("[CAT] ✅ Token generated successfully");

            return success({
                token: token,
                payload: tokenJSON.payload,
                usage: {
                    header: "x-cat-token: " + token
                }
            });
        }

        // TOKEN VALIDATION (Main Flow)
        console.log("[CAT] === TOKEN VALIDATION ===");

        var tokenHeader = request.headers["x-cat-token"];

        if (!tokenHeader) {
            console.log("[CAT] ❌ Missing x-cat-token header");
            return err(401, JSON.stringify({
                error: "missing_token",
                required_headers: ["x-cat-token"]
            }));
        }

        var tokenBuf = Buffer.from(tokenHeader.value, 'base64url');
        var secretKey = await kvsHandle.get("key:default");

        if (!secretKey) {
            console.log("[CAT] ❌ Key not found");
            return err(401, JSON.stringify({ error: "key_not_found" }));
        }

        // CloudFront CWT Module Validation
        try {
            var cwt_result = cf.cwt.validateToken(tokenBuf, { key: secretKey });
            console.log("[CAT] ✅ CWT validation successful");
            return success({ claims: cwt_result });
        } catch (e) {
            console.log("[CAT] CWT validation failed:", e.message);

            // Try with Buffer key format
            if (typeof secretKey === 'string') {
                try {
                    var bufKey = Buffer.from(secretKey, 'base64');
                    var cwt_buf_result = cf.cwt.validateToken(tokenBuf, { key: bufKey });
                    console.log("[CAT] ✅ CWT validation successful with Buffer key");
                    return success({ claims: cwt_buf_result });
                } catch (e2) {
                    console.log("[CAT] CWT validation failed with both key formats");
                }
            }

            return err(401, JSON.stringify({ error: "validation_failed" }));
        }

    } catch (e) {
        console.log("[CAT] Handler exception:", e.message);
        return err(500, JSON.stringify({
            error: "handler_exception",
            message: e.message
        }));
    }
}