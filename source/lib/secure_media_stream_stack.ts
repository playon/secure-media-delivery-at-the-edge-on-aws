/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  Stack,
  StackProps,
  Aws,
  aws_cloudfront as cloudfront
} from 'aws-cdk-lib';


import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { CWDashboard } from './dashboard';
import { RotateSecretsWorkflow } from './rotate_secrets_workflow';
import { Secrets } from './secrets';
import { SessionRevocation } from './session_revocation';

export class SecureMediaStreamingStack extends Stack {
  constructor(scope: Construct, id: string, configuration: IConfiguration, props?: StackProps) {
    super(scope, id, props);

    if(configuration.sessionRevocation){
      new SessionRevocation(this, 'SessionRevocationStack');
    }

    // Create the Cloudfront Function used to check the JWT token
    const checkToken = new cloudfront.Function(this, 'Function', {
      code: cloudfront.FunctionCode.fromFile({ filePath: "lambda/generate_new_secret/index.js" }),
      functionName: Aws.STACK_NAME + '_checkJWTToken',
      comment: 'CloudFront Function used to check a JWT, part of Core Secure Media Stream Delivery'
    })
    console.log(configuration)

    const secrets = new Secrets(this, 'Secrets')

    const rotateSecretsWorkflow = new RotateSecretsWorkflow(this, 'RotateSecrets', {
      secrets: secrets,
      checkTokenFunction: checkToken

    })

    const dashboard = new CWDashboard(this, 'CoreDashboard')

    dashboard.buildCoreDashboard({
        cfFunctionName: checkToken.functionName,
        rotateSecretsWorkflowName: rotateSecretsWorkflow.workflowName
      }
      )
    }

}