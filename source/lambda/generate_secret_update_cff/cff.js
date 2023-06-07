//DO NOT CHANGE THIS LINE
const secrets = { "secret1_key_to_replace": "secret1_value_to_replace", "secret2_key_to_replace": "secret2_value_to_replace"};
// END

//DEBUG FLAG
let DEBUG = true;

const crypto = require('crypto');

//Response when JWT is not valid.
const response401 = {
    statusCode: 401,
    statusDescription: 'Unauthorized'
};

function logToConsole(message){
    if(DEBUG) console.log(message);
}


function checkJWTToken(token, uri, session_id, http_headers, querystrings, ip, noVerify) {

    // check segments
    const segments = token.split('.');
    if (segments.length !== 3) {
        throw new Error('Not enough or too many segments in JWT token');
    }

    // All segment should be base64url
    const headerSeg = segments[0];
    const payloadSeg = segments[1];
    const signatureSeg = segments[2];

    // base64url decode and parse JSON
    let header;
    let payload;


    try{    
        header = JSON.parse(_base64urlDecode(headerSeg));
        payload = JSON.parse(_base64urlDecode(payloadSeg));

    } catch(e){
        console.log(e);
        throw new Error('malformed JWT token');
    }

    if (!noVerify) {
        const signingInput = [headerSeg, payloadSeg].join('.');
        let params = {
            header: header,
            signingInput: signingInput,
            signatureSeg: signatureSeg,
            payload: payload,
            uri: uri,
            ip: ip,
            session_id: session_id,
            http_headers: http_headers,
            querystrings: querystrings
        };
        if (_verify_token(params)) return payload;

    }

}

function _verify_token(params) {
    let header = params['header'];
    let payload = params['payload'];
    let uri = params['uri'];
    let ip = params['ip'];

    if (header['alg'] != 'HS256') {
        throw new Error('Missing or unsupported signing algorithm in JWT header');
    }
    const signingMethod = 'sha256';
    const signingType = 'hmac';

    // Verify signature. `sign` will return base64 string.
    if (!_verify_signature(params['signingInput'], secrets[header.kid], signingMethod, signingType, params['signatureSeg'])) {
        throw new Error('JWT signature verification failed');
    }

    if (payload.exp && Date.now() > payload.exp * 1000) {
        logToConsole(`JWT expiry: ${payload.exp}, current time: ${Date.now}`);
        throw new Error('Token expired');
    }

    if (payload.nbf && Date.now() < payload.nbf * 1000) {
        logToConsole(`JWT nbf: ${payload.nbf}, current time: ${Date.now}`);
        throw new Error('Token not yet valid');
    }


    //check if request URL is not in the exclusion list and omit remaining validations if so
    for (let url of payload.exc) {
        if (uri.startsWith(url)) {
            return true;
        }
    }

    //validate if the request URL matches paths covered by the token
    let uri_match = false;
    let j = 0;
    while ((!uri_match) && j < payload.paths.length) {
        uri_match = uri.startsWith(payload.paths[j]);
        j++;
    }
    if (!uri_match) {
        logToConsole(`request uri: ${uri}`)
        throw new Error('URI path doesn\'t match any path in the token');
    }

    let full_ip;
    if (payload['ip']) {
        full_ip = _verify_ip(payload, ip);
    }

    let request = {
        headers: params['http_headers'],
        querystrings: params['querystrings'],
        ip: full_ip
    }

    if (payload['intsig'] && !_verify_intsig(payload, secrets[header.kid], signingMethod, signingType, params['session_id'], request)) {
        throw new Error('Internal signature verification failed');
    }
}

function _verify_ip(payload, ip) {
    if (!payload['ip_ver']) throw new Error("Missing ip_ver claim required when ip claim is set to true");
    if (parseInt(payload['ip_ver']) != 4 && parseInt(payload['ip_ver'] != 6)) throw new Error("Incorrect ip_ver claim value. Must be either 4 or 6");
    if (ip.includes('.')) {
        if (payload['ip_ver'] != 4) throw new Error("Viewer's IP version (4) doesn't match ip_ver claim");
        return ip;
    } else if (ip.includes(':')) {
        if (payload['ip_ver'] != 6) throw new Error("Viewer's IP version (6) doesn't match ip_ver claim");
        const hextets = ip.split(':').map(item => { return (item.length ? Array(5 - item.length).join('0') + item : '') });
        return hextets.join(':');
    } else {
        throw new Error("Viewer's IP version not recognized");
    }
}

