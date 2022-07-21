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
 var iam = new aws.IAM();
 var crypto = require("crypto");
 

exports.handler = async (event, context) => {
    console.log("event="+JSON.stringify(event));

    const randomKeySuffix = crypto.randomBytes(5).toString('hex');
    const policyName = process.env.STACK_NAME + '_invokeHttpApi_' + randomKeySuffix;
    const policyArn = `arn:aws:iam::${process.env.ACCOUNT_ID}:policy/${policyName}`;

    const myPolicy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "execute-api:Invoke"
                ],
            "Resource": process.env.API_ARN
            }
        ]
    }

    var params = {
        PolicyDocument: JSON.stringify(myPolicy),
        PolicyName: policyName,
        Description: 'STRING_VALUE',
    };

    await iam.createPolicy(params).promise();
    console.log(`Policy ${policyName} created`);


    const roleName = process.env.ROLE_ARN.split(':')[5].split('/')[1];
    console.log(`Attaching the new policy to the role ${roleName}`);

    params = {
        PolicyArn: policyArn, 
        RoleName: roleName
    };

    await iam.attachRolePolicy(params).promise();
    console.log("Policy attached");
    return "OK";
    
    
};