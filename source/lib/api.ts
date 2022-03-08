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
  CfnOutput,
  aws_lambda as lambda,
  aws_dynamodb as ddb,
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_cloudfront_origins as origins,
  aws_s3_deployment as s3deploy

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


    //TO ADD CONDITION FROM THE WIZARD
    const demoTable = new ddb.Table(this, "Demo",{
      tableName : Aws.STACK_NAME + "_videoassets",
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name: "id", type: ddb.AttributeType.STRING}
    })



    const generateToken = new lambda.Function(this, 'GenerateToken',{
      functionName: Aws.STACK_NAME + '_GenerateToken',
      runtime: runtime,
      code: lambda.Code.fromAsset('lambda/generate_token/nodejs'),
      handler: 'index.handler',
          environment: {
            STACK_NAME: Aws.STACK_NAME,
            TABLE_NAME: demoTable.tableName,
            USERNAME: "aaaaa",
            PASSWORD: "bbbbb"
      },
      layers: [cloudfrontTokenLayer],
    })

    demoTable.grantReadData(generateToken);



    secrets.primarySecret.grantRead(generateToken)
    secrets.secondarySecret.grantRead(generateToken)

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');

    httpApi.addRoutes({
      path: '/tokengenerate',
      methods: [ apigwv2.HttpMethod.GET ],
      integration: new HttpLambdaIntegration('GenerateTokenIntegration', generateToken)
    });



    // Creates a distribution from an S3 bucket.
    const hostingBucket = new s3.Bucket(this, 'HostingBucket');

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('resources/demo_website')],
      destinationBucket: hostingBucket,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment : Aws.STACK_NAME + " - Secure Media Delivery",
      defaultBehavior: { origin: new origins.S3Origin(hostingBucket) },

    });


    new CfnOutput(this, "DistributionDomainName",{
      value: distribution.domainName,
      exportName: Aws.STACK_NAME + 'DomainName',
      description: 'Domain name'
    })

    new CfnOutput(this, "HostingBucketName",{
      value: hostingBucket.bucketName,
      exportName: Aws.STACK_NAME + 'HostingBucket',
      description: 'Hosting bucket name'
    })
  }
}