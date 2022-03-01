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
  Aws,
  aws_lambda as lambda,

} from 'aws-cdk-lib';

import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';

export class Api extends Construct {

  constructor(scope: Construct, id: string, configuration: IConfiguration) {
    super(scope, id);

    var runtime: lambda.Runtime;

    if(configuration.api?.language=='nodejs'){
      runtime = lambda.Runtime.NODEJS_14_X
    }else{
      runtime = lambda.Runtime.PYTHON_3_7
    }

    //Generate token
    const generateToken = new lambda.Function(this, 'GenerateToken',{
      functionName: Aws.STACK_NAME + '_GenerateToken',
      runtime: runtime,
      code: lambda.Code.fromAsset('lambda/generate_token/' + configuration.api?.language),
      handler: 'index.lambda_handler'
    })

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');


    httpApi.addRoutes({
      path: '/token',
      methods: [ apigwv2.HttpMethod.GET ],
      integration: new HttpLambdaIntegration('GenerateTokenIntegration', generateToken)
    });
  }
}