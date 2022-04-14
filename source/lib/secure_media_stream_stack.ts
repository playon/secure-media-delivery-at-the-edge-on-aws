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
  RemovalPolicy,
  aws_cloudfront as cloudfront,
  aws_dynamodb as ddb,
} from 'aws-cdk-lib';


import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { Api } from './api';
import { CWDashboard } from './dashboard';
import { GetInputParameters } from './input_parameters';
import { RotateSecretsWorkflow } from './rotate_secrets_workflow';
import { Secrets } from './secrets';
import { SessionRevocation } from './session_revocation';



export class SecureMediaStreamingStack extends Stack {


  public readonly sessionToRevoke: ddb.ITable;


  constructor(scope: Construct, id: string, wizardConfiguration: IConfiguration, props?: StackProps) {
    super(scope, id, props);

    const parameters = new GetInputParameters(this, 'InputParameters', wizardConfiguration);

    const checkToken = new cloudfront.Function(this, 'Function', {
      code: cloudfront.FunctionCode.fromFile({ filePath: "lambda/generate_secret_update_cff/index.js" }),
      functionName: Aws.STACK_NAME + '_checkJWTToken',
      comment: 'CloudFront Function used to check a JWT, part of Core Secure Media Stream Delivery'
    })

    const mediatailorRedirect = new cloudfront.Function(this, 'RedirectMediaTailorFunction', {
      code: cloudfront.FunctionCode.fromFile({ filePath: "cff/mediatailor_redirect/index.js" }),
      functionName: Aws.STACK_NAME + '_mediaTailorRedirect',
      comment: 'CloudFront Function used to handle the redirect for MediaTailor'
    })

    const secrets = new Secrets(this, 'Secrets')

    const sessionToRevoke = new ddb.Table(this, "SessionToRevoke",{
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name: "sessionid", type: ddb.AttributeType.STRING},
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY
  });

    this.sessionToRevoke = sessionToRevoke;

    new SessionRevocation(this, "SessionRevocation", sessionToRevoke);

    const rotateSecretsWorkflow = new RotateSecretsWorkflow(this, 'RotateSecrets', {
      secrets: secrets,
      checkTokenFunction: checkToken,
      configuration: parameters.customInputParameters
    } )

    const dashboard = new CWDashboard(this, 'CoreDashboard')
    dashboard.buildCoreDashboard({
      cfFunctionName: checkToken.functionName,
      rotateSecretsWorkflowArn: rotateSecretsWorkflow.workflowArn
    });

    if(parameters.customInputParameters.api){
      new Api(this, 'Api', {
        configuration: parameters.customInputParameters,
        secrets: secrets,
        dashboard: dashboard,
        sessionsTable: sessionToRevoke
      });
    }


    }

}