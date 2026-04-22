/**
 * CTA-5007-B CloudFront Function with Hybrid Token Renewal
 * Supports path→header token transition for streaming players
 *
 * Requires CloudFront Functions JavaScript runtime 2.0
 */

import cf from 'cloudfront';

var CTA = {
    EXP: 4,           // Expiration
    NBF: 5,           // Not Before  
    IAT: 6,           // Issued At
    CTI: 7,           // Token ID
    CATNIP: 311,      // Network IP
    CATU: 312,        // URI restrictions
    CATGEOISO3166: 316 // Country codes
};

// catu sub-claim keys per AWS docs
var Catu = {
    HOST: 1,
    PATH: 2,
    EXT: 3
};

var CatuMatch = {
    PREFIX: 1,
    SUFFIX: 2,
    EXACT: 3
};

function extractPathToken(request) {
    var segments = request.uri.split('/');
    if (segments[1] && segments[1].length > 50) {
        return segments[1];
    }
    return null;
}

function validateClaims(payload, request) {
    var now = Math.floor(Date.now() / 1000);
    
    if (payload[CTA.EXP] && now > payload[CTA.EXP]) {
        throw new Error("expired");
    }
    
    if (payload[CTA.NBF] && now < payload[CTA.NBF]) {
        throw new Error("not_yet_valid");
    }
    
    // URI path validation (catu → path → prefix_match)
    if (payload[CTA.CATU] && payload[CTA.CATU][Catu.PATH] && payload[CTA.CATU][Catu.PATH][CatuMatch.PREFIX]) {
        if (!request.uri.startsWith(payload[CTA.CATU][Catu.PATH][CatuMatch.PREFIX])) {
            throw new Error("uri_not_allowed");
        }
    }
    
    // Country validation (catgeoiso3166)
    if (payload[CTA.CATGEOISO3166]) {
        var country = request.headers["cloudfront-viewer-country"];
        if (!country || payload[CTA.CATGEOISO3166].indexOf(country.value.toLowerCase()) === -1) {
            throw new Error("geo_restricted");
        }
    }
}

function generateRenewedToken(originalCWT, signingKey, currentTime) {
    var renewedCWT = {
        protected: originalCWT.protectedHeaders,
        unprotected: originalCWT.unprotectedHeaders,
        payload: {}
    };

    // Copy all existing claims
    var keys = Object.keys(originalCWT.payload);
    for (var i = 0; i < keys.length; i++) {
        renewedCWT.payload[keys[i]] = originalCWT.payload[keys[i]];
    }

    // Update time-based claims
    renewedCWT.payload[CTA.EXP] = currentTime + 3600;
    renewedCWT.payload[CTA.IAT] = currentTime;
    renewedCWT.payload[CTA.NBF] = currentTime;

    // NOTE: AWS docs signature says generateToken(context, payload) but all
    // doc examples pass (CWTObject, context). We follow the examples.
    var genContext = {
        cwtTag: true,
        coseTag: "MAC0",
        key: signingKey
    };

    var renewedTokenBuffer = cf.cwt.generateToken(renewedCWT, genContext);
    return renewedTokenBuffer.toString('base64url');
}

async function handler(event) {
    try {
        var request = event.request;
        var kvs = cf.kvs();
        var signingKey = await kvs.get("key:default");
        var token = null;
        var cwt = null;
        var isPathToken = false;
        
        // Try header token first (subsequent requests after renewal)
        if (request.headers["cta-common-access-token"]) {
            token = request.headers["cta-common-access-token"].value;
            cwt = cf.cwt.validateToken(Buffer.from(token, 'base64url'), { key: signingKey });
        }
        // Fallback to path token (initial request)
        else {
            token = extractPathToken(request);
            if (!token) {
                return { statusCode: 401, body: "missing_token" };
            }
            
            cwt = cf.cwt.validateToken(Buffer.from(token, 'base64url'), { key: signingKey });
            isPathToken = true;
            
            // Strip token from path before sending to origin
            var segments = request.uri.split('/');
            segments.splice(1, 1);
            request.uri = segments.join('/') || '/';
        }
        
        // Check revocation
        if (cwt.payload[CTA.CTI]) {
            try {
                var revoked = await kvs.get("revoked:" + cwt.payload[CTA.CTI]);
                if (revoked) {
                    return { statusCode: 401, body: "token_revoked" };
                }
            } catch (e) {
                // Key not found in KVS means not revoked — continue
            }
        }
        
        // Validate claims
        validateClaims(cwt.payload, request);
        
        // Check if renewal needed (within 5 minutes of expiry)
        var now = Math.floor(Date.now() / 1000);
        var timeUntilExpiry = cwt.payload[CTA.EXP] - now;
        
        if (timeUntilExpiry < 300 && timeUntilExpiry > 0) {
            try {
                var renewedToken = generateRenewedToken(cwt, signingKey, now);
                // Add renewed token as a custom header on the request.
                // A viewer-response function or origin can relay this back
                // to the client via the CTA-Common-Access-Token response header.
                request.headers["x-cwt-renewed-token"] = { value: renewedToken };
            } catch (renewalError) {
                // Renewal failed but token is still valid — continue
            }
        }
        
        // Forward request to origin
        return request;
        
    } catch (e) {
        return { statusCode: 401, body: e.message };
    }
}
