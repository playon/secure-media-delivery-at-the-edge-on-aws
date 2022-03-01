const aws = require('aws-sdk');

const cfToken = require("./cloudfront-token");
smClient = new aws.SecretsManager({region: 'us-east-1'});

cfToken.SecretsConfigure({secrets_manager_client: smClient, secrets_prefix: "CoreStack"});
var tokenGenerator = new cfToken(10);
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
tokenGenerator.generateToken(token_attributes, 'primary', 'http://cloudfront.net/video1/test/index.m3u8?m=1235321').then((out)=>console.log(out))