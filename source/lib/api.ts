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
//import * as fs from 'fs';
//import * as path from 'path';

import {
  Aws,
  aws_lambda as lambda,
  //aws_logs as logs,
  //aws_lambda_nodejs as node


} from 'aws-cdk-lib';

import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { Secrets } from './secrets';

export class Api extends Construct {

  constructor(scope: Construct, id: string, configuration: IConfiguration, secrets: Secrets) {
    super(scope, id);
    console.log(configuration.api)

    var runtime: lambda.Runtime;

    if(configuration.api?.language=='nodejs'){
      runtime = lambda.Runtime.NODEJS_14_X
    }else{
      runtime = lambda.Runtime.PYTHON_3_7
    }

    const cloudfrontTokenLayer = new lambda.LayerVersion(this, 'RotateSecretLayer', {
      compatibleRuntimes: [
        runtime
      ],
      code: lambda.Code.fromAsset('lambda/layers/cloudfronttoken_'+configuration.api?.language),
      description: 'Layer used by generate new secret lambda',
    });


    const generateToken = new lambda.Function(this, 'GenerateToken',{
      functionName: Aws.STACK_NAME + '_GenerateToken',
      runtime: runtime,
      code: lambda.Code.fromAsset('lambda/generate_token/nodejs'),
      handler: 'index.handler',
          environment: {
            STACK_NAME: Aws.STACK_NAME,
      },
      layers: [cloudfrontTokenLayer],
    })

    secrets.primarySecret.grantRead(generateToken)
    secrets.secondarySecret.grantRead(generateToken)

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');

    httpApi.addRoutes({
      path: '/tokengenerate',
      methods: [ apigwv2.HttpMethod.GET ],
      integration: new HttpLambdaIntegration('GenerateTokenIntegration', generateToken)
    });

  }
}