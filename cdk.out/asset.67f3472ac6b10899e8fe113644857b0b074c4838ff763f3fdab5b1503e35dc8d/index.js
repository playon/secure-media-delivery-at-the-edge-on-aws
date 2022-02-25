//DO NOT CHANGE THESE 4 LINES
var secrets = { "secret1_key": "to_replace","secret1_value": "to_replace","secret2_key": "to_replace","secret2_value": "to_replace"}
// END

var crypto = require('crypto');

//Response when JWT is not valid.
var response401 = {
    statusCode: 401,
    statusDescription: 'Unauthorized'
};

function jwt_decode(headerSeg, payloadSeg, signatureSeg, key) {
    console.log("jwt decoding..")

    var signingMethod = 'sha256';
    var signingType = 'hmac';

    var payload = JSON.parse(_base64urlDecode(payloadSeg));

    // Verify signature. `sign` will return base64 string.
    var signingInput = [headerSeg, payloadSeg].join('.');

    if (!_verify(signingInput, key, signingMethod, signingType, signatureSeg)) {
        throw new Error('Signature verification failed');
    }else{
        console.log("Token verified - OK")
    }


    //TODO check path
    //if (!uri.includes(payload.filename)) {
    //    throw new Error('File paths do not match ' + uri + " " + payload.filename)
    //    }
    // Support for nbf and exp claims.
    // According to the RFC, they should be in seconds.
    if (payload.nbf && Date.now() < payload.nbf * 1000) {
        throw new Error('Token not yet active');
    }else{
        console.log("Token active - OK")
    }

    if (payload.exp && (Date.now() > payload.exp * 1000)) {
        throw new Error('Token expired');
    }else{
        console.log("Token not expired - OK")
    }


}

function _verify(input, key, method, type, signature) {
    if (type === "hmac") {
        return (signature === _sign(input, key, method));
    } else {
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
    // NOTE: This example function is for a viewer request event trigger.
    // Choose viewer request for event trigger when you associate this function with a distribution.
    //console.log(event);
    var check_token = "INVALID";
    var request = event.request;
    var headers = request.headers;
    var uri = request.uri;


    // If no JWT token, then generate HTTP redirect 401 response.
    //console.log("URI=" + uri)
    var pathArray = uri.split('/');
    var jwtToken = pathArray[1];
    delete pathArray[1];
    var newUri = pathArray.join("/")
    newUri = newUri.replace(/\/\/+/g, '/')
    console.log("NEW_URI=" + newUri);
    //console.log("token=" + jwtToken);

    if (jwtToken.length < 60) {
        console.log("Error: No JWT in the querystring or path");
        return response401;
    }

    var segments = jwtToken.split('.');
    if (segments.length !== 3) {
        throw new Error('Not enough or too many segments');
    }

    // All segment should be base64
    var headerSeg = segments[0];
    var payloadSeg = segments[1];
    var signatureSeg = segments[2];

    console.log("1");
    // base64 decode and parse JSON
    var header = JSON.parse(_base64urlDecode(headerSeg));
    console.log("header=" + JSON.stringify(header));
    var keyToDecode = "";

    if (secrets.secret1_key === header.kid) {
        keyToDecode = secrets.secret1_value;
    } else if (secrets.secret2_key === header.kid) {
        keyToDecode = secrets.secret2_value;
    } else {
        throw new Error('Invalid kid in header');
    }

    try {
        jwt_decode(headerSeg, payloadSeg, signatureSeg, keyToDecode);
        check_token = "VALID";
    } catch (e) {
        console.log(e);

    }

    console.log('X_JWT_CHECK ' + check_token);

    request.uri = newUri
    //console.log(newUri)
    return request;
}