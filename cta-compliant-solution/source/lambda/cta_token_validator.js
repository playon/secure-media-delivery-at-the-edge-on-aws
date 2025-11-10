/**
 * CTA-5007-B CloudFront Function with Hybrid Token Renewal
 * Supports path→header token transition for streaming players
 */

var cf = require('cloudfront');

var CTA = {
    EXP: 4,           // Expiration
    NBF: 5,           // Not Before  
    IAT: 6,           // Issued At
    CTI: 7,           // Token ID
    CATNIP: 311,      // Network IP
    CATU: 312,        // URI restrictions
    CATGEOISO3166: 316 // Country codes
};

function extractPathToken(request) {
    var segments = request.uri.split('/');
    if (segments[1] && segments[1].length > 50) {
        return segments[1];
    }
    return null;
}

function validateClaims(payload, request, viewer) {
    var now = Math.floor(Date.now() / 1000);
    
    if (payload[CTA.EXP] && now > payload[CTA.EXP]) {
        throw new Error("expired");
    }
    
    if (payload[CTA.NBF] && now < payload[CTA.NBF]) {
        throw new Error("not_yet_valid");
    }
    
    // URI validation (catu)
    if (payload[CTA.CATU] && payload[CTA.CATU][3] && payload[CTA.CATU][3][1]) {
        if (!request.uri.startsWith(payload[CTA.CATU][3][1])) {
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
    // Create renewed token with extended expiry
    var renewedCWT = {
        protected: originalCWT.protected,
        unprotected: originalCWT.unprotected,
        payload: {
            ...originalCWT.payload,
            [CTA.EXP]: currentTime + 3600, // Extend by 1 hour
            [CTA.IAT]: currentTime,        // Update issued at
            [CTA.NBF]: currentTime         // Update not before
        }
    };
    
    // Generate new token using CloudFront's CWT module
    var renewedTokenBuffer = cf.cwt.generateToken(renewedCWT, { 
        cwtTag: true,
        coseTag: "MAC0", 
        key: signingKey 
    });
    
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
            // URL is already clean for header tokens
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
            segments.splice(1, 1); // Remove token segment
            request.uri = segments.join('/') || '/';
        }
        
        // Check revocation (same for both token types)
        if (cwt.payload[CTA.CTI]) {
            var revoked = await kvs.get("revoked:" + cwt.payload[CTA.CTI]);
            if (revoked) {
                return { statusCode: 401, body: "token_revoked" };
            }
        }
        
        // Validate claims (same for both token types)
        validateClaims(cwt.payload, request, event.viewer);
        
        // Check if renewal needed (within 5 minutes of expiry)
        var now = Math.floor(Date.now() / 1000);
        var timeUntilExpiry = cwt.payload[CTA.EXP] - now;
        
        if (timeUntilExpiry < 300) { // Less than 5 minutes left
            try {
                var renewedToken = generateRenewedToken(cwt, signingKey, now);
                
                // Return response with renewed token in header
                // This signals hls.js to switch to header-based requests
                return {
                    statusCode: 200,
                    headers: {
                        'CTA-Common-Access-Token': { value: renewedToken },
                        'Cache-Control': { value: 'no-cache' } // Prevent caching of renewed tokens
                    }
                };
            } catch (renewalError) {
                // If renewal fails, continue with original token if still valid
                if (timeUntilExpiry > 0) {
                    return request;
                } else {
                    throw renewalError;
                }
            }
        }
        
        // Token valid and no renewal needed
        return request;
        
    } catch (e) {
        return { statusCode: 401, body: e.message };
    }
}
