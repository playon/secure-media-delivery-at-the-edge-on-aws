"use strict";
/**
 * CTA Auto-Revocation Stack (optional)
 *
 * Adds AI-powered session analysis to the real-time log pipeline.
 * Consumes the Kinesis stream created by the main stack, analyzes
 * session patterns with Bedrock Nova Pro, and revokes suspicious
 * sessions in CloudFront KeyValueStore.
 *
 * The main stack handles: Kinesis stream, RealtimeLogConfig, dashboard.
 * This stack adds: Lambda consumer + Bedrock analysis.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoRevocationStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
class AutoRevocationStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const config = props.config;
        const bedrockRegion = config.bedrock?.region || this.region;
        const bedrockModel = config.bedrock?.model || "amazon.nova-pro-v1:0";
        // Kinesis stream processor — aggregates sessions, calls Bedrock, revokes
        const analyzer = new aws_cdk_lib_1.aws_lambda.Function(this, "KinesisAnalyzer", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "kinesis_analyzer.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            memorySize: 512,
            environment: {
                KVS_ARN: props.kvStore.keyValueStoreArn,
                BEDROCK_REGION: bedrockRegion,
                BEDROCK_MODEL: bedrockModel,
            },
        });
        // Consume the Kinesis stream from the main stack
        analyzer.addEventSource(new aws_cdk_lib_1.aws_lambda_event_sources.KinesisEventSource(props.logStream, {
            startingPosition: aws_cdk_lib_1.aws_lambda.StartingPosition.LATEST,
            batchSize: 500,
            maxBatchingWindow: aws_cdk_lib_1.Duration.seconds(60),
            retryAttempts: 2,
        }));
        // Bedrock permissions
        analyzer.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            actions: ["bedrock:InvokeModel"],
            resources: [`arn:aws:bedrock:${bedrockRegion}::foundation-model/${bedrockModel}`],
        }));
        // KVS permissions for writing revocations
        analyzer.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            actions: ["cloudfront-keyvaluestore:PutKey", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
            resources: [props.kvStore.keyValueStoreArn],
        }));
    }
}
exports.AutoRevocationStack = AutoRevocationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1yZXZvY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0by1yZXZvY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7OztHQVVHOzs7QUFFSCw2Q0FTcUI7QUFVckIsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQUU1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDNUIsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUM1RCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxzQkFBc0IsQ0FBQztRQUVyRSx5RUFBeUU7UUFDekUsTUFBTSxRQUFRLEdBQUcsSUFBSSx3QkFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDNUQsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLDBCQUEwQjtZQUNuQyxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztZQUNyQyxPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzVCLFVBQVUsRUFBRSxHQUFHO1lBQ2YsV0FBVyxFQUFFO2dCQUNYLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLGdCQUFnQjtnQkFDdkMsY0FBYyxFQUFFLGFBQWE7Z0JBQzdCLGFBQWEsRUFBRSxZQUFZO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxzQ0FBWSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUU7WUFDM0UsZ0JBQWdCLEVBQUUsd0JBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNO1lBQ2hELFNBQVMsRUFBRSxHQUFHO1lBQ2QsaUJBQWlCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLGFBQWEsRUFBRSxDQUFDO1NBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUosc0JBQXNCO1FBQ3RCLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztZQUMvQyxPQUFPLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztZQUNoQyxTQUFTLEVBQUUsQ0FBQyxtQkFBbUIsYUFBYSxzQkFBc0IsWUFBWSxFQUFFLENBQUM7U0FDbEYsQ0FBQyxDQUFDLENBQUM7UUFFSiwwQ0FBMEM7UUFDMUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO1lBQy9DLE9BQU8sRUFBRSxDQUFDLGlDQUFpQyxFQUFFLGdEQUFnRCxDQUFDO1lBQzlGLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7U0FDNUMsQ0FBQyxDQUFDLENBQUM7SUFDTixDQUFDO0NBQ0Y7QUEzQ0Qsa0RBMkNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDVEEgQXV0by1SZXZvY2F0aW9uIFN0YWNrIChvcHRpb25hbClcbiAqXG4gKiBBZGRzIEFJLXBvd2VyZWQgc2Vzc2lvbiBhbmFseXNpcyB0byB0aGUgcmVhbC10aW1lIGxvZyBwaXBlbGluZS5cbiAqIENvbnN1bWVzIHRoZSBLaW5lc2lzIHN0cmVhbSBjcmVhdGVkIGJ5IHRoZSBtYWluIHN0YWNrLCBhbmFseXplc1xuICogc2Vzc2lvbiBwYXR0ZXJucyB3aXRoIEJlZHJvY2sgTm92YSBQcm8sIGFuZCByZXZva2VzIHN1c3BpY2lvdXNcbiAqIHNlc3Npb25zIGluIENsb3VkRnJvbnQgS2V5VmFsdWVTdG9yZS5cbiAqXG4gKiBUaGUgbWFpbiBzdGFjayBoYW5kbGVzOiBLaW5lc2lzIHN0cmVhbSwgUmVhbHRpbWVMb2dDb25maWcsIGRhc2hib2FyZC5cbiAqIFRoaXMgc3RhY2sgYWRkczogTGFtYmRhIGNvbnN1bWVyICsgQmVkcm9jayBhbmFseXNpcy5cbiAqL1xuXG5pbXBvcnQge1xuICBTdGFjayxcbiAgU3RhY2tQcm9wcyxcbiAgRHVyYXRpb24sXG4gIGF3c19raW5lc2lzIGFzIGtpbmVzaXMsXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfbGFtYmRhX2V2ZW50X3NvdXJjZXMgYXMgZXZlbnRzb3VyY2VzLFxuICBhd3NfY2xvdWRmcm9udCBhcyBjbG91ZGZyb250LFxuICBhd3NfaWFtIGFzIGlhbSxcbn0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0b1Jldm9jYXRpb25TdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGt2U3RvcmU6IGNsb3VkZnJvbnQuS2V5VmFsdWVTdG9yZTtcbiAgcmVhZG9ubHkgbG9nU3RyZWFtOiBraW5lc2lzLlN0cmVhbTtcbiAgcmVhZG9ubHkgY29uZmlnOiBhbnk7XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRvUmV2b2NhdGlvblN0YWNrIGV4dGVuZHMgU3RhY2sge1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRvUmV2b2NhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLmNvbmZpZztcbiAgICBjb25zdCBiZWRyb2NrUmVnaW9uID0gY29uZmlnLmJlZHJvY2s/LnJlZ2lvbiB8fCB0aGlzLnJlZ2lvbjtcbiAgICBjb25zdCBiZWRyb2NrTW9kZWwgPSBjb25maWcuYmVkcm9jaz8ubW9kZWwgfHwgXCJhbWF6b24ubm92YS1wcm8tdjE6MFwiO1xuXG4gICAgLy8gS2luZXNpcyBzdHJlYW0gcHJvY2Vzc29yIOKAlCBhZ2dyZWdhdGVzIHNlc3Npb25zLCBjYWxscyBCZWRyb2NrLCByZXZva2VzXG4gICAgY29uc3QgYW5hbHl6ZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiS2luZXNpc0FuYWx5emVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJraW5lc2lzX2FuYWx5emVyLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBLVlNfQVJOOiBwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4sXG4gICAgICAgIEJFRFJPQ0tfUkVHSU9OOiBiZWRyb2NrUmVnaW9uLFxuICAgICAgICBCRURST0NLX01PREVMOiBiZWRyb2NrTW9kZWwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29uc3VtZSB0aGUgS2luZXNpcyBzdHJlYW0gZnJvbSB0aGUgbWFpbiBzdGFja1xuICAgIGFuYWx5emVyLmFkZEV2ZW50U291cmNlKG5ldyBldmVudHNvdXJjZXMuS2luZXNpc0V2ZW50U291cmNlKHByb3BzLmxvZ1N0cmVhbSwge1xuICAgICAgc3RhcnRpbmdQb3NpdGlvbjogbGFtYmRhLlN0YXJ0aW5nUG9zaXRpb24uTEFURVNULFxuICAgICAgYmF0Y2hTaXplOiA1MDAsXG4gICAgICBtYXhCYXRjaGluZ1dpbmRvdzogRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICByZXRyeUF0dGVtcHRzOiAyLFxuICAgIH0pKTtcblxuICAgIC8vIEJlZHJvY2sgcGVybWlzc2lvbnNcbiAgICBhbmFseXplci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiYmVkcm9jazpJbnZva2VNb2RlbFwiXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmJlZHJvY2s6JHtiZWRyb2NrUmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8ke2JlZHJvY2tNb2RlbH1gXSxcbiAgICB9KSk7XG5cbiAgICAvLyBLVlMgcGVybWlzc2lvbnMgZm9yIHdyaXRpbmcgcmV2b2NhdGlvbnNcbiAgICBhbmFseXplci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOlB1dEtleVwiLCBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZXNjcmliZUtleVZhbHVlU3RvcmVcIl0sXG4gICAgICByZXNvdXJjZXM6IFtwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcbiAgfVxufVxuIl19