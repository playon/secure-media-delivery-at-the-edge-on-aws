const aws = require('aws-sdk');
const qs = require('querystring');
const cfToken = require("aws-secure-media-delivery");

const docClient = new aws.DynamoDB.DocumentClient();
const stackName = process.env.STACK_NAME;
const tableName = process.env.TABLE_NAME;

const user = process.env.USERNAME;
const pass = process.env.PASSWORD;

const smClient = new aws.SecretsManager();

cfToken.SecretsConfigure({secrets_manager_client: smClient, secrets_prefix: stackName});
var tokenGenerator = new cfToken(10);

const response400 = {
    statusCode: 400,
    body: "Bad request"
}

const response401 = {
    statusCode: 401,
    body: "Unauthorized"
}

exports.handler = async (event, context) => {
    console.log("Event received:"+event)
    var id;
    var token_attributes = {};
    var headers = event.headers;
    var request_querystrings = event.queryStringParameters;
    var viewer_ip;
    if(headers['cloudfront-viewer-address']){
        viewer_ip = headers['cloudfront-viewer-address'].substring(0, headers['cloudfront-viewer-address'].lastIndexOf(':'))
    } else {
        viewer_ip = event.requestContext.http.sourceIp;
    }

    var auth_header = '';

    //simple authentication logic using authorization header
    var authorized = Buffer.from(user+':'+pass).toString('base64');
    if(headers['authorization']) auth_header = headers['authorization'].split(' ')[1];

    if (auth_header != authorized) {
        console.log('Authentication failed');
        //return error when authentication failed
        return response401;
    }


    if(event['queryStringParameters'] && event.queryStringParameters['id']){
        id = event.queryStringParameters['id'];
		delete request_querystrings['id'];
    } else {
        return response400;
    }

    var params = {
        TableName: tableName,
        Key:{"id": id}
    };

    var video_metadata = await docClient.get(params).promise();
    console.log("From DynamoDB:"+video_metadata);
    if(!video_metadata.Item){
        return {
        "statusCode": 404,
        "body": 'No video asset for the given ID'
        };
    }
    var endpoint_hostname = video_metadata.Item['endpoint_hostname'];
    var video_url = video_metadata.Item['url_path'];
    var token_policy = video_metadata.Item.token_policy;

    if(token_policy['ip']) token_attributes['ip'] = viewer_ip;

    if(token_policy['co']){
        if(headers['cloudfront-viewer-country']){
            token_attributes['co'] = headers['cloudfront-viewer-country'];
        } else if(token_policy['co_fallback'] == false) {
            return response400;
        }
    }

    if(token_policy['cty']){
        if(headers['cloudfront-viewer-city']){
            token_attributes['cty'] = headers['cloudfront-viewer-city'];
        } else if(token_policy['cty_fallback'] == false) {
            return response400;
        }
    }

    if(token_policy['session_auto_generate']){
        token_attributes['ssn'] = `generate_${token_policy['session_auto_generate']}`;
    }

    if(token_policy['nbf']){
        token_attributes['nbf'] = parseInt(token_policy['nbf']);
    }

    if(token_policy['exp']){
        var reg_digits=/^[\d]+$/;
        var reg_delay = /^\+([\d]+)(h|m)$/;
        var delay;

        delay = token_policy['exp'].match(reg_delay);
        if(delay){
            token_attributes['exp'] = parseInt(Date.now()/1000) + (delay[1] * (delay[2]=='h'?3600:60));
        } else if(token_policy['exp'].match(reg_digits)){
            token_attributes['exp'] = parseInt(token_policy['exp']);
        }
    } else {
        return response400;
    }

    if(token_policy['paths'] && token_policy['paths'].length > 0){
        token_attributes['paths'] = token_policy['paths'];
    } else {
        return response400;
    }

    if(token_policy['exc'] && token_policy['exc'].length > 0) token_attributes['exc'] = token_policy['exc'];

    if(token_policy['headers'] && token_policy['headers'].length > 0){
        token_attributes['headers'] = [];
        token_policy['headers'].forEach((h) => {
            var header_value = headers[h.toLowerCase()]?headers[h.toLowerCase()]:'';
           token_attributes['headers'].push({'key': h.toLowerCase(), 'value': header_value});
        });
    }

    var [pathname, asset_qs, rest] = video_url.split('?');
    if(rest) throw "Invalid video url path format";
    var asset_qs_parsed = qs.parse(asset_qs);

    if(token_policy['qs'] && token_policy['qs'].length > 0){
        token_attributes['qs'] = [];
        token_policy['qs'].forEach((q) => {
            var qs_param_value = '';
            if(asset_qs_parsed[q.toLowerCase()]){
                qs_param_value = asset_qs_parsed[q.toLowerCase()];
                delete request_querystrings[q.toLowerCase()]
            } else if(request_querystrings[q.toLowerCase()]){
                qs_param_value = request_querystrings[q.toLowerCase()];
            }
           token_attributes['qs'].push({'key': q.toLowerCase(), 'value': qs_param_value});
        });
    }

    console.log(token_attributes);

	var additional_qs_params = qs.encode(request_querystrings);
    if(additional_qs_params) additional_qs_params = (asset_qs?"&":"?") + additional_qs_params;
    var playback_url = await tokenGenerator.generateToken(token_attributes, 'primary', `https://${video_metadata.Item['endpoint_hostname']}${video_metadata.Item['url_path']}${additional_qs_params}`);

    var response = {
    "statusCode": 200,
    "body": playback_url
    };

    return response;
};
