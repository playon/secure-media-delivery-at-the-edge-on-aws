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
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_cloudfront_origins as origins,
  aws_logs as logs,
  Duration,
} from "aws-cdk-lib";

import { Construct } from "constructs";

import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { CustomResourceLambdaEdge } from "./custom_resources_lambda_edge";
import { IFunction } from "aws-cdk-lib/aws-lambda";

export interface IConfigProps {
  generateTokenLambdaFunction: IFunction;
  saveSessionToDDBLambdaFunction: IFunction;
  sig4LambdaVersionParamName: string;
  sig4LambdaArnParamName: string;
  sig4LambdaRoleArnParamName: string;
  demoWebsite: boolean;
}

export class Endpoints extends Construct {
  private API_GATEWAY_LOG_FORMAT: string =
    '{"requestId":"$context.requestId","ip": "$context.identity.sourceIp","requestTime":"$context.requestTime","requestTimeEpoch":"$context.requestTimeEpoch","httpMethod":"$context.httpMethod","routeKey":"$context.routeKey","status":"$context.status","protocol":"$context.protocol","responseLength":"$context.responseLength","integration error":"$context.integrationErrorMessage"}';

  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    const s3Logs = new s3.Bucket(this, "LogsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicPolicy: true,
        blockPublicAcls: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
       }),
    });

    const hostingBucket = new s3.Bucket(this, "HostingBucket", {
      serverAccessLogsBucket: s3Logs,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicPolicy: true,
        blockPublicAcls: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
       }),
    });

    const folder = props.demoWebsite ? "demo_website" : "empty_demo_website";

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("resources/" + folder)],
      destinationBucket: hostingBucket,
    });

    const authorizer = new HttpIamAuthorizer();

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName:  Aws.STACK_NAME + "_SecureMediaStreamDemoAPI",
      description: "Secure Media Stream Demo API",
      defaultAuthorizer: authorizer,
    });

    const log = new LogGroup(this, "HttpApiLogGroup", {
      logGroupName: "/aws/apigw/" + httpApi.httpApiName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const stage = <CfnStage>httpApi.defaultStage!.node.defaultChild;
    stage.accessLogSettings = {
      destinationArn: log.logGroupArn,
      format: this.API_GATEWAY_LOG_FORMAT,
    };

    httpApi.addRoutes({
      path: "/tokengenerate",
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "GenerateTokenIntegration",
        props.generateTokenLambdaFunction
      ),
    });

    httpApi.addRoutes({
      path: "/sessionrevoke",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "RevokeSessionIntegration",
        props.saveSessionToDDBLambdaFunction
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

    const myResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      responseHeadersPolicyName: Aws.STACK_NAME+'SecureStreamingPolicy',
      comment: 'ResponseHeadersPolicy for Secure Media Streaming',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: "default-src 'none'; script-src 'self' https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' https://cdn.jsdelivr.net; img-src 'self'; connect-src *; media-src blob:; worker-src blob:", override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.seconds(31536000), includeSubdomains: true, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    const apiArn = `arn:aws:execute-api:${region}:*:${httpApi.apiId}/*`;

    const customResourceLE = new CustomResourceLambdaEdge(
      this,
      "CustomResourceLE",
      {
        sig4LambdaVersionParamName: props.sig4LambdaVersionParamName,
        sig4LambdaArnParamName: props.sig4LambdaArnParamName,
        sig4LambdaRoleArnParamName: props.sig4LambdaRoleArnParamName,
        apiArn,
      }
    );

    const httpApiOrigin = new origins.HttpOrigin(
      `${httpApi.apiId}.execute-api.${region}.amazonaws.com`
    );

    const lambdaEdge = lambda.Version.fromVersionArn(
      this,
      "CfLambdaEdge",
      customResourceLE.lambdaEdgeVersionArn
    );

    const s3origin = new origins.S3Origin(hostingBucket);

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: Aws.STACK_NAME + " - Demo website Secure Media Delivery",
      defaultRootObject: "index.html",
      enableLogging: true,
      logBucket: s3Logs,
      logFilePrefix: "distribution-access-logs/",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      defaultBehavior: {
        origin: s3origin,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/index.html": {
          origin: s3origin,
          responseHeadersPolicy: myResponseHeadersPolicy,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,

        },
        "/tokengenerate": {
          origin: httpApiOrigin,
          edgeLambdas: [
            {
              functionVersion: lambdaEdge,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ],
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
          origin: httpApiOrigin,
          edgeLambdas: [
            {
              functionVersion: lambdaEdge,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ],
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

    new CfnOutput(this, "HostingBucketName", {
      value: hostingBucket.bucketName,
      exportName: Aws.STACK_NAME + "HostingBucket",
      description: "Hosting bucket name",
    });

    new CfnOutput(this, "ApiEndpoint", {
      value: `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
      exportName: Aws.STACK_NAME + "ApiEndpoint",
      description: "Endpoint",
    });

    new CfnOutput(this, "DistributionDomainName", {
      value: "https://" + distribution.domainName,
      exportName: Aws.STACK_NAME + "DomainName",
      description: "Demo Website",
    });
  }
}
