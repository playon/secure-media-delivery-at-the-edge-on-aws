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
  custom_resources,
  aws_lambda as lambda,
  aws_s3_deployment as s3deploy,
  aws_dynamodb as ddb,
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_cloudfront_origins as origins,
  aws_logs as logs,
  aws_iam as iam
} from "aws-cdk-lib";

import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Secrets } from "./secrets";
import { LoadAssetsTable } from "./load_assets_table";
import { CWDashboard } from "./dashboard";
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { PhysicalResourceId } from "aws-cdk-lib/custom-resources";

const API_GATEWAY_LOG_FORMAT = '{"requestId":"$context.requestId","ip": "$context.identity.sourceIp","requestTime":"$context.requestTime","requestTimeEpoch":"$context.requestTimeEpoch","httpMethod":"$context.httpMethod","routeKey":"$context.routeKey","status":"$context.status","protocol":"$context.protocol","responseLength":"$context.responseLength","integration error":"$context.integrationErrorMessage"}';


export interface IConfigProps {
  configuration: IConfiguration;
  secrets: Secrets;
  dashboard: CWDashboard;
  sessionsTable: ddb.ITable;
  sig4LambdaVersionParamName: String;
  sig4LambdaArnParamName: String;
  sig4LambdaRoleArnParamName: String
}

export class Api extends Construct {
  private readonly ruleGroupRegion = "us-east-1";

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

    const authorizer = new HttpIamAuthorizer();


    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: 'SecureMediaStreamDemoAPI',
      description: 'Secure Media Stream Demo API',
      defaultAuthorizer: authorizer
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
    const accountId = Stack.of(this).account;

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

    const role = new iam.Role(this, "RoleSsmCustomResource", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: ["*"],
      })
    );

    const ssmSig4VersionArn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterVersion",
      {
        onUpdate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaVersionParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString())
        },
        //policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        //  resources: [`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaParamName}`]
        //}),
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:GetParameter*'],
            resources: [
              //`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/*`
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaVersionParamName}`
            ]
          })
        ]),
        //role: role,
      }
    );

    const ssmSig4Arn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterArn",
      {
        onUpdate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaArnParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString())
        },
        //policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        //  resources: [`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaParamName}`]
        //}),
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:GetParameter*'],
            resources: [
              //`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/*`
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaArnParamName}`
            ]
          })
        ]),
        //role: role,
      }
    );

    const ssmSig4RoleArn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterRoleArn",
      {
        onUpdate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaRoleArnParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString())
        },
        //policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        //  resources: [`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaParamName}`]
        //}),
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:GetParameter*'],
            resources: [
              //`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/*`
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaRoleArnParamName}`
            ]
          })
        ]),
        //role: role,
      }
    );


    const lambdaEdge = lambda.Function.fromFunctionArn(
      this,
      'ExternalLambdaFromArn',
      ssmSig4Arn.getResponseField('Parameter.Value')
    );

    /*
    // create a policy statement
    const invokeApiPolicy = new iam.PolicyStatement({
      actions: ['execute-api:Invoke'],
      resources: [`arn:aws:execute-api:${region}:*:${httpApi.apiId}/*`],
    });
    const policy = new iam.Policy(this, 'InvokeHttpApi', {
      statements: [invokeApiPolicy],
    });

    //const executionRole = new iam.Role(this, "execution-role");

    // add the policy to the Function's role
    //lambdaEdge.role.attachInlinePolicy(
    //  policy
    //);
    //lambdaEdge.addToRolePolicy(invokeApiPolicy);
*/
    const updateRoleFunction = new lambda.Function(this, "UpdateRole", {
      functionName: Aws.STACK_NAME + "_UpdateRole",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/update_role"),
      handler: "index.handler",
      environment: {
        ROLE_NAME: lambdaEdge.role?.roleName!,
        LE_ARN: ssmSig4Arn.getResponseField('Parameter.Value'),
        API_ARN: `arn:aws:execute-api:${region}:*:${httpApi.apiId}/*`
      },
    });

    const getFunctionStatement = new iam.PolicyStatement(
    {
      actions: ['lambda:GetFunction'],
      resources: [ssmSig4Arn.getResponseField('Parameter.Value')],
    });

    const createPolicytStatement = new iam.PolicyStatement(
    {
      actions: ['iam:CreatePolicy'],
      resources: [`arn:aws:iam::${accountId}:policy/*`],
    });

    const updateRoleStatement = new iam.PolicyStatement(
      {
        actions: ['iam:AttachRolePolicy'],
        resources: [ssmSig4RoleArn.getResponseField('Parameter.Value')],
      });

    // 👇 add the policy to the Function's role
    updateRoleFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'GetFunctionPolicy', {
        statements: [getFunctionStatement, createPolicytStatement, updateRoleStatement],
      }),
    );



    const ssmSig4Role = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterRole",
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: updateRoleFunction.functionName
          },
          physicalResourceId: PhysicalResourceId.of(Date.now().toString())
        },
        //policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        //  resources: [`arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaParamName}`]
        //}),
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['lambda:InvokeFunction'],
            resources: [
              updateRoleFunction.functionArn
            ]
          })
        ]),
        //role: role,
      }
    );




    /*new CfnOutput(this, "PolicyName", {
      value: invokeApiPolicy.,
      exportName: Aws.STACK_NAME + "PolicyName",
      description: "Policy 4 lambda",
    });*/

    //console.log("lambdaEdge.functionArn="+lambdaEdge.functionArn)

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
            `${httpApi.apiId}.execute-api.${region}.amazonaws.com`
          ),
          edgeLambdas: [
            {
              functionVersion: lambda.Version.fromVersionArn(
                this,
                'cf-lambda-1',
                ssmSig4VersionArn.getResponseField('Parameter.Value')
              ),

              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            }
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
          origin: new origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${region}.amazonaws.com`
          ),
          edgeLambdas: [
            {
              functionVersion: lambda.Version.fromVersionArn(
                this,
                'cf-lambda-2',
                ssmSig4VersionArn.getResponseField('Parameter.Value')
              ),

              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            }
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
