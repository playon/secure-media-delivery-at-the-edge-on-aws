/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

import {
  Aws,
  custom_resources,
  aws_lambda as lambda,
  aws_iam as iam
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { addCfnSuppressRules } from "../cfn_nag/cfn_nag_utils";

export interface IConfigProps {
  sig4LambdaVersionParamName: string;
  sig4LambdaRoleArn: string;
  apiArn: string;
}

export class CRUpdateLERole extends Construct {
  public readonly lambdaEdgeVersionArn: string;

  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

     const ssmSig4VersionArn = new custom_resources.AwsCustomResource(
      this,
      "SSMParameterVersion",
      {
        onUpdate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${props.sig4LambdaVersionParamName}` },
          region: Aws.REGION,
          physicalResourceId: custom_resources.PhysicalResourceId.of(`${props.sig4LambdaVersionParamName}`)
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ssm:GetParameter*"],
            resources: [
              `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/*`,
            ],
          }),
        ]),
      }
    );



    this.lambdaEdgeVersionArn =
      ssmSig4VersionArn.getResponseField("Parameter.Value");


    //lambda used to add execute-api:Invoke permission to LambdaEdge (to sign the request)
    const updateRoleFunction = new lambda.Function(this, "UpdateRole", {
      functionName: Aws.STACK_NAME + "_UpdateRole",
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromAsset("lambda/update_role"),
      handler: "index.handler",
      environment: {
        ROLE_ARN: props.sig4LambdaRoleArn,
        API_ARN: props.apiArn,
        STACK_NAME: Aws.STACK_NAME,
        ACCOUNT_ID: Aws.ACCOUNT_ID
      },
    });

    addCfnSuppressRules(updateRoleFunction, [{ id: 'W58', reason: 'Lambda has CloudWatch permissions by using service role AWSLambdaBasicExecutionRole' }]);
    addCfnSuppressRules(updateRoleFunction, [{ id: 'W89', reason: 'We don t have any VPC in the stack, we only use serverless services' }]);
    addCfnSuppressRules(updateRoleFunction, [{ id: 'W92', reason: 'No need for ReservedConcurrentExecutions, some are used only for the demo website, and others are not used in a concurrent mode.' }]);


    const createPolicytStatement = new iam.PolicyStatement({
      actions: ["iam:CreatePolicy", "iam:GetPolicy"],
      resources: [`arn:aws:iam::${Aws.ACCOUNT_ID}:policy/*`],
    });

    const updateRoleStatement = new iam.PolicyStatement({
      actions: ["iam:AttachRolePolicy"],
      resources: [props.sig4LambdaRoleArn],
    });

    updateRoleFunction.role?.attachInlinePolicy(
      new iam.Policy(this, "GetFunctionPolicy", {
        statements: [
          createPolicytStatement,
          updateRoleStatement,
        ],
      })
    );

    new custom_resources.AwsCustomResource(this, "TriggerUpdateRoleCR", {
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: {
          FunctionName: updateRoleFunction.functionName
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(
          "TriggerUpdateRole4LE"
        ),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["lambda:InvokeFunction"],
          resources: [updateRoleFunction.functionArn],
        }),
      ])
    });

  }
}
