const aws = require('aws-sdk');
const qs = require('querystring');
const awsSMD = require("aws-secure-media-delivery");

const docClient = new aws.DynamoDB.DocumentClient();
const stackName = process.env.STACK_NAME;
const tableName = process.env.TABLE_NAME;

const response400 = {
    statusCode: 400,
    body: "Bad request"
}

const response401 = {
    statusCode: 401,
    body: "Unauthorized"
}

awsSMD.setDEBUG(true);
let secret = new awsSMD.Secret(stackName,4);
secret.initSMClient();
let token = new awsSMD.Token(secret);

exports.handler = async (event, context) => {
    var id;
    var viewer_attributes = {};
    var headers = event.headers;
    var request_querystrings = event.queryStringParameters;
    var viewer_ip;
	
    if(event['queryStringParameters'] && event.queryStringParameters['id']){
        id = event.queryStringParameters['id'];
        if(!/^\w+$/.test(id) || (id.length > 200)) return response400;
		delete request_querystrings['id'];
    } else {
        return response400;
    }	

    if(headers['cloudfront-viewer-address']){
        viewer_ip = headers['cloudfront-viewer-address'].substring(0, headers['cloudfront-viewer-address'].lastIndexOf(':'))
    } else {
        viewer_ip = event.requestContext.http.sourceIp;
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

    if(token_policy['ip']) viewer_attributes['ip'] = viewer_ip;

    if(token_policy['co']){
        if(headers['cloudfront-viewer-country']){
            viewer_attributes['co'] = headers['cloudfront-viewer-country'];
        } else if(token_policy['co_fallback'] == false) {
            return response400;
        }
    }
   
    if(token_policy['reg']){
        if(headers['cloudfront-viewer-country-region']){
            viewer_attributes['reg'] = headers['cloudfront-viewer-country-region'];
        } else if(token_policy['reg_fallback'] == false) {
            return response400;
        }
    }

    if(token_policy['cty']){
        if(headers['cloudfront-viewer-city']){
            viewer_attributes['cty'] = headers['cloudfront-viewer-city'];
        } else if(token_policy['cty_fallback'] == false) {
            return response400;
        }
    }

    if(token_policy['headers'] && token_policy['headers'].length > 0){
        viewer_attributes['headers'] = headers;
    }

    if(token_policy['querystrings'] && token_policy['querystrings'].length > 0){
        viewer_attributes['qs'] = request_querystrings;
    }

    console.log(viewer_attributes);

	
    let playback_url = await token.generate(viewer_attributes, `${endpoint_hostname}${video_url}`, token_policy);

    var response = {
    "statusCode": 200,
    "body": playback_url
    };

    return response;
};