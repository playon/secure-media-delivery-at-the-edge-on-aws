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
  Duration,
  CfnOutput,
  aws_iam as iam,
  aws_cloudfront as cloudfront,
  aws_dynamodb as ddb,
  aws_cloudtrail as cloudtrail,
  aws_lambda as lambda,
  aws_s3 as s3,
  custom_resources,
} from "aws-cdk-lib";

import * as triggers from 'aws-cdk-lib/triggers';


import * as path from 'path';


import { aws_cloudformation as cloudformation } from 'aws-cdk-lib';
import { Asset } from "aws-cdk-lib/aws-s3-assets";


import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Api } from "./api";
import { CWDashboard } from "./dashboard";
import { GetInputParameters } from "./input_parameters";
import { RotateSecretsWorkflow } from "./rotate_secrets_workflow";
import { Secrets } from "./secrets";
import { SessionRevocation } from "./session_revocation";
import { addCfnSuppressRules } from "./utils";

export class SecureMediaStreamingStack extends Stack {
  public readonly sessionToRevoke: ddb.ITable;
  private readonly gsi_name = "last_updated_index";

  constructor(
    scope: Construct,
    id: string,
    config: IConfiguration,
    ruleGroupParamName: string,
    sig4LambdaVersionParamName: string,
    sig4LambdaArnParamName: string,
    sig4LambdaRoleArnParamName: string,
    props: StackProps
  ) {
    super(scope, id, props);

/*
    const directoryAsset = new Asset(this, "LEAsset", {
      path: ("lambda/sig4")
    });
*/
    const { managedPolicyArn } = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AWSLambdaBasicExecutionRole"
    );
    const role = new iam.Role(this, "EdgeLambdaServiceRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com")
      ),
      managedPolicies: [
        {
          managedPolicyArn,
        },
      ],
    });

    /*
    this.sig4LambdaVersion = id + "_sig4lambdaVersion";
    this.sig4LambdaArn = id + "_sig4lambdaArn";
    this.sig4LambdaRoleArn = id + "_sig4lambdaRoleArn";
    */

    //Lambda to create Lambda@Edge
    const createLE = new lambda.Function(this, "CreateLambdaEdge", {
      functionName: Aws.STACK_NAME + "_CreateLambdaEdge",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      timeout: Duration.seconds(600),
      code: lambda.Code.fromAsset("lambda/create_lambda_edge"),
      environment: {
        'ROLE_ARN': role.roleArn,
        'STACK_NAME': Aws.STACK_NAME,
        'LAMBDA_VERSION' : Aws.STACK_NAME + "a_sig4lambdaVersion",
        'LAMBDA_ARN' :Aws.STACK_NAME + "a_sig4lambdaArn"
      }
    });

    const createFunctionPolicy = new iam.PolicyStatement({
      actions: ['lambda:CreateFunction', 'lambda:PublishVersion', 'lambda:GetFunctionConfiguration'],
      resources: ['*'],
    });

    const passRolePolicy = new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: ['*'],
    });

    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:PutParameter'],
      resources: ["*"],
    });
    createLE.role?.attachInlinePolicy(
      new iam.Policy(this, 'CreateFunctionPolicy', {
        statements: [createFunctionPolicy, passRolePolicy, ssmPolicy],
      }),
    );

    const code = lambda.Code.fromAsset( "lambda/sig4");
    console.log(code.path);

    const triggerLE = new triggers.Trigger(this, 'CRLEUsEast1', {
      handler: createLE,
      //executeAfter: [updateRoleFunction],
      executeOnHandlerChange: false,
    });
/*

    //Lambda to create WAF Rule group
    const createRuleGroup = new lambda.Function(this, "CreateRuleGroup", {
      functionName: Aws.STACK_NAME + "_CreateRuleGroup",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/create_waf_rulegroup"),
      environment: {
        'WCU': '100',
        'RULE_NAME': Aws.STACK_NAME + "_BlockSessions",
        'STACK_NAME': Aws.STACK_NAME,
      }
    });
*/
    const createRulePolicy = new iam.PolicyStatement({
      actions: ['wafv2:CreateRuleGroup'],
      resources: ['*'],
    });


    /*
    createRuleGroup.role?.attachInlinePolicy(
      new iam.Policy(this, 'CreateRulePolicy', {
        statements: [createRulePolicy, ssmPolicy],
      }),
    );
*/
    /*
    const triggerWaf = new triggers.Trigger(this, 'CRRGUsEast1', {
      handler: createRuleGroup,
      //executeAfter: [updateRoleFunction],
      executeOnHandlerChange: false,
    });*/


