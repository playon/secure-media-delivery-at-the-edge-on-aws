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
  Stack,
  RemovalPolicy,
  aws_lambda as lambda,
  aws_s3_deployment as s3deploy,
  aws_dynamodb as ddb,
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_cloudfront_origins as origins,


} from 'aws-cdk-lib';

import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { Secrets } from './secrets';
import { LoadAssetsTable } from './load_assets_table';
import { CWDashboard } from './dashboard';

export class Api extends Construct {

  constructor(scope: Construct, id: string, configuration: IConfiguration, secrets: Secrets, dashboard: CWDashboard) {
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
      code: lambda.Code.fromAsset('lambda/layers/aws_secure_media_delivery_'+configuration.api?.language),
      description: 'Layer used by generate new secret lambda',
    });

    const hostingBucket = new s3.Bucket(this, 'HostingBucket');

    const demoAssetsTable = new ddb.Table(this, "DemoTable",{
      tableName : Aws.STACK_NAME + "_videoassets",
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name: "id", type: ddb.AttributeType.STRING},
      removalPolicy: RemovalPolicy.DESTROY
    })

    new LoadAssetsTable(this, "AssetsTable", {
      table: demoAssetsTable,
      configuration: configuration
    });

    const folder = configuration.demo ? "demo_website" : "empty_demo_website";

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('resources/' + folder)],
      destinationBucket: hostingBucket,
    });

    const generateToken = new lambda.Function(this, 'GenerateToken',{
      functionName: Aws.STACK_NAME + '_GenerateToken',
      runtime: runtime,
      code: lambda.Code.fromAsset('lambda/generate_token/nodejs'),
      handler: 'index.handler',
          environment: {
            STACK_NAME: Aws.STACK_NAME,
            TABLE_NAME: demoAssetsTable.tableName,
            USERNAME: configuration.demo?.username!,
            PASSWORD: configuration.demo?.password!
      },
      layers: [cloudfrontTokenLayer],
    })



    demoAssetsTable.grantReadData(generateToken);



    secrets.primarySecret.grantRead(generateToken)
    secrets.secondarySecret.grantRead(generateToken)

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');

    httpApi.addRoutes({
      path: '/tokengenerate',
      methods: [ apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST ],
      integration: new HttpLambdaIntegration('GenerateTokenIntegration', generateToken)
    });


    const region = Stack.of(this).region;
    // Creates a distribution from an S3 bucket.



    const myOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
      originRequestPolicyName: Aws.STACK_NAME + '_CMS',
      comment: 'A default policy',
      //cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('CloudFront-Viewer-Address', 'CloudFront-Viewer-Country', 'CloudFront-Viewer-City', 'Referer', 'User-Agent'),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment : Aws.STACK_NAME + " - Secure Media Delivery",
      defaultRootObject: "index_hls.html",
      defaultBehavior: {
        origin: new origins.S3Origin(hostingBucket),
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      additionalBehaviors: {
        '/tokengenerate': {

          origin: new origins.HttpOrigin(`${httpApi.apiId}.execute-api.${region}.amazonaws.com`, {
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: myOriginRequestPolicy,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });

    new CfnOutput(this, "DistributionDomainName",{
      value: 'https://' + distribution.domainName,
      exportName: Aws.STACK_NAME + 'DomainName',
      description: 'Domain name'
    })

    dashboard.buildApiDashboard({
        lambdaFunctionName: generateToken.functionName,
        region: region
    })

    new CfnOutput(this, "ApiEndpoint",{
      value: `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
      exportName: Aws.STACK_NAME + 'ApiEndpoint',
      description: 'Endpoint'
    })

    new CfnOutput(this, "HostingBucketName",{
      value: hostingBucket.bucketName,
      exportName: Aws.STACK_NAME + 'HostingBucket',
      description: 'Hosting bucket name'
    })
  }
}