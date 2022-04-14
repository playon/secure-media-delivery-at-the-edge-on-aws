
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
    aws_wafv2 as wafv2,
    aws_dynamodb as ddb,
    aws_lambda as lambda,
    aws_logs as logs,
    aws_iam as iam,
    aws_sqs as sqs,
    aws_lambda_event_sources as event_source,
  } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
  import { Construct } from 'constructs';


  export class SessionRevocation extends Construct {

    public readonly sessionsTable: ddb.ITable;

    constructor(scope: Construct, id: string, sessionToRevoke: ITable) {
    super(scope, id);

    //TODO rule name as parameter
    //TODO add stack name
    const ruleGroupName = Aws.STACK_NAME + "_RevokedSessions"
    const cfnRuleGroup = new wafv2.CfnRuleGroup(this, "MyCfnRuleGroup",{
        capacity: 99,
        scope: "CLOUDFRONT",
        visibilityConfig: {
            cloudWatchMetricsEnabled: false,
            metricName: "metricName",
            sampledRequestsEnabled: false
        },
        description: "Revoked sessions",
        name: ruleGroupName,
        rules: []
    })



    //Revoke an active session
    const readDbStream = new lambda.Function(this, 'UpdateRuleGroup',{
        runtime: lambda.Runtime.PYTHON_3_7,
        functionName: Aws.STACK_NAME + "_UpdateRuleGroup",
        code: lambda.Code.fromAsset('lambda/update_rulegroup'),
        handler: 'index.handler',
        environment: {
            'RULE_GROUP_ID' : cfnRuleGroup.attrId,
            'RULE_GROUP_NAME'
            : ruleGroupName
        },
        }
    )

    // Set Lambda Logs Retention and Removal Policy
    new logs.LogGroup(this,'ReadStreamLogs',{
        logGroupName: "/aws/lambda/"+readDbStream.functionName,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH
    })

    const region = Stack.of(this).region;
    const accountId = Stack.of(this).account

    readDbStream.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["wafv2:GetRuleGroup","wafv2:UpdateRuleGroup", "wafv2:ListRuleGroups"],
        resources: [`arn:aws:wafv2:${region}:${accountId}:*`]
    }))

    //Event Source Mapping DynamoDB -> Lambda
    const deadLetterQueue = new sqs.Queue(this, "deadLetterQueue")

    readDbStream.addEventSource(new event_source.DynamoEventSource(sessionToRevoke, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        onFailure: new event_source.SqsDlq(deadLetterQueue),
        retryAttempts: 10
    }));


    }

}