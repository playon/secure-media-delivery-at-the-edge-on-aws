"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoRevocationStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
class AutoRevocationStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const config = props.config;
        const bedrockRegion = config.bedrock?.region || this.region;
        const bedrockModel = config.bedrock?.model || "amazon.nova-pro-v1:0";
        const frequency = this.parseFrequency(config.main.revocationFrequency);
        // DynamoDB for session tracking
        const sessionsTable = new aws_cdk_lib_1.aws_dynamodb.Table(this, "SessionsTable", {
            partitionKey: { name: "session_id", type: aws_cdk_lib_1.aws_dynamodb.AttributeType.STRING },
            billingMode: aws_cdk_lib_1.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: "ttl",
        });
        // S3 for Athena queries
        const queryBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, "AthenaQueryBucket");
        // Lambda functions
        const prepareQuery = new aws_cdk_lib_1.aws_lambda.Function(this, "PrepareQuery", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "prepare_query.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.minutes(1),
            environment: {
                QUERY_BUCKET: queryBucket.bucketName,
            },
        });
        const bedrockAnalyzer = new aws_cdk_lib_1.aws_lambda.Function(this, "BedrockAnalyzer", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "bedrock_analyzer.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.minutes(10),
            environment: {
                BEDROCK_REGION: bedrockRegion,
                BEDROCK_MODEL: bedrockModel,
            },
        });
        const updateRevocations = new aws_cdk_lib_1.aws_lambda.Function(this, "UpdateRevocations", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "update_revocations.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.minutes(2),
            environment: {
                KVS_ID: props.kvStore.keyValueStoreId,
                SESSIONS_TABLE: sessionsTable.tableName,
            },
        });
        // Permissions
        queryBucket.grantReadWrite(prepareQuery);
        sessionsTable.grantReadWriteData(updateRevocations);
        // Grant KVS update permission via IAM policy (KeyValueStore.grant not available in CDK 2.170.0)
        updateRevocations.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["cloudfront-keyvaluestore:UpdateKeys", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
            resources: [props.kvStore.keyValueStoreArn],
        }));
        // Bedrock permissions
        bedrockAnalyzer.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["bedrock:InvokeModel"],
            resources: [`arn:aws:bedrock:${bedrockRegion}::foundation-model/${bedrockModel}`],
        }));
        bedrockAnalyzer.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["athena:GetQueryResults", "athena:GetQueryExecution"],
            resources: ["*"],
        }));
        // Step Functions workflow
        const workflow = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "PrepareQueryTask", {
            lambdaFunction: prepareQuery,
            outputPath: "$.Payload",
        }).next(new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "BedrockAnalysisTask", {
            lambdaFunction: bedrockAnalyzer,
            outputPath: "$.Payload",
        })).next(new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "UpdateRevocationsTask", {
            lambdaFunction: updateRevocations,
            outputPath: "$.Payload",
        }));
        const stateMachine = new aws_cdk_lib_1.aws_stepfunctions.StateMachine(this, "BedrockAutoRevocationWorkflow", {
            definition: workflow,
            timeout: aws_cdk_lib_1.Duration.minutes(20),
            comment: `AI-powered revocation using ${bedrockModel}`,
        });
        // EventBridge schedule
        new aws_cdk_lib_1.aws_events.Rule(this, "BedrockRevocationSchedule", {
            schedule: aws_cdk_lib_1.aws_events.Schedule.rate(frequency),
            targets: [new aws_cdk_lib_1.aws_events_targets.SfnStateMachine(stateMachine)],
        });
    }
    parseFrequency(freq) {
        const match = freq.match(/^(\d+)([mh])$/);
        if (!match)
            return aws_cdk_lib_1.Duration.minutes(10);
        const value = parseInt(match[1]);
        const unit = match[2];
        return unit === 'h' ? aws_cdk_lib_1.Duration.hours(value) : aws_cdk_lib_1.Duration.minutes(value);
    }
}
exports.AutoRevocationStack = AutoRevocationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1yZXZvY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0by1yZXZvY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQWFxQjtBQVNyQixNQUFhLG1CQUFvQixTQUFRLG1CQUFLO0lBRTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUM1QixNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQzVELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsS0FBSyxJQUFJLHNCQUFzQixDQUFDO1FBQ3JFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRXZFLGdDQUFnQztRQUNoQyxNQUFNLGFBQWEsR0FBRyxJQUFJLDBCQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDekQsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsMEJBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3BFLFdBQVcsRUFBRSwwQkFBRyxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQzVDLG1CQUFtQixFQUFFLEtBQUs7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLE1BQU0sV0FBVyxHQUFHLElBQUksb0JBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFN0QsbUJBQW1CO1FBQ25CLE1BQU0sWUFBWSxHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUM3RCxPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsdUJBQXVCO1lBQ2hDLElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO1lBQ3JDLE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDNUIsV0FBVyxFQUFFO2dCQUNYLFlBQVksRUFBRSxXQUFXLENBQUMsVUFBVTthQUNyQztTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ25FLE9BQU8sRUFBRSx3QkFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSwwQkFBMEI7WUFDbkMsSUFBSSxFQUFFLHdCQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDckMsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixXQUFXLEVBQUU7Z0JBQ1gsY0FBYyxFQUFFLGFBQWE7Z0JBQzdCLGFBQWEsRUFBRSxZQUFZO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2RSxPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsNEJBQTRCO1lBQ3JDLElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO1lBQ3JDLE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDNUIsV0FBVyxFQUFFO2dCQUNYLE1BQU0sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQWU7Z0JBQ3JDLGNBQWMsRUFBRSxhQUFhLENBQUMsU0FBUzthQUN4QztTQUNGLENBQUMsQ0FBQztRQUVILGNBQWM7UUFDZCxXQUFXLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3pDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRXBELGdHQUFnRztRQUNoRyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztZQUN4RCxNQUFNLEVBQUUscUJBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyxxQ0FBcUMsRUFBRSxnREFBZ0QsQ0FBQztZQUNsRyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDO1NBQzVDLENBQUMsQ0FBQyxDQUFDO1FBRUosc0JBQXNCO1FBQ3RCLGVBQWUsQ0FBQyxlQUFlLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztZQUN0RCxNQUFNLEVBQUUscUJBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztZQUNoQyxTQUFTLEVBQUUsQ0FBQyxtQkFBbUIsYUFBYSxzQkFBc0IsWUFBWSxFQUFFLENBQUM7U0FDbEYsQ0FBQyxDQUFDLENBQUM7UUFFSixlQUFlLENBQUMsZUFBZSxDQUFDLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEQsTUFBTSxFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsd0JBQXdCLEVBQUUsMEJBQTBCLENBQUM7WUFDL0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1NBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUosMEJBQTBCO1FBQzFCLE1BQU0sUUFBUSxHQUFHLElBQUkscUNBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ2hFLGNBQWMsRUFBRSxZQUFZO1lBQzVCLFVBQVUsRUFBRSxXQUFXO1NBQ3hCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxxQ0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDMUQsY0FBYyxFQUFFLGVBQWU7WUFDL0IsVUFBVSxFQUFFLFdBQVc7U0FDeEIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUkscUNBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzdELGNBQWMsRUFBRSxpQkFBaUI7WUFDakMsVUFBVSxFQUFFLFdBQVc7U0FDeEIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLFlBQVksR0FBRyxJQUFJLCtCQUFHLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUMvRSxVQUFVLEVBQUUsUUFBUTtZQUNwQixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sRUFBRSwrQkFBK0IsWUFBWSxFQUFFO1NBQ3ZELENBQUMsQ0FBQztRQUVILHVCQUF1QjtRQUN2QixJQUFJLHdCQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNqRCxRQUFRLEVBQUUsd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUN6QyxPQUFPLEVBQUUsQ0FBQyxJQUFJLGdDQUFPLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDO1NBQ3JELENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxjQUFjLENBQUMsSUFBWTtRQUNqQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzFDLElBQUksQ0FBQyxLQUFLO1lBQUUsT0FBTyxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUV4QyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXRCLE9BQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsc0JBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hFLENBQUM7Q0FDRjtBQS9HRCxrREErR0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTdGFjayxcbiAgU3RhY2tQcm9wcyxcbiAgRHVyYXRpb24sXG4gIGF3c19zdGVwZnVuY3Rpb25zIGFzIHNmbixcbiAgYXdzX3N0ZXBmdW5jdGlvbnNfdGFza3MgYXMgdGFza3MsXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfZXZlbnRzIGFzIGV2ZW50cyxcbiAgYXdzX2V2ZW50c190YXJnZXRzIGFzIHRhcmdldHMsXG4gIGF3c19keW5hbW9kYiBhcyBkZGIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2Nsb3VkZnJvbnQgYXMgY2xvdWRmcm9udCxcbiAgYXdzX2lhbSBhcyBpYW0sXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dG9SZXZvY2F0aW9uU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICByZWFkb25seSBrdlN0b3JlOiBjbG91ZGZyb250LktleVZhbHVlU3RvcmU7XG4gIHJlYWRvbmx5IGNvbmZpZzogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgQXV0b1Jldm9jYXRpb25TdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRvUmV2b2NhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLmNvbmZpZztcbiAgICBjb25zdCBiZWRyb2NrUmVnaW9uID0gY29uZmlnLmJlZHJvY2s/LnJlZ2lvbiB8fCB0aGlzLnJlZ2lvbjtcbiAgICBjb25zdCBiZWRyb2NrTW9kZWwgPSBjb25maWcuYmVkcm9jaz8ubW9kZWwgfHwgXCJhbWF6b24ubm92YS1wcm8tdjE6MFwiO1xuICAgIGNvbnN0IGZyZXF1ZW5jeSA9IHRoaXMucGFyc2VGcmVxdWVuY3koY29uZmlnLm1haW4ucmV2b2NhdGlvbkZyZXF1ZW5jeSk7XG5cbiAgICAvLyBEeW5hbW9EQiBmb3Igc2Vzc2lvbiB0cmFja2luZ1xuICAgIGNvbnN0IHNlc3Npb25zVGFibGUgPSBuZXcgZGRiLlRhYmxlKHRoaXMsIFwiU2Vzc2lvbnNUYWJsZVwiLCB7XG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJzZXNzaW9uX2lkXCIsIHR5cGU6IGRkYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGRkYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiBcInR0bFwiLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgZm9yIEF0aGVuYSBxdWVyaWVzXG4gICAgY29uc3QgcXVlcnlCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQXRoZW5hUXVlcnlCdWNrZXRcIik7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb25zXG4gICAgY29uc3QgcHJlcGFyZVF1ZXJ5ID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlByZXBhcmVRdWVyeVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwicHJlcGFyZV9xdWVyeS5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUVVFUllfQlVDS0VUOiBxdWVyeUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJlZHJvY2tBbmFseXplciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJCZWRyb2NrQW5hbHl6ZXJcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImJlZHJvY2tfYW5hbHl6ZXIuaGFuZGxlclwiLCBcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQkVEUk9DS19SRUdJT046IGJlZHJvY2tSZWdpb24sXG4gICAgICAgIEJFRFJPQ0tfTU9ERUw6IGJlZHJvY2tNb2RlbCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB1cGRhdGVSZXZvY2F0aW9ucyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJVcGRhdGVSZXZvY2F0aW9uc1wiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwidXBkYXRlX3Jldm9jYXRpb25zLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBLVlNfSUQ6IHByb3BzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUlkLFxuICAgICAgICBTRVNTSU9OU19UQUJMRTogc2Vzc2lvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUGVybWlzc2lvbnNcbiAgICBxdWVyeUJ1Y2tldC5ncmFudFJlYWRXcml0ZShwcmVwYXJlUXVlcnkpO1xuICAgIHNlc3Npb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHVwZGF0ZVJldm9jYXRpb25zKTtcblxuICAgIC8vIEdyYW50IEtWUyB1cGRhdGUgcGVybWlzc2lvbiB2aWEgSUFNIHBvbGljeSAoS2V5VmFsdWVTdG9yZS5ncmFudCBub3QgYXZhaWxhYmxlIGluIENESyAyLjE3MC4wKVxuICAgIHVwZGF0ZVJldm9jYXRpb25zLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6VXBkYXRlS2V5c1wiLCBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZXNjcmliZUtleVZhbHVlU3RvcmVcIl0sXG4gICAgICByZXNvdXJjZXM6IFtwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcbiAgICBcbiAgICAvLyBCZWRyb2NrIHBlcm1pc3Npb25zXG4gICAgYmVkcm9ja0FuYWx5emVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrOkludm9rZU1vZGVsXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6YmVkcm9jazoke2JlZHJvY2tSZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsLyR7YmVkcm9ja01vZGVsfWBdLFxuICAgIH0pKTtcblxuICAgIGJlZHJvY2tBbmFseXplci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1wiYXRoZW5hOkdldFF1ZXJ5UmVzdWx0c1wiLCBcImF0aGVuYTpHZXRRdWVyeUV4ZWN1dGlvblwiXSxcbiAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICB9KSk7XG5cbiAgICAvLyBTdGVwIEZ1bmN0aW9ucyB3b3JrZmxvd1xuICAgIGNvbnN0IHdvcmtmbG93ID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCBcIlByZXBhcmVRdWVyeVRhc2tcIiwge1xuICAgICAgbGFtYmRhRnVuY3Rpb246IHByZXBhcmVRdWVyeSxcbiAgICAgIG91dHB1dFBhdGg6IFwiJC5QYXlsb2FkXCIsXG4gICAgfSkubmV4dChuZXcgdGFza3MuTGFtYmRhSW52b2tlKHRoaXMsIFwiQmVkcm9ja0FuYWx5c2lzVGFza1wiLCB7XG4gICAgICBsYW1iZGFGdW5jdGlvbjogYmVkcm9ja0FuYWx5emVyLFxuICAgICAgb3V0cHV0UGF0aDogXCIkLlBheWxvYWRcIixcbiAgICB9KSkubmV4dChuZXcgdGFza3MuTGFtYmRhSW52b2tlKHRoaXMsIFwiVXBkYXRlUmV2b2NhdGlvbnNUYXNrXCIsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiB1cGRhdGVSZXZvY2F0aW9ucyxcbiAgICAgIG91dHB1dFBhdGg6IFwiJC5QYXlsb2FkXCIsXG4gICAgfSkpO1xuXG4gICAgY29uc3Qgc3RhdGVNYWNoaW5lID0gbmV3IHNmbi5TdGF0ZU1hY2hpbmUodGhpcywgXCJCZWRyb2NrQXV0b1Jldm9jYXRpb25Xb3JrZmxvd1wiLCB7XG4gICAgICBkZWZpbml0aW9uOiB3b3JrZmxvdyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMjApLFxuICAgICAgY29tbWVudDogYEFJLXBvd2VyZWQgcmV2b2NhdGlvbiB1c2luZyAke2JlZHJvY2tNb2RlbH1gLFxuICAgIH0pO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2Ugc2NoZWR1bGVcbiAgICBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJCZWRyb2NrUmV2b2NhdGlvblNjaGVkdWxlXCIsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShmcmVxdWVuY3kpLFxuICAgICAgdGFyZ2V0czogW25ldyB0YXJnZXRzLlNmblN0YXRlTWFjaGluZShzdGF0ZU1hY2hpbmUpXSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VGcmVxdWVuY3koZnJlcTogc3RyaW5nKTogRHVyYXRpb24ge1xuICAgIGNvbnN0IG1hdGNoID0gZnJlcS5tYXRjaCgvXihcXGQrKShbbWhdKSQvKTtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4gRHVyYXRpb24ubWludXRlcygxMCk7XG4gICAgXG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUludChtYXRjaFsxXSk7XG4gICAgY29uc3QgdW5pdCA9IG1hdGNoWzJdO1xuICAgIFxuICAgIHJldHVybiB1bml0ID09PSAnaCcgPyBEdXJhdGlvbi5ob3Vycyh2YWx1ZSkgOiBEdXJhdGlvbi5taW51dGVzKHZhbHVlKTtcbiAgfVxufVxuIl19