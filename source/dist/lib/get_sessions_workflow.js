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
exports.GetSessionsWorkflow = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
const athena_table_1 = require("./athena_table");
class GetSessionsWorkflow extends constructs_1.Construct {
    constructor(scope, id, props) {
        var _a;
        super(scope, id);
        new athena_table_1.AthenaTable(this, "AthenaTable", {
            logsBucketName: props.logsBucketName,
            accountId: props.accountId,
            athenaDatabaseName: props.athenaDatabaseName,
            athenaTableName: props.athenaTableName,
        });
        const resultsBucketName = new aws_cdk_lib_1.aws_s3.Bucket(this, "ResultsBucket", {
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        const startQueryExecutionJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.AthenaStartQueryExecution(this, "Start Athena Query", {
            queryString: "SELECT uri FROM " + props.athenaTableName + " limit 11",
            integrationPattern: aws_cdk_lib_1.aws_stepfunctions.IntegrationPattern.RUN_JOB,
            queryExecutionContext: {
                databaseName: props.athenaDatabaseName,
            },
            resultConfiguration: {
                outputLocation: {
                    bucketName: resultsBucketName.bucketName,
                    objectKey: "results",
                },
            },
        });
        const getQueryResultsJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.AthenaGetQueryResults(this, "Get Query Results", {
            queryExecutionId: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.QueryExecution.QueryExecutionId"),
            resultPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.GetQueryResults"),
        });
        const sendToDdb = new aws_cdk_lib_1.aws_stepfunctions_tasks.DynamoPutItem(this, "Save to DynamoDB", {
            item: {
                sessionid: aws_cdk_lib_1.aws_stepfunctions_tasks.DynamoAttributeValue.fromString(aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$")),
            },
            table: props.dynamodbTable,
            inputPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.Data[0].VarCharValue"),
        });
        const prepareNextParams = new aws_cdk_lib_1.aws_stepfunctions.Pass(this, "Prepare Next Query Params", {
            parameters: {
                "QueryExecutionId.$": "$.StartQueryParams.QueryExecutionId",
                "NextToken.$": "$.GetQueryResults.NextToken",
            },
            resultPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.StartQueryParams"),
        });
        const hasMoreResults = new aws_cdk_lib_1.aws_stepfunctions.Choice(this, "Has More Results?")
            .when(aws_cdk_lib_1.aws_stepfunctions.Condition.isPresent("$.GetQueryResults.NextToken"), prepareNextParams.next(getQueryResultsJob))
            .otherwise(new aws_cdk_lib_1.aws_stepfunctions.Succeed(this, "Done"));
        //Save_to_dynamodb
        const map = new aws_cdk_lib_1.aws_stepfunctions.Map(this, "Map State", {
            maxConcurrency: 1,
            inputPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.GetQueryResults.ResultSet.Rows[1:]"),
            resultPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.DISCARD,
        });
        map.iterator(sendToDdb);
        // Step function to orchestrate Athena query and retrieving the results
        const workflow = new aws_cdk_lib_1.aws_stepfunctions.StateMachine(this, "AthenaQuery", {
            stateMachineName: aws_cdk_lib_1.Aws.STACK_NAME + "_DetectSessions",
            definition: startQueryExecutionJob
                .next(getQueryResultsJob)
                .next(map)
                .next(hasMoreResults),
            timeout: aws_cdk_lib_1.Duration.minutes(60),
        });
        const triggerFrequency = ((_a = props.configuration.sessionRevocation) === null || _a === void 0 ? void 0 : _a.trigger_workflow_frequency) || 0;
        if (triggerFrequency > 0) {
            // Trigger Sfn to rotate the secrets every X minutes
            const rule = new aws_cdk_lib_1.aws_events.Rule(this, "RuleInvalidateSessions", {
                schedule: aws_cdk_lib_1.aws_events.Schedule.rate(aws_cdk_lib_1.Duration.minutes(triggerFrequency)),
                description: "Trigger StepFunction to detect sessions to invalidate",
                enabled: true,
            });
            rule.addTarget(new aws_cdk_lib_1.aws_events_targets.SfnStateMachine(workflow));
        }
        new aws_cdk_lib_1.CfnOutput(this, "SessionInvalidateName", {
            value: workflow.stateMachineName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + "StateMachineName",
            description: "State machine used to detect sessions to invalidate",
        });
    }
}
exports.GetSessionsWorkflow = GetSessionsWorkflow;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0X3Nlc3Npb25zX3dvcmtmbG93LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2dldF9zZXNzaW9uc193b3JrZmxvdy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDZDQVdxQjtBQUVyQiwyQ0FBdUM7QUFFdkMsaURBQTZDO0FBVzdDLE1BQWEsbUJBQW9CLFNBQVEsc0JBQVM7SUFDaEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQjs7UUFDM0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixJQUFJLDBCQUFXLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNuQyxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7WUFDcEMsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQzFCLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxrQkFBa0I7WUFDNUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxlQUFlO1NBQ3ZDLENBQUMsQ0FBQztRQUVILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxvQkFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzdELGFBQWEsRUFBRSwyQkFBYSxDQUFDLE9BQU87U0FDckMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLHFDQUFLLENBQUMseUJBQXlCLENBQ2hFLElBQUksRUFDSixvQkFBb0IsRUFDcEI7WUFDRSxXQUFXLEVBQUUsa0JBQWtCLEdBQUcsS0FBSyxDQUFDLGVBQWUsR0FBRyxXQUFXO1lBQ3JFLGtCQUFrQixFQUFFLCtCQUFHLENBQUMsa0JBQWtCLENBQUMsT0FBTztZQUNsRCxxQkFBcUIsRUFBRTtnQkFDckIsWUFBWSxFQUFFLEtBQUssQ0FBQyxrQkFBa0I7YUFDdkM7WUFDRCxtQkFBbUIsRUFBRTtnQkFDbkIsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxV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LElBQUksQ0FBQyxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUNsRSxXQUFXLEVBQUUsdURBQXVEO2dCQUNwRSxPQUFPLEVBQUUsSUFBSTthQUNkLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxnQ0FBTyxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1NBQ3ZEO1FBRUQsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQjtZQUNoQyxVQUFVLEVBQUUsaUJBQUcsQ0FBQyxVQUFVLEdBQUcsa0JBQWtCO1lBQy9DLFdBQVcsRUFBRSxxREFBcUQ7U0FDbkUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUdELGtEQTBHQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpLiBZb3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlXG4gKiAgd2l0aCB0aGUgTGljZW5zZS4gQSBjb3B5IG9mIHRoZSBMaWNlbnNlIGlzIGxvY2F0ZWQgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBvciBpbiB0aGUgJ2xpY2Vuc2UnIGZpbGUgYWNjb21wYW55aW5nIHRoaXMgZmlsZS4gVGhpcyBmaWxlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICdBUyBJUycgQkFTSVMsIFdJVEhPVVQgV0FSUkFOVElFU1xuICogIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGV4cHJlc3Mgb3IgaW1wbGllZC4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zXG4gKiAgYW5kIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCB7XG4gIER1cmF0aW9uLFxuICBDZm5PdXRwdXQsXG4gIEF3cyxcbiAgUmVtb3ZhbFBvbGljeSxcbiAgYXdzX3N0ZXBmdW5jdGlvbnMgYXMgc2ZuLFxuICBhd3Nfc3RlcGZ1bmN0aW9uc190YXNrcyBhcyB0YXNrcyxcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfZHluYW1vZGIgYXMgZGRiLFxuICBhd3NfZXZlbnRzIGFzIGV2ZW50cyxcbiAgYXdzX2V2ZW50c190YXJnZXRzIGFzIHRhcmdldHMsXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb24gfSBmcm9tIFwiLi4vaGVscGVycy92YWxpZGF0b3JzL2NvbmZpZ3VyYXRpb25cIjtcbmltcG9ydCB7IEF0aGVuYVRhYmxlIH0gZnJvbSBcIi4vYXRoZW5hX3RhYmxlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ1Byb3BzIHtcbiAgYWNjb3VudElkOiBzdHJpbmc7XG4gIGF0aGVuYURhdGFiYXNlTmFtZTogc3RyaW5nO1xuICBhdGhlbmFUYWJsZU5hbWU6IHN0cmluZztcbiAgbG9nc0J1Y2tldE5hbWU6IHN0cmluZztcbiAgZHluYW1vZGJUYWJsZTogZGRiLklUYWJsZTtcbiAgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBHZXRTZXNzaW9uc1dvcmtmbG93IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IElDb25maWdQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBuZXcgQXRoZW5hVGFibGUodGhpcywgXCJBdGhlbmFUYWJsZVwiLCB7XG4gICAgICBsb2dzQnVja2V0TmFtZTogcHJvcHMubG9nc0J1Y2tldE5hbWUsXG4gICAgICBhY2NvdW50SWQ6IHByb3BzLmFjY291bnRJZCxcbiAgICAgIGF0aGVuYURhdGFiYXNlTmFtZTogcHJvcHMuYXRoZW5hRGF0YWJhc2VOYW1lLFxuICAgICAgYXRoZW5hVGFibGVOYW1lOiBwcm9wcy5hdGhlbmFUYWJsZU5hbWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHRzQnVja2V0TmFtZSA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJSZXN1bHRzQnVja2V0XCIsIHtcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN0YXJ0UXVlcnlFeGVjdXRpb25Kb2IgPSBuZXcgdGFza3MuQXRoZW5hU3RhcnRRdWVyeUV4ZWN1dGlvbihcbiAgICAgIHRoaXMsXG4gICAgICBcIlN0YXJ0IEF0aGVuYSBRdWVyeVwiLFxuICAgICAge1xuICAgICAgICBxdWVyeVN0cmluZzogXCJTRUxFQ1QgdXJpIEZST00gXCIgKyBwcm9wcy5hdGhlbmFUYWJsZU5hbWUgKyBcIiBsaW1pdCAxMVwiLFxuICAgICAgICBpbnRlZ3JhdGlvblBhdHRlcm46IHNmbi5JbnRlZ3JhdGlvblBhdHRlcm4uUlVOX0pPQixcbiAgICAgICAgcXVlcnlFeGVjdXRpb25Db250ZXh0OiB7XG4gICAgICAgICAgZGF0YWJhc2VOYW1lOiBwcm9wcy5hdGhlbmFEYXRhYmFzZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHJlc3VsdENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBvdXRwdXRMb2NhdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogcmVzdWx0c0J1Y2tldE5hbWUuYnVja2V0TmFtZSxcbiAgICAgICAgICAgIG9iamVjdEtleTogXCJyZXN1bHRzXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc3QgZ2V0UXVlcnlSZXN1bHRzSm9iID0gbmV3IHRhc2tzLkF0aGVuYUdldFF1ZXJ5UmVzdWx0cyhcbiAgICAgIHRoaXMsXG4gICAgICBcIkdldCBRdWVyeSBSZXN1bHRzXCIsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5RXhlY3V0aW9uSWQ6IHNmbi5Kc29uUGF0aC5zdHJpbmdBdChcbiAgICAgICAgICBcIiQuUXVlcnlFeGVjdXRpb24uUXVlcnlFeGVjdXRpb25JZFwiXG4gICAgICAgICksXG4gICAgICAgIHJlc3VsdFBhdGg6IHNmbi5Kc29uUGF0aC5zdHJpbmdBdChcIiQuR2V0UXVlcnlSZXN1bHRzXCIpLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBzZW5kVG9EZGIgPSBuZXcgdGFza3MuRHluYW1vUHV0SXRlbSh0aGlzLCBcIlNhdmUgdG8gRHluYW1vREJcIiwge1xuICAgICAgaXRlbToge1xuICAgICAgICBzZXNzaW9uaWQ6IHRhc2tzLkR5bmFtb0F0dHJpYnV0ZVZhbHVlLmZyb21TdHJpbmcoXG4gICAgICAgICAgc2ZuLkpzb25QYXRoLnN0cmluZ0F0KFwiJFwiKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIHRhYmxlOiBwcm9wcy5keW5hbW9kYlRhYmxlLFxuICAgICAgaW5wdXRQYXRoOiBzZm4uSnNvblBhdGguc3RyaW5nQXQoXCIkLkRhdGFbMF0uVmFyQ2hhclZhbHVlXCIpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlcGFyZU5leHRQYXJhbXMgPSBuZXcgc2ZuLlBhc3ModGhpcywgXCJQcmVwYXJlIE5leHQgUXVlcnkgUGFyYW1zXCIsIHtcbiAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgXCJRdWVyeUV4ZWN1dGlvbklkLiRcIjogXCIkLlN0YXJ0UXVlcnlQYXJhbXMuUXVlcnlFeGVjdXRpb25JZFwiLFxuICAgICAgICBcIk5leHRUb2tlbi4kXCI6IFwiJC5HZXRRdWVyeVJlc3VsdHMuTmV4dFRva2VuXCIsXG4gICAgICB9LFxuICAgICAgcmVzdWx0UGF0aDogc2ZuLkpzb25QYXRoLnN0cmluZ0F0KFwiJC5TdGFydFF1ZXJ5UGFyYW1zXCIpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaGFzTW9yZVJlc3VsdHMgPSBuZXcgc2ZuLkNob2ljZSh0aGlzLCBcIkhhcyBNb3JlIFJlc3VsdHM/XCIpXG4gICAgICAud2hlbihcbiAgICAgICAgc2ZuLkNvbmRpdGlvbi5pc1ByZXNlbnQoXCIkLkdldFF1ZXJ5UmVzdWx0cy5OZXh0VG9rZW5cIiksXG4gICAgICAgIHByZXBhcmVOZXh0UGFyYW1zLm5leHQoZ2V0UXVlcnlSZXN1bHRzSm9iKVxuICAgICAgKVxuICAgICAgLm90aGVyd2lzZShuZXcgc2ZuLlN1Y2NlZWQodGhpcywgXCJEb25lXCIpKTtcblxuICAgIC8vU2F2ZV90b19keW5hbW9kYlxuICAgIGNvbnN0IG1hcCA9IG5ldyBzZm4uTWFwKHRoaXMsIFwiTWFwIFN0YXRlXCIsIHtcbiAgICAgIG1heENvbmN1cnJlbmN5OiAxLFxuICAgICAgaW5wdXRQYXRoOiBzZm4uSnNvblBhdGguc3RyaW5nQXQoXCIkLkdldFF1ZXJ5UmVzdWx0cy5SZXN1bHRTZXQuUm93c1sxOl1cIiksXG4gICAgICByZXN1bHRQYXRoOiBzZm4uSnNvblBhdGguRElTQ0FSRCxcbiAgICB9KTtcbiAgICBtYXAuaXRlcmF0b3Ioc2VuZFRvRGRiKTtcblxuICAgIC8vIFN0ZXAgZnVuY3Rpb24gdG8gb3JjaGVzdHJhdGUgQXRoZW5hIHF1ZXJ5IGFuZCByZXRyaWV2aW5nIHRoZSByZXN1bHRzXG4gICAgY29uc3Qgd29ya2Zsb3cgPSBuZXcgc2ZuLlN0YXRlTWFjaGluZSh0aGlzLCBcIkF0aGVuYVF1ZXJ5XCIsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6IEF3cy5TVEFDS19OQU1FICsgXCJfRGV0ZWN0U2Vzc2lvbnNcIixcbiAgICAgIGRlZmluaXRpb246IHN0YXJ0UXVlcnlFeGVjdXRpb25Kb2JcbiAgICAgICAgLm5leHQoZ2V0UXVlcnlSZXN1bHRzSm9iKVxuICAgICAgICAubmV4dChtYXApXG4gICAgICAgIC5uZXh0KGhhc01vcmVSZXN1bHRzKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNjApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdHJpZ2dlckZyZXF1ZW5jeSA9XG4gICAgICBwcm9wcy5jb25maWd1cmF0aW9uLnNlc3Npb25SZXZvY2F0aW9uPy50cmlnZ2VyX3dvcmtmbG93X2ZyZXF1ZW5jeSB8fCAwO1xuICAgIGlmICh0cmlnZ2VyRnJlcXVlbmN5ID4gMCkge1xuICAgICAgLy8gVHJpZ2dlciBTZm4gdG8gcm90YXRlIHRoZSBzZWNyZXRzIGV2ZXJ5IFggbWludXRlc1xuICAgICAgY29uc3QgcnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCBcIlJ1bGVJbnZhbGlkYXRlU2Vzc2lvbnNcIiwge1xuICAgICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoRHVyYXRpb24ubWludXRlcyh0cmlnZ2VyRnJlcXVlbmN5KSksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRyaWdnZXIgU3RlcEZ1bmN0aW9uIHRvIGRldGVjdCBzZXNzaW9ucyB0byBpbnZhbGlkYXRlXCIsXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgcnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHdvcmtmbG93KSk7XG4gICAgfVxuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlNlc3Npb25JbnZhbGlkYXRlTmFtZVwiLCB7XG4gICAgICB2YWx1ZTogd29ya2Zsb3cuc3RhdGVNYWNoaW5lTmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IEF3cy5TVEFDS19OQU1FICsgXCJTdGF0ZU1hY2hpbmVOYW1lXCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTdGF0ZSBtYWNoaW5lIHVzZWQgdG8gZGV0ZWN0IHNlc3Npb25zIHRvIGludmFsaWRhdGVcIixcbiAgICB9KTtcbiAgfVxufVxuIl19