function _verify_intsig(payload_jwt, intsig_key, method, type, sessionId, request) {
    let indirect_attr = '';
    let request_headers = request.headers;
    let request_querystrings = request.querystrings;

    //recreating signing input based on JWT payload claims and request attributes
    indirect_attr = _verify_payload(payload_jwt, request.ip, indirect_attr, request_headers, sessionId);
    if (typeof indirect_attr === "boolean") return indirect_attr;

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
        logToConsole("Indirect attributes input string:" + indirect_attr);
        return false;
    } 
    return true;
}

function _verify_country_region(payload_jwt, request_headers, indirect_attr) {
    if (payload_jwt['co']){
        if (request_headers['cloudfront-viewer-country']){
            indirect_attr += (request_headers['cloudfront-viewer-country'].value + ':');
        } else if(payload_jwt['co_fallback']) {
            logToConsole("Viewer country header missing but co_fallback set to true. Skipping internal signature verification");
            return true;
        } else {
            throw new Error('intsig reference error: cloudfront-viewer-country header is missing');
        }
    }

    if (payload_jwt['reg']){
        if (request_headers['cloudfront-viewer-country-region']){
            indirect_attr += (request_headers['cloudfront-viewer-country-region'].value + ':');
        } else if(payload_jwt['reg_fallback']) {
            logToConsole("Viewer country region header missing but reg_fallback set to true. Skipping internal signature verification");
            return true;
        } else {
            throw new Error('intsig reference error: cloudfront-viewer-country-region header is missing');
        }
    }

    return indirect_attr;
}

function _verify_payload(payload_jwt, request_ip, indirect_attr, request_headers, sessionId) {
    if (payload_jwt['ip']){
        if (!request_ip){
            throw new Error('intsig reference error: Request IP is missing');
        } 
        indirect_attr += (request_ip + ':');
    }

    indirect_attr = _verify_country_region(payload_jwt, request_headers, indirect_attr);
    if (typeof indirect_attr === "boolean") return indirect_attr;

    if (payload_jwt['ssn']){
        if (!sessionId){
            throw new Error('intsig reference error: Session id is missing');
        } 
        indirect_attr += sessionId + ':';
    }

    return indirect_attr;
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
    return exports.decodeString(str);//'exports' non supported by CFF. Only used to run unit tests. Removed before deployment.
}

function decodeString(str) {
    return String.bytesFrom(str, 'base64url');
}

  
function processJWTToken(myEvent){

    const headers = myEvent.request.headers;

    const querystrings = myEvent.request.querystring;
    const uri = myEvent.request.uri;
    const viewer_ip = myEvent.viewer.ip;


    let sessionId;

    const pathArray = uri.split('/');

    //initial checks if token is present
    const auth_sequence = pathArray[1];
    if(!auth_sequence || pathArray.length < 3){
        throw new Error("Error: No token is present");
    }

    //inputs grooming and setting internal variables
    const auth_sequence_array = auth_sequence.split('.');
    if(auth_sequence_array.length == 4) sessionId=auth_sequence_array.shift();
    const jwtToken = auth_sequence_array.join('.');

    //sanity check of the JWT token length
    if (jwtToken.length < 60) {
        throw new Error("Error: Invalid JWT token in the path");
    }

    //removing token part of the URL path to restore original URL path pattern recognizable by the Origin
    pathArray.splice(1,1);
    const newUri = pathArray.join("/")

    try{
        checkJWTToken(jwtToken, newUri, sessionId, headers, querystrings, viewer_ip);
        return newUri;
    }
    catch(e) {
        logToConsole(e);
        throw new Error("Error validating the token");
    }
}

function handler(event) {
    logToConsole(event);
    try{
        let request = event.request;
        const newUri = processJWTToken(event);
        //returning original playback URL to continue on the request path
        request.uri = newUri
        console.log("X_JWT_CHECK VALID");
        return request;
    }catch(error){
        logToConsole(error);
        console.log("X_JWT_CHECK INVALID");
        return response401;
    }

}

exports.handler = handler;//'exports' non supported by CFF. Only used to run unit tests. Removed before deployment.
exports.decodeString = decodeString;//'exports' non supported by CFF. Only used to run unit tests. Removed before deployment.

