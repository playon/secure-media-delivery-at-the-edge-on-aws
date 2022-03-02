const cfToken = require("cloudfront-token");
const aws = require('aws-sdk');

console.log('Loading function');
const stackName = process.env.STACK_NAME;

smClient = new aws.SecretsManager();

cfToken.SecretsConfigure({secrets_manager_client: smClient, secrets_prefix: stackName});
var tokenGenerator = new cfToken(10);

exports.handler = async (event, context) => {

    console.log('Received event:', JSON.stringify(event, null, 2));
    token_attributes = {
        ip: '10.0.0.1',
        co: 'GB',
        cty: 'London',
        ssn: 'generate_12',
        nbf: 1645711008,
        exp: 1745710998,
        headers: [{key: 'user-agent', value: 'Chrome92'}],
        qs: [{key:'m', value:'1235321'}],
        paths: ['/video1/test/','/video2/hls/'],
        exc: ['/tm/']
    };

    await tokenGenerator.generateToken(token_attributes, 'primary', 'http://cloudfront.net/video1/test/index.m3u8?m=1235321').then((out)=>console.log(out))

    //console.log(url);
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': JSON.stringify("OK")
    }
};
