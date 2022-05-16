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
  Stack,
  custom_resources,
  aws_lambda as lambda,
  aws_iam as iam,
  triggers
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { PhysicalResourceId } from "aws-cdk-lib/custom-resources";

export interface IConfigProps {
  sig4LambdaVersionParamName: string;
  sig4LambdaArnParamName: string;
  sig4LambdaRoleArnParamName: string;
  apiArn: string;
}

export class CustomResourceLambdaEdge extends Construct {
  private readonly ruleGroupRegion = "us-east-1";
  public readonly lambdaEdgeVersionArn: string;

  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    const accountId = Stack.of(this).account;

    const ssmSig4VersionArn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterVersion",
      {
        onCreate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaVersionParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ssm:GetParameter*"],
            resources: [
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaVersionParamName}`,
            ],
          }),
        ]),
      }
    );

    const ssmSig4Arn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterArn",
      {
        onCreate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaArnParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ssm:GetParameter*"],
            resources: [
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaArnParamName}`,
            ],
          }),
        ]),
      }
    );

    this.lambdaEdgeVersionArn =
      ssmSig4VersionArn.getResponseField("Parameter.Value");

    const ssmSig4RoleArn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterRoleArn",
      {
        onCreate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaRoleArnParamName}` },
          region: this.ruleGroupRegion,
          physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ssm:GetParameter*"],
            resources: [
              `arn:aws:ssm:${this.ruleGroupRegion}:${accountId}:parameter/${props.sig4LambdaRoleArnParamName}`,
            ],
          }),
        ]),
      }
    );

    const lambdaEdge = lambda.Function.fromFunctionArn(
      this,
      "ExternalLambdaFromArn",
      ssmSig4Arn.getResponseField("Parameter.Value")
    );

    //lambda used to add execute-api:Invoke permission to LambdaEdge (to sign the request)
    const updateRoleFunction = new lambda.Function(this, "UpdateRole", {
      functionName: Aws.STACK_NAME + "_UpdateRole",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/update_role"),
      handler: "index.handler",
      environment: {
        ROLE_ARN: ssmSig4RoleArn.getResponseField("Parameter.Value"),
        API_ARN: props.apiArn,
      },
    });

    const createPolicytStatement = new iam.PolicyStatement({
      actions: ["iam:CreatePolicy"],
      resources: [`arn:aws:iam::${accountId}:policy/*`],
    });

    const updateRoleStatement = new iam.PolicyStatement({
      actions: ["iam:AttachRolePolicy"],
      resources: [ssmSig4RoleArn.getResponseField("Parameter.Value")],
    });

    updateRoleFunction.role?.attachInlinePolicy(
      new iam.Policy(this, "GetFunctionPolicy", {
        statements: [
          createPolicytStatement,
          updateRoleStatement,
        ],
      })
    );

    const trigger = new triggers.Trigger(this, 'MyTrigger', {
      handler: updateRoleFunction,

      // the properties below are optional
      executeAfter: [updateRoleFunction],
      executeOnHandlerChange: false,
    });

  }
}
