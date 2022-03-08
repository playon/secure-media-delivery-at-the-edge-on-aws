//DO NOT CHANGE THIS LINE
var secrets = { "secret1_key_to_replace": "secret1_value_to_replace", "secret2_key_to_replace": "secret2_value_to_replace"};
// END

var crypto = require('crypto');

//Response when JWT is not valid.
var response401 = {
    statusCode: 401,
    statusDescription: 'Unauthorized'
};


function jwt_verify(token, uri, session_id, http_headers, querystrings, ip, noVerify) {
    // check token and uri -> obligatory inputs
    if (!token ) {
        throw new Error('No token supplied');
    }
    if ( !uri ) {
        throw new Error('No uri supplied');
    }
    // check segments
    var segments = token.split('.');
    if (segments.length !== 3) {
        throw new Error('Not enough or too many segments in JWT token');
    }

    // All segment should be base64url
    var headerSeg = segments[0];
    var payloadSeg = segments[1];
    var signatureSeg = segments[2];

    // base64url decode and parse JSON
    var header = JSON.parse(_base64urlDecode(headerSeg));
    var payload = JSON.parse(_base64urlDecode(payloadSeg));

    if (!noVerify) {
        var alg = header['alg'];
        var signingMethod;
        var signingType;

        if (alg=='HS256'){
            signingMethod = 'sha256';
            signingType = 'hmac';
        } else {
            throw new Error('Missing or unsupported signing algorithm in JWT header');
        }

        // Verify signature. `sign` will return base64 string.
        var signingInput = [headerSeg, payloadSeg].join('.');

        if (!_verify_signature(signingInput, secrets[header.kid], signingMethod, signingType, signatureSeg)) {
            throw new Error('Signature verification failed');
        }

        if (payload.exp && Date.now() > payload.exp*1000) {
            throw new Error('Token expired');
        }

        if (payload.nbf && Date.now() < payload.nbf*1000) {
            throw new Error('Token not yet valid');
        }


        //check if request URL is not in the exclusion list and omit remaining validations if so
        for (var i=0; i<payload.exc.length; i++){
            if (uri.startsWith(payload.exc[i])) {
                return payload;
            }
        }

        //validate if the request URL matches paths covered by the token
        var uri_match = false;
        for (var i=0; i<payload.paths.length; i++){
            if (uri.startsWith(payload.paths[i])) {
                uri_match = true;
                break;
            }
        }
        if (!uri_match) {
            throw new Error('URI path doesn\'t match any path in the token');
        }


        if (!_verify_intsig(payload, secrets[header.kid], signingMethod, signingType, session_id, http_headers, querystrings, ip)) {
            throw new Error('Internal signature verification failed');
        }

    }

    return true;
}


function _verify_intsig(payload_jwt, intsig_key, method, type, sessionId, request_headers, request_querystrings, request_ip) {
    var indirect_attr = '';

    //recreating signing input based on JWT payload claims and request attributes
    if (payload_jwt['ip']){
        if (request_ip){
            indirect_attr += (request_ip + ':');
        } else {
            throw new Error('intsig reference error: Request IP is missing');
        }
    }

    if (payload_jwt['co']){
        if (request_headers['cloudfront-viewer-country']){
            indirect_attr += (request_headers['cloudfront-viewer-country'].value + ':');
        } else {
            throw new Error('intsig reference error: cloudfront-viewer-country header is missing');
        }
    }

    if (payload_jwt['cty']){
        if (request_headers['cloudfront-viewer-city']){
            indirect_attr += (request_headers['cloudfront-viewer-city'].value + ':');
        } else {
            throw new Error('intsig reference error: cloudfront-viewer-city header is missing');
        }
    }

    if (payload_jwt['ssn']){
        if (sessionId){
            indirect_attr += sessionId + ':';
        } else {
            throw new Error('intsig reference error: Session id is missing');
        }

    }

    if(payload_jwt['headers']) payload_jwt.headers.forEach( attribute => {
        if (request_headers[attribute]){
            indirect_attr += (request_headers[attribute].value + ':' );
        }
    });

    if(payload_jwt['qs']) payload_jwt.qs.forEach( attribute => {
        if (request_querystrings[attribute]){
            indirect_attr += (request_querystrings[attribute].value + ':' );
        }
     });
    indirect_attr = indirect_attr.slice(0,-1);

    if (indirect_attr && !_verify_signature(indirect_attr, intsig_key, method, type, payload_jwt['intsig'])) {
        throw new Error('Internal signature verification failed');
    } else {
        return true;
    }
}


function _verify_signature(input, key, method, type, signature) {
    if(type === "hmac") {
        return (signature === _sign(input, key, method));
    }
    else {
        throw new Error('Algorithm type not recognized');
    }
}


function _sign(input, key, method) {
    return crypto.createHmac(method, key).update(input).digest('base64url');
}


function _base64urlDecode(str) {
    return String.bytesFrom(str, 'base64url')
}


function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var querystrings = request.querystring;
    var uri = request.uri;
    var viewer_ip = event.viewer.ip;

    //Secret key used to verify JWT token.
    //Update with your own key.


    // If no JWT token, then generate HTTP redirect 401 response.
    var sessionId;
    var pathArray = uri.split('/');

    // Inputs grooming and setting internal variables
    var auth_sequence = pathArray[1];
    var auth_sequence_array = auth_sequence.split('.');
    if(auth_sequence_array.length == 4) sessionId=auth_sequence_array.shift();
    var jwtToken = auth_sequence_array.join('.');

    //removing token part of the URL path to restore original URL path pattern recognizable by the Origin
    delete pathArray[1];
    var newUri = pathArray.join("/")
    newUri = newUri.replace(/\/\/+/g, '/')

    //sanity check of the JWT token length
    if (jwtToken.length < 60) {
        console.log("Error: No JWT in the path");
        return response401;
    }

    try{
        jwt_verify(jwtToken, newUri, sessionId, headers, querystrings, viewer_ip);
    }
    catch(e) {
        console.log(e);
        return response401;
    }

    //returining original playback URL to continue on the request path
    request.uri = newUri
    return request;
}