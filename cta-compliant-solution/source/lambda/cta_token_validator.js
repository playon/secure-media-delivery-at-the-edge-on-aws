/**
 * CTA-5007-B Native CloudFront Function
 * Pure implementation of Common Access Token specification
 */

var cf = require('cloudfront');

var CTA = {
    EXP: 4,           // Expiration
    NBF: 5,           // Not Before  
    CTI: 7,           // Token ID
    CATNIP: 311,      // Network IP
    CATU: 312,        // URI restrictions
    CATGEOISO3166: 316 // Country codes
};

function extractToken(request) {
    // CTA-5007-B standard header
    if (request.headers["cta-common-access-token"]) {
        return request.headers["cta-common-access-token"].value;
    }
    
    // Query parameter
    if (request.querystring && request.querystring.CAT) {
        return request.querystring.CAT.value;
    }
    
    // Path parameter /{TOKEN}/content
    var segments = request.uri.split('/');
    if (segments[1] && segments[1].length > 50) {
        segments.splice(1, 1);
        request.uri = segments.join('/') || '/';
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

async function handler(event) {
    try {
        var request = event.request;
        var token = extractToken(request);
        
        if (!token) {
            return { statusCode: 401, body: "missing_token" };
        }
        
        var tokenBuffer = Buffer.from(token, 'base64url');
        var kvs = cf.kvs();
        
        // Check revocation first (KV store for fast lookup)
        var cwt = cf.cwt.validateToken(tokenBuffer, { key: await kvs.get("key:default") });
        
        if (cwt.payload[CTA.CTI]) {
            var revoked = await kvs.get("revoked:" + cwt.payload[CTA.CTI]);
            if (revoked) {
                return { statusCode: 401, body: "token_revoked" };
            }
        }
        
        validateClaims(cwt.payload, request, event.viewer);
        return request;
        
    } catch (e) {
        return { statusCode: 401, body: e.message };
    }
}
