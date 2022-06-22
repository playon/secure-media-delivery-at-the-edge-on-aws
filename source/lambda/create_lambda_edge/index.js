let fs = require("fs");
let path = require("path");


var AWS = require('aws-sdk');
var lambda = new AWS.Lambda({ region: 'us-east-1' });
const ssm = new AWS.SSM();

const ROLE_ARN = process.env.ROLE_ARN;
const STACK_NAME = process.env.STACK_NAME;
const LAMBDA_VERSION = process.env.LAMBDA_VERSION;
const LAMBDA_ARN = process.env.LAMBDA_ARN;

exports.handler = async (event, context) => {

    console.log("Event=" + JSON.stringify(event));
    let functionArn = '';
    var code_path = path.resolve(__dirname, './le.zip')
    try {
        // Creates Edge Lambda
        var params = {
            Code: {
                ZipFile: fs.readFileSync(code_path)
            },
            FunctionName: STACK_NAME + '_Sig4LE', /* required */
            Handler: 'le.handler', /* required */
            Role: ROLE_ARN, /* required */
            Runtime: 'nodejs14.x', /* required */
            Description: 'Sign sign4 requests'
        };

        let result = await lambda.createFunction(params).promise();
        functionArn = result.FunctionArn;
        saveSecret(LAMBDA_ARN, functionArn);
    } catch (error) {
        console.error(error);
        throw Error('Creating Edge Lambda failed.');
    }

    // Publishes Edge Lambda version
    try {
        let isFunctionStateActive = false
        let retry = 0
        let delayinMilliseconds = 5000;
        while (!isFunctionStateActive) {
            let response = await lambda.getFunctionConfiguration({
                FunctionName: functionArn
            }).promise();
            console.log(`Response from get function configuration ${JSON.stringify(response)}`)
            if (response.State === 'Active' || retry > 10) {
                isFunctionStateActive = true
            } else {
                await waitForTime(delayinMilliseconds)
                retry++
                delayinMilliseconds += 5000;
            }
        }

        let params = {
            FunctionName: functionArn
        };

        let result = await lambda.publishVersion(params).promise();
        saveSecret(LAMBDA_VERSION, `${functionArn}:${result.Version}`);
    } catch (error) {
        console.error(error);
        throw Error('Publishing Edge Lambda version failed.');
    }


}

const saveSecret = (paramName, paramValue) => {
    console.log('Saving to SSM...');

    const  params = {
      Name: paramName,
      Value: paramValue,
      Type: 'String',
      Overwrite: true
    };

    ssm.putParameter(params, (err, data) => {
      if (err) {
        console.log(err, err.stack);
      }
    });

  };

  /** Function to add delay for waiting on process.
 * @param ms time in milliseconds
*/
const waitForTime = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};