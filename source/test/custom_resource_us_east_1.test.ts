const cr = require('../lambda/custom_resource_us_east_1/index.js');
jest.mock("aws-sdk")



describe('Sign request', () => {

    const env = process.env

    beforeEach(() => {
        jest.resetModules()
        process.env = {  
            ROLE_ARN: "MyRoleArn",
            STACK_NAME: "MyStackName",
            LAMBDA_VERSION: "MyLambdaVersion",
            WCU: "100",
            RULE_ID: "MyRuleID",
            RULE_NAME: "MyRuleName",
            DEPLOY_LE: "1"
            };
    })

    afterEach(() => {
        process.env = env
    })

    
  test('Deploy LE - result OK', async () => {
   
    var result = await cr.handler({});
    expect(result).toHaveLength;

 });



})

