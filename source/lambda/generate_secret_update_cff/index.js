/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/
 const aws = require('aws-sdk');
 const secretsmanager = new aws.SecretsManager();
 var cloudfront = new aws.CloudFront();
 var crypto = require("crypto");
 const fs = require('fs');
 


 function generateSecretKey(){

    var randomKeySuffix = crypto.randomBytes(10).toString('hex');
    var dateObj = new Date();
    var month = dateObj.getUTCMonth() + 1;
    var day = dateObj.getUTCDate();
    var year = dateObj.getUTCFullYear();
    
    var nowDate = year + month + day;
    return  nowDate + '_'+randomKeySuffix;
 }

 function generateSecretValue(){

    return crypto.randomBytes(64).toString('hex');
 }

 function getCffUpdatedCode(secret1Key, secret1Value, secret2Key, secret2Value){
    
    var newContent = "";
    const allFileContents = fs.readFileSync('cff.js', 'utf-8');
        allFileContents.split(/\r?\n/).forEach(line =>  {
            var newLine = "";
            //console.log(`Line from file: ${line}`);

            line = line.trim()
            
            if (line.startsWith('var secrets = '))
                newLine = "var secrets = { \""+secret1Key +"\" : \""+secret1Value +"\", \""+secret2Key +"\": " + secret2Value + " }";
            else if (line.startsWith('exports.handler') || (line.startsWith('exports.decodeString')))
                newLine = "" ;   
            else if (line.includes("return exports.decodeString(str)"))
                newLine = line.replace("exports.", "");
            else 
                newLine = line;

            newContent = newContent + newLine + "\n";
    
            
            
    });
    
    return newContent;
 }

 async function updateCff(functionCodeAsStr){

    console.log("Get ETAG for CloudFront Function " + process.env.CFF_NAME);

    var params = {
        Name: process.env.CFF_NAME
      };

    var response = await cloudfront.describeFunction(params).promise();  
    console.log("ETAG="+response['ETag']);
    console.log("Update CloudFront Function Code");
    params = {
        FunctionCode: Buffer.from(functionCodeAsStr),
        FunctionConfig: { 
            'Comment': 'CloudFront Function used to check a JWT token',
            'Runtime': 'cloudfront-js-1.0'
        },
        IfMatch: response['ETag'],
        Name: process.env.CFF_NAME
      };

     await cloudfront.updateFunction(params).promise();
    console.log("Cloudfront Function updated");

 }

 exports.handler = async (event, context) => {
     console.log("event=" + JSON.stringify(event));
     const temporaryKeyName = process.env.TEMPORARY_KEY_NAME;
     const primaryKeyName = process.env.PRIMARY_KEY_NAME;
     const secondaryKeyName = process.env.SECONDARY_KEY_NAME;


     if(event.initialize){
        //Lambda triggered by the custom resource on deploy
        console.log("Initialize temporary secret")

        //update temporary secret  with a new value
        var newSecretKey = generateSecretKey();
        var newSecretValue = generateSecretValue();
        var params = {
            SecretId: temporaryKeyName, 
            SecretString: JSON.stringify({ newSecretKey : newSecretValue })
        };

        var responseSecret = await secretsmanager.putSecretValue(params).promise();

        console.log("Initialize primary secret")

        //update primary secret  with a new value
        newSecretKey = generateSecretKey();
        newSecretValue = generateSecretValue();
        var params = {
            SecretId: primaryKeyName, 
            SecretString: JSON.stringify({ newSecretKey : newSecretValue })
        };

        responseSecret = await secretsmanager.putSecretValue(params).promise();

        console.log("Initialize temporary secret")

        //update secondary secret  with a new value
        newSecretKey = generateSecretKey();
        newSecretValue = generateSecretValue();
        var params = {
            SecretId: secondaryKeyName, 
            SecretString: JSON.stringify({ newSecretKey : newSecretValue })
        };

        responseSecret = await secretsmanager.putSecretValue(params).promise();

     }else{
        //Lambda triggered by the SF to rotate the secrets

        // Update temporary secret with a new value
        var newSecretKey = generateSecretKey();
        var newSecretValue = generateSecretValue();
        var params = {
            SecretId: temporaryKeyName, 
            SecretString: JSON.stringify({ newSecretKey : newSecretValue })
        };

        var responseSecret = await secretsmanager.putSecretValue(params).promise();

        //get primary secret
        //get primary secret
        params = {
            SecretId: primaryKeyName
        };

        responseSecret = await secretsmanager.getSecretValue(params).promise();
        
        var primarySecretAsJson = JSON.parse(responseSecret.SecretString);

        var primarySecretKeyName = Object.keys(primarySecretAsJson)[0];
        var primarySecretKeyValue = Object.values(primarySecretAsJson)[0];

        


        var cffCode = await getCffUpdatedCode(newSecretKey, newSecretValue, primarySecretKeyName, primarySecretKeyValue);
        await updateCff(cffCode);


     }

     return "OK";
 
 };