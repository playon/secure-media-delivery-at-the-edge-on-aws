"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRevocationStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const get_sessions_workflow_1 = require("./get_sessions_workflow");
class SessionRevocationStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, configuration) {
        var _a;
        super(scope, id);
        //TODO rule name as parameter
        const ruleGroupName = "RevokedSessions";
        const cfnRuleGroup = new aws_cdk_lib_1.aws_wafv2.CfnRuleGroup(this, "MyCfnRuleGroup", {
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
        });
        const ddbTable = new aws_cdk_lib_1.aws_dynamodb.Table(this, "CompromisedSessions", {
            billingMode: aws_cdk_lib_1.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: { name: "sessionid", type: aws_cdk_lib_1.aws_dynamodb.AttributeType.STRING },
            stream: aws_cdk_lib_1.aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        //Revoke an active session
        const readDbStream = new aws_cdk_lib_1.aws_lambda.Function(this, 'ReadStream', {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset('lambda/read_stream'),
            handler: 'index.lambda_handler',
            environment: {
                'RULE_GROUP_ID': cfnRuleGroup.attrId,
                'RULE_GROUP_NAME': ruleGroupName
            },
        });
        // Set Lambda Logs Retention and Removal Policy
        new aws_cdk_lib_1.aws_logs.LogGroup(this, 'ReadStreamLogs', {
            logGroupName: "/aws/lambda/" + readDbStream.functionName,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH
        });
        const region = aws_cdk_lib_1.Stack.of(this).region;
        const accountId = aws_cdk_lib_1.Stack.of(this).account;
        readDbStream.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["wafv2:GetRuleGroup", "wafv2:UpdateRuleGroup", "wafv2:ListRuleGroups"],
            resources: [`arn:aws:wafv2:${region}:${accountId}:*`]
        }));
        //Event Source Mapping DynamoDB -> Lambda
        const deadLetterQueue = new aws_cdk_lib_1.aws_sqs.Queue(this, "deadLetterQueue");
        readDbStream.addEventSource(new aws_cdk_lib_1.aws_lambda_event_sources.DynamoEventSource(ddbTable, {
            startingPosition: aws_cdk_lib_1.aws_lambda.StartingPosition.TRIM_HORIZON,
            batchSize: 5,
            bisectBatchOnError: true,
            onFailure: new aws_cdk_lib_1.aws_lambda_event_sources.SqsDlq(deadLetterQueue),
            retryAttempts: 10
        }));
        //TODO use input parameter for the following values
        const cloudFrontAccessLogsBucketName = ((_a = configuration.sessionRevocation) === null || _a === void 0 ? void 0 : _a.s3_logs_bucket_name) || "undefined";
        const athenaDatabaseName = "secure_media_athena_database";
        const athenaTableName = 'secure_media_athena_table';
        new get_sessions_workflow_1.GetSessionsWorkflow(this, 'GetSessions', {
            accountId: accountId,
            athenaDatabaseName: athenaDatabaseName,
            athenaTableName: athenaTableName,
            logsBucketName: cloudFrontAccessLogsBucketName,
            dynamodbTable: ddbTable,
            configuration: configuration
        });
        new aws_cdk_lib_1.CfnOutput(this, "TableName", {
            value: ddbTable.tableName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'TableName',
            description: 'DynamoDB table name used to keep sessions to be invalidated'
        });
    }
}
exports.SessionRevocationStack = SessionRevocationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbl9yZXZvY2F0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3Nlc3Npb25fcmV2b2NhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDZDQWFxQjtBQUtyQixtRUFBOEQ7QUFFOUQsTUFBYSxzQkFBdUIsU0FBUSxtQkFBSztJQUUvQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLGFBQTZCOztRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBR2pCLDZCQUE2QjtRQUM3QixNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQTtRQUN2QyxNQUFNLFlBQVksR0FBRyxJQUFJLHVCQUFLLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBQztZQUMzRCxRQUFRLEVBQUUsRUFBRTtZQUNaLEtBQUssRUFBRSxZQUFZO1lBQ25CLGdCQUFnQixFQUFFO2dCQUNkLHdCQUF3QixFQUFFLEtBQUs7Z0JBQy9CLFVBQVUsRUFBRSxZQUFZO2dCQUN4QixzQkFBc0IsRUFBRSxLQUFLO2FBQ2hDO1lBQ0QsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixJQUFJLEVBQUUsYUFBYTtZQUNuQixLQUFLLEVBQUUsRUFBRTtTQUNSLENBQUMsQ0FBQTtRQUVWLE1BQU0sUUFBUSxHQUFHLElBQUksMEJBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFDO1lBQ25ELFdBQVcsRUFBRSwwQkFBRyxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQzVDLFlBQVksRUFBRSxFQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLDBCQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBQztZQUNqRSxNQUFNLEVBQUUsMEJBQUcsQ0FBQyxjQUFjLENBQUMsa0JBQWtCO1lBQzdDLGFBQWEsRUFBRSwyQkFBYSxDQUFDLE9BQU87U0FDM0MsQ0FBQyxDQUFBO1FBRUYsMEJBQTBCO1FBQzFCLE1BQU0sWUFBWSxHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBQztZQUN4RCxPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsVUFBVTtZQUNsQyxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDO1lBQ2pELE9BQU8sRUFBRSxzQkFBc0I7WUFDM0IsV0FBVyxFQUFFO2dCQUNULGVBQWUsRUFBRyxZQUFZLENBQUMsTUFBTTtnQkFDckMsaUJBQWlCLEVBQ2YsYUFBYTthQUN0QjtTQUNGLENBQ0YsQ0FBQTtRQUVELCtDQUErQztRQUMvQyxJQUFJLHNCQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBQyxnQkFBZ0IsRUFBQztZQUNwQyxZQUFZLEVBQUUsY0FBYyxHQUFDLFlBQVksQ0FBQyxZQUFZO1lBQ3RELGFBQWEsRUFBRSwyQkFBYSxDQUFDLE9BQU87WUFDcEMsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7U0FDMUMsQ0FBQyxDQUFBO1FBRUYsTUFBTSxNQUFNLEdBQUcsbUJBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0sU0FBUyxHQUFHLG1CQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQTtRQUV4QyxZQUFZLENBQUMsZUFBZSxDQUFDLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7WUFDbkQsTUFBTSxFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsb0JBQW9CLEVBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUM7WUFDL0UsU0FBUyxFQUFFLENBQUMsaUJBQWlCLE1BQU0sSUFBSSxTQUFTLElBQUksQ0FBQztTQUN0RCxDQUFDLENBQUMsQ0FBQTtRQUVILHlDQUF5QztRQUN6QyxNQUFNLGVBQWUsR0FBRyxJQUFJLHFCQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFBO1FBRTlELFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxzQ0FBWSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRTtZQUNyRSxnQkFBZ0IsRUFBRSx3QkFBTSxDQUFDLGdCQUFnQixDQUFDLFlBQVk7WUFDdEQsU0FBUyxFQUFFLENBQUM7WUFDWixrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLFNBQVMsRUFBRSxJQUFJLHNDQUFZLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQztZQUNuRCxhQUFhLEVBQUUsRUFBRTtTQUNwQixDQUFDLENBQUMsQ0FBQTtRQUVILG1EQUFtRDtRQUNuRCxNQUFNLDhCQUE4QixHQUFHLE9BQUEsYUFBYSxDQUFDLGlCQUFpQiwwQ0FBRSxtQkFBbUIsS0FBSSxXQUFXLENBQUM7UUFFM0csTUFBTSxrQkFBa0IsR0FBRyw4QkFBOEIsQ0FBQTtRQUN6RCxNQUFNLGVBQWUsR0FBRywyQkFBMkIsQ0FBQTtRQUduRCxJQUFJLDJDQUFtQixDQUFDLElBQUksRUFBRSxhQUFhLEVBQUM7WUFDMUMsU0FBUyxFQUFFLFNBQVM7WUFDcEIsa0JBQWtCLEVBQUUsa0JBQWtCO1lBQ3RDLGVBQWUsRUFBRSxlQUFlO1lBQ2hDLGNBQWMsRUFBRSw4QkFBOEI7WUFDOUMsYUFBYSxFQUFFLFFBQVE7WUFDdkIsYUFBYSxFQUFFLGFBQWE7U0FFN0IsQ0FBQyxDQUFBO1FBRUYsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUM7WUFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxTQUFTO1lBQ3pCLFVBQVUsRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxXQUFXO1lBQ3hDLFdBQVcsRUFBRSw2REFBNkQ7U0FDM0UsQ0FBQyxDQUFBO0lBSUosQ0FBQztDQUNGO0FBOUZELHdEQThGQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpLiBZb3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlXG4gKiAgd2l0aCB0aGUgTGljZW5zZS4gQSBjb3B5IG9mIHRoZSBMaWNlbnNlIGlzIGxvY2F0ZWQgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBvciBpbiB0aGUgJ2xpY2Vuc2UnIGZpbGUgYWNjb21wYW55aW5nIHRoaXMgZmlsZS4gVGhpcyBmaWxlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICdBUyBJUycgQkFTSVMsIFdJVEhPVVQgV0FSUkFOVElFU1xuICogIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGV4cHJlc3Mgb3IgaW1wbGllZC4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zXG4gKiAgYW5kIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCB7XG4gIFN0YWNrLFxuICBSZW1vdmFsUG9saWN5LFxuICBDZm5PdXRwdXQsXG4gIEF3cyxcbiAgYXdzX3dhZnYyIGFzIHdhZnYyLFxuICBhd3NfZHluYW1vZGIgYXMgZGRiLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19zcXMgYXMgc3FzLFxuICBhd3NfbGFtYmRhX2V2ZW50X3NvdXJjZXMgYXMgZXZlbnRfc291cmNlLFxuXG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vaGVscGVycy92YWxpZGF0b3JzL2NvbmZpZ3VyYXRpb24nO1xuaW1wb3J0IHsgR2V0U2Vzc2lvbnNXb3JrZmxvdyB9IGZyb20gJy4vZ2V0X3Nlc3Npb25zX3dvcmtmbG93JztcblxuZXhwb3J0IGNsYXNzIFNlc3Npb25SZXZvY2F0aW9uU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb24pIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG5cbiAgICAvL1RPRE8gcnVsZSBuYW1lIGFzIHBhcmFtZXRlclxuICAgIGNvbnN0IHJ1bGVHcm91cE5hbWUgPSBcIlJldm9rZWRTZXNzaW9uc1wiXG4gICAgY29uc3QgY2ZuUnVsZUdyb3VwID0gbmV3IHdhZnYyLkNmblJ1bGVHcm91cCh0aGlzLCBcIk15Q2ZuUnVsZUdyb3VwXCIse1xuICAgICAgICAgICAgY2FwYWNpdHk6IDk5LFxuICAgICAgICAgICAgc2NvcGU6IFwiQ0xPVURGUk9OVFwiLFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogXCJtZXRyaWNOYW1lXCIsXG4gICAgICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogZmFsc2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJSZXZva2VkIHNlc3Npb25zXCIsXG4gICAgICAgICAgICBuYW1lOiBydWxlR3JvdXBOYW1lLFxuICAgICAgICAgICAgcnVsZXM6IFtdXG4gICAgICAgICAgICB9KVxuXG4gICAgY29uc3QgZGRiVGFibGUgPSBuZXcgZGRiLlRhYmxlKHRoaXMsIFwiQ29tcHJvbWlzZWRTZXNzaW9uc1wiLHtcbiAgICAgICAgICAgIGJpbGxpbmdNb2RlOiBkZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgICAgICAgcGFydGl0aW9uS2V5OiB7bmFtZTogXCJzZXNzaW9uaWRcIiwgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HfSxcbiAgICAgICAgICAgIHN0cmVhbTogZGRiLlN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUyxcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pXG5cbiAgICAvL1Jldm9rZSBhbiBhY3RpdmUgc2Vzc2lvblxuICAgIGNvbnN0IHJlYWREYlN0cmVhbSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1JlYWRTdHJlYW0nLHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvcmVhZF9zdHJlYW0nKSxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgJ1JVTEVfR1JPVVBfSUQnIDogY2ZuUnVsZUdyb3VwLmF0dHJJZCxcbiAgICAgICAgICAgICAgICAnUlVMRV9HUk9VUF9OQU1FJ1xuICAgICAgICAgICAgICAgIDogcnVsZUdyb3VwTmFtZVxuICAgICAgICB9LFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIFNldCBMYW1iZGEgTG9ncyBSZXRlbnRpb24gYW5kIFJlbW92YWwgUG9saWN5XG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywnUmVhZFN0cmVhbUxvZ3MnLHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiBcIi9hd3MvbGFtYmRhL1wiK3JlYWREYlN0cmVhbS5mdW5jdGlvbk5hbWUsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIXG4gICAgfSlcblxuICAgIGNvbnN0IHJlZ2lvbiA9IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcbiAgICBjb25zdCBhY2NvdW50SWQgPSBTdGFjay5vZih0aGlzKS5hY2NvdW50XG5cbiAgICByZWFkRGJTdHJlYW0uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcIndhZnYyOkdldFJ1bGVHcm91cFwiLFwid2FmdjI6VXBkYXRlUnVsZUdyb3VwXCIsIFwid2FmdjI6TGlzdFJ1bGVHcm91cHNcIl0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czp3YWZ2Mjoke3JlZ2lvbn06JHthY2NvdW50SWR9OipgXVxuICAgIH0pKVxuXG4gICAgLy9FdmVudCBTb3VyY2UgTWFwcGluZyBEeW5hbW9EQiAtPiBMYW1iZGFcbiAgICBjb25zdCBkZWFkTGV0dGVyUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiZGVhZExldHRlclF1ZXVlXCIpXG5cbiAgICByZWFkRGJTdHJlYW0uYWRkRXZlbnRTb3VyY2UobmV3IGV2ZW50X3NvdXJjZS5EeW5hbW9FdmVudFNvdXJjZShkZGJUYWJsZSwge1xuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5UUklNX0hPUklaT04sXG4gICAgICAgIGJhdGNoU2l6ZTogNSxcbiAgICAgICAgYmlzZWN0QmF0Y2hPbkVycm9yOiB0cnVlLFxuICAgICAgICBvbkZhaWx1cmU6IG5ldyBldmVudF9zb3VyY2UuU3FzRGxxKGRlYWRMZXR0ZXJRdWV1ZSksXG4gICAgICAgIHJldHJ5QXR0ZW1wdHM6IDEwXG4gICAgfSkpXG5cbiAgICAvL1RPRE8gdXNlIGlucHV0IHBhcmFtZXRlciBmb3IgdGhlIGZvbGxvd2luZyB2YWx1ZXNcbiAgICBjb25zdCBjbG91ZEZyb250QWNjZXNzTG9nc0J1Y2tldE5hbWUgPSBjb25maWd1cmF0aW9uLnNlc3Npb25SZXZvY2F0aW9uPy5zM19sb2dzX2J1Y2tldF9uYW1lIHx8IFwidW5kZWZpbmVkXCI7XG5cbiAgICBjb25zdCBhdGhlbmFEYXRhYmFzZU5hbWUgPSBcInNlY3VyZV9tZWRpYV9hdGhlbmFfZGF0YWJhc2VcIlxuICAgIGNvbnN0IGF0aGVuYVRhYmxlTmFtZSA9ICdzZWN1cmVfbWVkaWFfYXRoZW5hX3RhYmxlJ1xuXG5cbiAgICBuZXcgR2V0U2Vzc2lvbnNXb3JrZmxvdyh0aGlzLCAnR2V0U2Vzc2lvbnMnLHtcbiAgICAgIGFjY291bnRJZDogYWNjb3VudElkLFxuICAgICAgYXRoZW5hRGF0YWJhc2VOYW1lOiBhdGhlbmFEYXRhYmFzZU5hbWUsXG4gICAgICBhdGhlbmFUYWJsZU5hbWU6IGF0aGVuYVRhYmxlTmFtZSxcbiAgICAgIGxvZ3NCdWNrZXROYW1lOiBjbG91ZEZyb250QWNjZXNzTG9nc0J1Y2tldE5hbWUsXG4gICAgICBkeW5hbW9kYlRhYmxlOiBkZGJUYWJsZSxcbiAgICAgIGNvbmZpZ3VyYXRpb246IGNvbmZpZ3VyYXRpb25cblxuICAgIH0pXG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiVGFibGVOYW1lXCIse1xuICAgICAgdmFsdWU6IGRkYlRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IEF3cy5TVEFDS19OQU1FICsgJ1RhYmxlTmFtZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgdXNlZCB0byBrZWVwIHNlc3Npb25zIHRvIGJlIGludmFsaWRhdGVkJ1xuICAgIH0pXG5cblxuXG4gIH1cbn0iXX0=