/*
    const myTrigger = new triggers.TriggerFunction(this, 'MyTrigger', {
      //functionName: Aws.STACK_NAME + "_CreateRuleGroup",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/create_waf_rulegroup"),
      environment: {
        'WCU': '100',
        'RULE_NAME': Aws.STACK_NAME + "_BlockSessions",
        'STACK_NAME': Aws.STACK_NAME,
      }
    });

    myTrigger.role?.attachInlinePolicy(
      new iam.Policy(this, 'CreateRulePolicy', {
        statements: [createRulePolicy, ssmPolicy],
      }),
    );

    myTrigger.executeAfter(triggerLE);*/

    const region = Aws.REGION;
    console.log("region1="+region)

    /*
    //CloudTrail is enabled for us-east-1 in the other stack, so if we are in the same region no need to activate it twice
    if(region!='us-east-1'){
      const s3Logs = new s3.Bucket(this, "CloudTrailLogsBucket", {
        /*encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: new s3.BlockPublicAccess({
          blockPublicPolicy: true,
          blockPublicAcls: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true
         }),
      });
      addCfnSuppressRules(s3Logs, [{ id: 'W35', reason: 'Log bucket, no access log required' }]);
      addCfnSuppressRules(s3Logs, [{ id: 'W41', reason: 'By default, the log files delivered by CloudTrail to your bucket are encrypted by Amazon server-side encryption with Amazon S3-managed encryption keys (SSE-S3)' }]);


      new cloudtrail.Trail(this, 'CloudTrail', {
        bucket: s3Logs
      });
    }
*/
    const parameters = new GetInputParameters(this, "InputParameters", config);

    //CloudFront Function used to check the JWT token for each request
    const checkToken = new cloudfront.Function(this, "CheckJWTTokenFunction", {
      code: cloudfront.FunctionCode.fromFile({
        filePath: "lambda/generate_secret_update_cff/index.js",
      }),
      functionName: Aws.STACK_NAME + "_checkJWTToken",
      comment:
        "CloudFront Function used to check a JWT token",
    });

    //CloudFront Function used to fix the redirect for Media Tailor
    const mediatailorRedirect = new cloudfront.Function(
      this,
      "RedirectMediaTailorFunction",
      {
        code: cloudfront.FunctionCode.fromFile({
          filePath: "cff/mediatailor_redirect/index.js",
        }),
        functionName: Aws.STACK_NAME + "_mediaTailorRedirect",
        comment:
          "CloudFront Function used to handle the redirection for MediaTailor",
      }
    );

    const secrets = new Secrets(this, "Secrets");

    //DynamoDB Table used to hold sessions to be revoked (manually added or automatically via the Step Function)
    const sessionToRevoke = new ddb.Table(this, "SessionToRevoke", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "session_id", type: ddb.AttributeType.STRING },
      stream: ddb.StreamViewType.KEYS_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    addCfnSuppressRules(sessionToRevoke, [{ id: 'W74', reason: 'DynamoDB table has encryption enabled owned by Amazon.' }]);


    const customPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [
            secrets.primarySecret.secretArn,
            secrets.secondarySecret.secretArn,
          ],
          actions: [
            "secretsmanager:GetResourcePolicy",
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
            "secretsmanager:ListSecretVersionIds",
          ],
        }),
        new iam.PolicyStatement({
          resources: [sessionToRevoke.tableArn],
          actions: ["dynamodb:PutItem", "dynamodb:BatchWrite*"],
        }),
      ],
    });

    //role created to be assumed by the SDK
    const role4sdk = new iam.Role(this, "Role4SDK", {
      description: "A role to be assumed by the SDK",
      assumedBy: new iam.AccountPrincipal(Aws.ACCOUNT_ID),
      inlinePolicies: {
        policy: customPolicy,
      },
      maxSessionDuration: Duration.hours(12),
    });

    //add global secondary index
    sessionToRevoke.addGlobalSecondaryIndex({
      indexName: this.gsi_name,
      partitionKey: { name: "reason", type: ddb.AttributeType.STRING },
      sortKey: { name: "last_updated", type: ddb.AttributeType.NUMBER },
      projectionType: ddb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["score", "type"],
    });

    this.sessionToRevoke = sessionToRevoke;

    //session revocation resources
    new SessionRevocation(this, "SessionRevocation", {
      sessionToRevoke: sessionToRevoke,
      gsi_index_name: this.gsi_name,
      wcu: config.main?.wcu!,
      retention: config.main?.retention!,
      ruleGroupParamName: ruleGroupParamName,
    });

    //workflow used to rotate secrets (on a frequency selected by the user in the wizard)
    const rotateSecretsWorkflow = new RotateSecretsWorkflow(
      this,
      "RotateSecrets",
      {
        secrets: secrets,
        checkTokenFunction: checkToken,
        configuration: parameters.customInputParameters,
      }
    );

    //create a CloudWatch Dashboard where widgets will be added by eash selected module (API and Session Revocation)
    const dashboard = new CWDashboard(this, "CoreDashboard");
    dashboard.buildCoreDashboard({
      cfFunctionName: checkToken.functionName,
      rotateSecretsWorkflowArn: rotateSecretsWorkflow.workflowArn,
    });

    if (parameters.customInputParameters.api) {
      //if the API module was selected in the wizard, deploy the required resources
      new Api(this, "Api", {
        configuration: parameters.customInputParameters,
        secrets: secrets,
        dashboard: dashboard,
        sessionsTable: sessionToRevoke,
        sig4LambdaVersionParamName: sig4LambdaVersionParamName,
        sig4LambdaArnParamName: sig4LambdaArnParamName,
        sig4LambdaRoleArnParamName: sig4LambdaRoleArnParamName,
        parameters
      });
    }

    new CfnOutput(this, "RoleArn", {
      description: "The ARN of the role to be assumed by SDK",
      value: role4sdk.roleArn,
    });
  }
}
