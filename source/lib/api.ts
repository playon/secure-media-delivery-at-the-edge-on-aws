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
  CfnOutput,
  Stack,
  RemovalPolicy,
  aws_lambda as lambda,
  aws_s3_deployment as s3deploy,
  aws_dynamodb as ddb,
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_cloudfront_origins as origins,
  aws_logs as logs,
} from "aws-cdk-lib";

import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Secrets } from "./secrets";
import { LoadAssetsTable } from "./load_assets_table";
import { CWDashboard } from "./dashboard";
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";

const API_GATEWAY_LOG_FORMAT = '{"requestId":"$context.requestId","ip": "$context.identity.sourceIp","requestTime":"$context.requestTime","requestTimeEpoch":"$context.requestTimeEpoch","httpMethod":"$context.httpMethod","routeKey":"$context.routeKey","status":"$context.status","protocol":"$context.protocol","responseLength":"$context.responseLength","integration error":"$context.integrationErrorMessage"}';


export interface IConfigProps {
  configuration: IConfiguration;
  secrets: Secrets;
  dashboard: CWDashboard;
  sessionsTable: ddb.ITable;
}

export class Api extends Construct {
  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    var runtime: lambda.Runtime;
    var language: string;

    if (props.configuration.api?.language == "nodejs") {
      runtime = lambda.Runtime.NODEJS_14_X;
      language = "nodejs";
    } else {
      runtime = lambda.Runtime.PYTHON_3_7;
      language = "python";
    }
    const cloudfrontTokenLayer = new lambda.LayerVersion(
      this,
      "RotateSecretLayer",
      {
        compatibleRuntimes: [runtime],
        code: lambda.Code.fromAsset(
          "lambda/layers/aws_secure_media_delivery_" + language
        ),
        description: "Layer used by generate new secret lambda",
      }
    );

    const s3Logs = new s3.Bucket(this, "LogsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const hostingBucket = new s3.Bucket(this, "HostingBucket", {
      serverAccessLogsBucket: s3Logs,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const demoAssetsTable = new ddb.Table(this, "DemoTable", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: ddb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    new LoadAssetsTable(this, "AssetsTable", {
      table: demoAssetsTable,
      configuration: props.configuration,
    });

    const folder = props.configuration.demo
      ? "demo_website"
      : "empty_demo_website";

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("resources/" + folder)],
      destinationBucket: hostingBucket,
    });

    const generateToken = new lambda.Function(this, "GenerateToken", {
      functionName: Aws.STACK_NAME + "_GenerateToken",
      runtime: runtime,
      code: lambda.Code.fromAsset("lambda/generate_token/" + language),
      handler: "index.handler",
      environment: {
        STACK_NAME: Aws.STACK_NAME,
        TABLE_NAME: demoAssetsTable.tableName,
        USERNAME: props.configuration.demo?.username!,
        PASSWORD: props.configuration.demo?.password!,
      },
      layers: [cloudfrontTokenLayer],
    });

    // Set Lambda Logs Retention and Removal Policy
    new logs.LogGroup(this, "ReadStreamLogs", {
      logGroupName: "/aws/lambda/" + generateToken.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const saveSessionToDdb = new lambda.Function(this, "SaveManualSession", {
      functionName: Aws.STACK_NAME + "_SaveManualSession",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/save_manual_session/python"),
      handler: "index.handler",
      environment: {
        TABLE_NAME: props.sessionsTable.tableName,
        TTL: "7",
      },
    });

    demoAssetsTable.grantReadData(generateToken);
    props.sessionsTable.grantReadWriteData(saveSessionToDdb);

    props.secrets.primarySecret.grantRead(generateToken);
    props.secrets.secondarySecret.grantRead(generateToken);

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: 'SecureMediaStreamDemoAPI',
      description: 'Secure Media Stream Demo API',
    });

    //const stage = httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    const log = new LogGroup(this, "HttpApiLogGroup", {
      logGroupName: "/aws/apigw/" + httpApi.httpApiName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const stage = <CfnStage>httpApi.defaultStage!.node.defaultChild;
    stage.accessLogSettings = {
        destinationArn: log.logGroupArn,
        format: API_GATEWAY_LOG_FORMAT,
    };

    httpApi.addRoutes({
      path: "/tokengenerate",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "GenerateTokenIntegration",
        generateToken
      ),
    });

    httpApi.addRoutes({
      path: "/sessionrevoke",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "RevokeSessionIntegration",
        saveSessionToDdb
      ),
    });

    const region = Stack.of(this).region;

    const myOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      "OriginRequestPolicy",
      {
        originRequestPolicyName: Aws.STACK_NAME + "CMS",
        comment: "A default policy",
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
          "CloudFront-Viewer-Address",
          "CloudFront-Viewer-Country",
          "CloudFront-Viewer-City",
          "Referer",
          "User-Agent"
        ),
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      }
    );

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: Aws.STACK_NAME + " - Demo website Secure Media Delivery",
      defaultRootObject: "index.html",
      enableLogging: true,
      logBucket: s3Logs,
      logFilePrefix: "distribution-access-logs/",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      defaultBehavior: {
        origin: new origins.S3Origin(hostingBucket),
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/tokengenerate": {
          origin: new origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
            {}
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: myOriginRequestPolicy,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy
              .CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
        "/sessionrevoke": {
          origin: new origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
            {}
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: myOriginRequestPolicy,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy
              .CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });

    new CfnOutput(this, "DistributionDomainName", {
      value: "https://" + distribution.domainName,
      exportName: Aws.STACK_NAME + "DomainName",
      description: "Demo Website",
    });

    props.dashboard.buildApiDashboard({
      lambdaFunctionName: generateToken.functionName,
      region: region,
    });

    new CfnOutput(this, "ApiEndpoint", {
      value: `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
      exportName: Aws.STACK_NAME + "ApiEndpoint",
      description: "Endpoint",
    });

    new CfnOutput(this, "HostingBucketName", {
      value: hostingBucket.bucketName,
      exportName: Aws.STACK_NAME + "HostingBucket",
      description: "Hosting bucket name",
    });
  }
}
