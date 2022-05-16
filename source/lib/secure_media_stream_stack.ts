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
  aws_cloudtrail as cloudtrail
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Api } from "./api";
import { CWDashboard } from "./dashboard";
import { GetInputParameters } from "./input_parameters";
import { RotateSecretsWorkflow } from "./rotate_secrets_workflow";
import { Secrets } from "./secrets";
import { SessionRevocation } from "./session_revocation";

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

    const region = Stack.of(this).region;
    if(region!='us-east-1'){
      //CloudTrail is enabled for us-east-1 in the other stack
      new cloudtrail.Trail(this, 'CloudTrail');
    }




    const parameters = new GetInputParameters(this, "InputParameters", config);

    //CloudFront Function used to check the JWT token for each request
    const checkToken = new cloudfront.Function(this, "CheckJWTTokenFunction", {
      code: cloudfront.FunctionCode.fromFile({
        filePath: "lambda/generate_secret_update_cff/index.js",
      }),
      functionName: Aws.STACK_NAME + "_checkJWTToken",
      comment:
        "CloudFront Function used to check a JWT, part of Core Secure Media Stream Delivery",
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
          "CloudFront Function used to handle the redirect for MediaTailor",
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
      assumedBy: new iam.AccountPrincipal(Stack.of(this).account),
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
      });
    }

    new CfnOutput(this, "RoleArn", {
      description: "The ARN of the role to be assumed by SDK",
      value: role4sdk.roleArn,
    });
  }
}
