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
  Aws,
  RemovalPolicy,
  custom_resources,
  aws_dynamodb as ddb,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_iam as iam,
  aws_sqs as sqs,
  aws_lambda_event_sources as event_source,
} from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface IConfigProps {
  sessionToRevoke: ITable;
  gsi_index_name: string;
  wcu: number;
  retention: number;
  ruleGroupParamName: string;
  ruleGroupParamId: string;
}

export class SessionRevocation extends Construct {
  public readonly sessionsTable: ddb.ITable;
  private readonly ruleGroupRegion = "us-east-1";
  constructor(scope: Construct, id: string, config: IConfigProps) {
    super(scope, id);

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

    const ssmRuleGroupParameterId = new custom_resources.AwsCustomResource(
      this,
      "SSMParameter",
      {
        onUpdate: {
          service: "SSM",
          action: "getParameter",
          parameters: { Name: `${config.ruleGroupParamId}` },
          region: this.ruleGroupRegion,
          physicalResourceId: custom_resources.PhysicalResourceId.of(
            `${config.ruleGroupParamId}-${this.ruleGroupRegion}`
          ),
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
          resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
        role: role,
      }
    );

    const ssmRuleGroupId =
      ssmRuleGroupParameterId.getResponseField("Parameter.Value");

    //Revoke an active session
    const updateRuleGroupFunction = new lambda.Function(
      this,
      "UpdateRuleGroup",
      {
        runtime: lambda.Runtime.PYTHON_3_7,
        functionName: Aws.STACK_NAME + "_UpdateRuleGroup",
        code: lambda.Code.fromAsset("lambda/update_rulegroup"),
        handler: "index.handler",
        environment: {
          RULE_GROUP_ID: ssmRuleGroupId,
          RULE_GROUP_NAME: config.ruleGroupParamName,
          RETENTION: config.retention.toString(),
          TABLE_NAME: config.sessionToRevoke.tableName,
          MAX_SESSIONS: (config.wcu / 2).toString(),
          GSI_INDEX_NAME: config.gsi_index_name,
        },
      }
    );

    // Set Lambda Logs Retention and Removal Policy
    new logs.LogGroup(this, "ReadStreamLogs", {
      logGroupName: "/aws/lambda/" + updateRuleGroupFunction.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const region = Stack.of(this).region;
    const accountId = Stack.of(this).account;

    updateRuleGroupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "wafv2:GetRuleGroup",
          "wafv2:UpdateRuleGroup",
          "wafv2:ListRuleGroups",
        ],
        resources: [`arn:aws:wafv2:${region}:${accountId}:*`],
      })
    );

    //Event Source Mapping DynamoDB -> Lambda
    const deadLetterQueue = new sqs.Queue(this, "deadLetterQueue", {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    updateRuleGroupFunction.addEventSource(
      new event_source.DynamoEventSource(config.sessionToRevoke, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        onFailure: new event_source.SqsDlq(deadLetterQueue),
        retryAttempts: 10,
      })
    );

    config.sessionToRevoke.grantReadData(updateRuleGroupFunction);
  }
}
