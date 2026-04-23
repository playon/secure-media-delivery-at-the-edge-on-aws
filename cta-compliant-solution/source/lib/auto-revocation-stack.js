"use strict";
/**
 * CTA Real-Time Auto-Revocation Stack
 *
 * Pipeline: CloudFront Real-Time Logs → Kinesis Data Stream → Lambda → Bedrock Nova Pro → KVS
 *
 * CloudFront sends real-time access logs to a Kinesis Data Stream. A Lambda
 * function consumes the stream, aggregates requests by CTA session token,
 * pre-filters for suspicious patterns, and sends flagged sessions to Bedrock
 * Nova Pro for AI-powered analysis. Sessions identified as shared or abused
 * are revoked in CloudFront KeyValueStore for instant edge blocking.
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
        // --- Kinesis Data Stream for CloudFront real-time logs ---
        const logStream = new aws_cdk_lib_1.aws_kinesis.Stream(this, "RealtimeLogStream", {
            streamName: `${this.stackName}-cf-realtime-logs`,
            shardCount: 1,
            retentionPeriod: aws_cdk_lib_1.Duration.hours(24),
        });
        // --- CloudFront Real-Time Log Configuration ---
        // Sends selected log fields to the Kinesis stream.
        // Fields chosen for session analysis: timestamp, IP, status, URI, method,
        // host, user-agent, bytes, time-taken, country.
        const realtimeLogConfig = new aws_cdk_lib_1.aws_cloudfront.CfnRealtimeLogConfig(this, "RealtimeLogConfig", {
            name: `${this.stackName}-realtime-logs`,
            samplingRate: 100, // 100% of requests
            endPoints: [{
                    streamType: "Kinesis",
                    kinesisStreamConfig: {
                        roleArn: new aws_cdk_lib_1.aws_iam.Role(this, "CloudFrontKinesisRole", {
                            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal("cloudfront.amazonaws.com"),
                            inlinePolicies: {
                                kinesis: new aws_cdk_lib_1.aws_iam.PolicyDocument({
                                    statements: [new aws_cdk_lib_1.aws_iam.PolicyStatement({
                                            actions: ["kinesis:PutRecord", "kinesis:PutRecords", "kinesis:DescribeStream"],
                                            resources: [logStream.streamArn],
                                        })],
                                }),
                            },
                        }).roleArn,
                        streamArn: logStream.streamArn,
                    },
                }],
            fields: [
                "timestamp",
                "c-ip",
                "sc-status",
                "cs-uri-stem",
                "cs-method",
                "cs-host",
                "cs-user-agent",
                "sc-bytes",
                "time-taken",
                "c-country",
            ],
        });
        // --- Kinesis Stream Processor Lambda ---
        // Consumes real-time log batches, aggregates by session, pre-filters
        // suspicious patterns, sends to Bedrock Nova Pro, revokes flagged sessions.
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
        // Kinesis event source — process in batches for efficient aggregation
        analyzer.addEventSource(new aws_cdk_lib_1.aws_lambda_event_sources.KinesisEventSource(logStream, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1yZXZvY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0by1yZXZvY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7OztHQVVHOzs7QUFFSCw2Q0FTcUI7QUFVckIsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQUU1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDNUIsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUM1RCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxzQkFBc0IsQ0FBQztRQUVyRSw0REFBNEQ7UUFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBSSx5QkFBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDOUQsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsbUJBQW1CO1lBQ2hELFVBQVUsRUFBRSxDQUFDO1lBQ2IsZUFBZSxFQUFFLHNCQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztTQUNwQyxDQUFDLENBQUM7UUFFSCxpREFBaUQ7UUFDakQsbURBQW1EO1FBQ25ELDBFQUEwRTtRQUMxRSxnREFBZ0Q7UUFDaEQsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLDRCQUFVLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZGLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGdCQUFnQjtZQUN2QyxZQUFZLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUN0QyxTQUFTLEVBQUUsQ0FBQztvQkFDVixVQUFVLEVBQUUsU0FBUztvQkFDckIsbUJBQW1CLEVBQUU7d0JBQ25CLE9BQU8sRUFBRSxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTs0QkFDbkQsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQzs0QkFDL0QsY0FBYyxFQUFFO2dDQUNkLE9BQU8sRUFBRSxJQUFJLHFCQUFHLENBQUMsY0FBYyxDQUFDO29DQUM5QixVQUFVLEVBQUUsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDOzRDQUNuQyxPQUFPLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSx3QkFBd0IsQ0FBQzs0Q0FDOUUsU0FBUyxFQUFFLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQzt5Q0FDakMsQ0FBQyxDQUFDO2lDQUNKLENBQUM7NkJBQ0g7eUJBQ0YsQ0FBQyxDQUFDLE9BQU87d0JBQ1YsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTO3FCQUMvQjtpQkFDRixDQUFDO1lBQ0YsTUFBTSxFQUFFO2dCQUNOLFdBQVc7Z0JBQ1gsTUFBTTtnQkFDTixXQUFXO2dCQUNYLGFBQWE7Z0JBQ2IsV0FBVztnQkFDWCxTQUFTO2dCQUNULGVBQWU7Z0JBQ2YsVUFBVTtnQkFDVixZQUFZO2dCQUNaLFdBQVc7YUFDWjtTQUNGLENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxxRUFBcUU7UUFDckUsNEVBQTRFO1FBQzVFLE1BQU0sUUFBUSxHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQzVELE9BQU8sRUFBRSx3QkFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSwwQkFBMEI7WUFDbkMsSUFBSSxFQUFFLHdCQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDckMsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM1QixVQUFVLEVBQUUsR0FBRztZQUNmLFdBQVcsRUFBRTtnQkFDWCxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0I7Z0JBQ3ZDLGNBQWMsRUFBRSxhQUFhO2dCQUM3QixhQUFhLEVBQUUsWUFBWTthQUM1QjtTQUNGLENBQUMsQ0FBQztRQUVILHNFQUFzRTtRQUN0RSxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksc0NBQVksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUU7WUFDckUsZ0JBQWdCLEVBQUUsd0JBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNO1lBQ2hELFNBQVMsRUFBRSxHQUFHO1lBQ2QsaUJBQWlCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLGFBQWEsRUFBRSxDQUFDO1NBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUosc0JBQXNCO1FBQ3RCLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztZQUMvQyxPQUFPLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztZQUNoQyxTQUFTLEVBQUUsQ0FBQyxtQkFBbUIsYUFBYSxzQkFBc0IsWUFBWSxFQUFFLENBQUM7U0FDbEYsQ0FBQyxDQUFDLENBQUM7UUFFSiwwQ0FBMEM7UUFDMUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO1lBQy9DLE9BQU8sRUFBRSxDQUFDLGlDQUFpQyxFQUFFLGdEQUFnRCxDQUFDO1lBQzlGLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7U0FDNUMsQ0FBQyxDQUFDLENBQUM7SUFDTixDQUFDO0NBQ0Y7QUExRkQsa0RBMEZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDVEEgUmVhbC1UaW1lIEF1dG8tUmV2b2NhdGlvbiBTdGFja1xuICpcbiAqIFBpcGVsaW5lOiBDbG91ZEZyb250IFJlYWwtVGltZSBMb2dzIOKGkiBLaW5lc2lzIERhdGEgU3RyZWFtIOKGkiBMYW1iZGEg4oaSIEJlZHJvY2sgTm92YSBQcm8g4oaSIEtWU1xuICpcbiAqIENsb3VkRnJvbnQgc2VuZHMgcmVhbC10aW1lIGFjY2VzcyBsb2dzIHRvIGEgS2luZXNpcyBEYXRhIFN0cmVhbS4gQSBMYW1iZGFcbiAqIGZ1bmN0aW9uIGNvbnN1bWVzIHRoZSBzdHJlYW0sIGFnZ3JlZ2F0ZXMgcmVxdWVzdHMgYnkgQ1RBIHNlc3Npb24gdG9rZW4sXG4gKiBwcmUtZmlsdGVycyBmb3Igc3VzcGljaW91cyBwYXR0ZXJucywgYW5kIHNlbmRzIGZsYWdnZWQgc2Vzc2lvbnMgdG8gQmVkcm9ja1xuICogTm92YSBQcm8gZm9yIEFJLXBvd2VyZWQgYW5hbHlzaXMuIFNlc3Npb25zIGlkZW50aWZpZWQgYXMgc2hhcmVkIG9yIGFidXNlZFxuICogYXJlIHJldm9rZWQgaW4gQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIGZvciBpbnN0YW50IGVkZ2UgYmxvY2tpbmcuXG4gKi9cblxuaW1wb3J0IHtcbiAgU3RhY2ssXG4gIFN0YWNrUHJvcHMsXG4gIER1cmF0aW9uLFxuICBhd3Nfa2luZXNpcyBhcyBraW5lc2lzLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2xhbWJkYV9ldmVudF9zb3VyY2VzIGFzIGV2ZW50c291cmNlcyxcbiAgYXdzX2Nsb3VkZnJvbnQgYXMgY2xvdWRmcm9udCxcbiAgYXdzX2lhbSBhcyBpYW0sXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dG9SZXZvY2F0aW9uU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICByZWFkb25seSBrdlN0b3JlOiBjbG91ZGZyb250LktleVZhbHVlU3RvcmU7XG4gIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIHJlYWRvbmx5IGNvbmZpZzogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgQXV0b1Jldm9jYXRpb25TdGFjayBleHRlbmRzIFN0YWNrIHtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0b1Jldm9jYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5jb25maWc7XG4gICAgY29uc3QgYmVkcm9ja1JlZ2lvbiA9IGNvbmZpZy5iZWRyb2NrPy5yZWdpb24gfHwgdGhpcy5yZWdpb247XG4gICAgY29uc3QgYmVkcm9ja01vZGVsID0gY29uZmlnLmJlZHJvY2s/Lm1vZGVsIHx8IFwiYW1hem9uLm5vdmEtcHJvLXYxOjBcIjtcblxuICAgIC8vIC0tLSBLaW5lc2lzIERhdGEgU3RyZWFtIGZvciBDbG91ZEZyb250IHJlYWwtdGltZSBsb2dzIC0tLVxuICAgIGNvbnN0IGxvZ1N0cmVhbSA9IG5ldyBraW5lc2lzLlN0cmVhbSh0aGlzLCBcIlJlYWx0aW1lTG9nU3RyZWFtXCIsIHtcbiAgICAgIHN0cmVhbU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1jZi1yZWFsdGltZS1sb2dzYCxcbiAgICAgIHNoYXJkQ291bnQ6IDEsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IER1cmF0aW9uLmhvdXJzKDI0KSxcbiAgICB9KTtcblxuICAgIC8vIC0tLSBDbG91ZEZyb250IFJlYWwtVGltZSBMb2cgQ29uZmlndXJhdGlvbiAtLS1cbiAgICAvLyBTZW5kcyBzZWxlY3RlZCBsb2cgZmllbGRzIHRvIHRoZSBLaW5lc2lzIHN0cmVhbS5cbiAgICAvLyBGaWVsZHMgY2hvc2VuIGZvciBzZXNzaW9uIGFuYWx5c2lzOiB0aW1lc3RhbXAsIElQLCBzdGF0dXMsIFVSSSwgbWV0aG9kLFxuICAgIC8vIGhvc3QsIHVzZXItYWdlbnQsIGJ5dGVzLCB0aW1lLXRha2VuLCBjb3VudHJ5LlxuICAgIGNvbnN0IHJlYWx0aW1lTG9nQ29uZmlnID0gbmV3IGNsb3VkZnJvbnQuQ2ZuUmVhbHRpbWVMb2dDb25maWcodGhpcywgXCJSZWFsdGltZUxvZ0NvbmZpZ1wiLCB7XG4gICAgICBuYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tcmVhbHRpbWUtbG9nc2AsXG4gICAgICBzYW1wbGluZ1JhdGU6IDEwMCwgLy8gMTAwJSBvZiByZXF1ZXN0c1xuICAgICAgZW5kUG9pbnRzOiBbe1xuICAgICAgICBzdHJlYW1UeXBlOiBcIktpbmVzaXNcIixcbiAgICAgICAga2luZXNpc1N0cmVhbUNvbmZpZzoge1xuICAgICAgICAgIHJvbGVBcm46IG5ldyBpYW0uUm9sZSh0aGlzLCBcIkNsb3VkRnJvbnRLaW5lc2lzUm9sZVwiLCB7XG4gICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImNsb3VkZnJvbnQuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgICAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgICAgICAgIGtpbmVzaXM6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXCJraW5lc2lzOlB1dFJlY29yZFwiLCBcImtpbmVzaXM6UHV0UmVjb3Jkc1wiLCBcImtpbmVzaXM6RGVzY3JpYmVTdHJlYW1cIl0sXG4gICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtsb2dTdHJlYW0uc3RyZWFtQXJuXSxcbiAgICAgICAgICAgICAgICB9KV0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KS5yb2xlQXJuLFxuICAgICAgICAgIHN0cmVhbUFybjogbG9nU3RyZWFtLnN0cmVhbUFybixcbiAgICAgICAgfSxcbiAgICAgIH1dLFxuICAgICAgZmllbGRzOiBbXG4gICAgICAgIFwidGltZXN0YW1wXCIsXG4gICAgICAgIFwiYy1pcFwiLFxuICAgICAgICBcInNjLXN0YXR1c1wiLFxuICAgICAgICBcImNzLXVyaS1zdGVtXCIsXG4gICAgICAgIFwiY3MtbWV0aG9kXCIsXG4gICAgICAgIFwiY3MtaG9zdFwiLFxuICAgICAgICBcImNzLXVzZXItYWdlbnRcIixcbiAgICAgICAgXCJzYy1ieXRlc1wiLFxuICAgICAgICBcInRpbWUtdGFrZW5cIixcbiAgICAgICAgXCJjLWNvdW50cnlcIixcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyAtLS0gS2luZXNpcyBTdHJlYW0gUHJvY2Vzc29yIExhbWJkYSAtLS1cbiAgICAvLyBDb25zdW1lcyByZWFsLXRpbWUgbG9nIGJhdGNoZXMsIGFnZ3JlZ2F0ZXMgYnkgc2Vzc2lvbiwgcHJlLWZpbHRlcnNcbiAgICAvLyBzdXNwaWNpb3VzIHBhdHRlcm5zLCBzZW5kcyB0byBCZWRyb2NrIE5vdmEgUHJvLCByZXZva2VzIGZsYWdnZWQgc2Vzc2lvbnMuXG4gICAgY29uc3QgYW5hbHl6ZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiS2luZXNpc0FuYWx5emVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJraW5lc2lzX2FuYWx5emVyLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBLVlNfQVJOOiBwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4sXG4gICAgICAgIEJFRFJPQ0tfUkVHSU9OOiBiZWRyb2NrUmVnaW9uLFxuICAgICAgICBCRURST0NLX01PREVMOiBiZWRyb2NrTW9kZWwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gS2luZXNpcyBldmVudCBzb3VyY2Ug4oCUIHByb2Nlc3MgaW4gYmF0Y2hlcyBmb3IgZWZmaWNpZW50IGFnZ3JlZ2F0aW9uXG4gICAgYW5hbHl6ZXIuYWRkRXZlbnRTb3VyY2UobmV3IGV2ZW50c291cmNlcy5LaW5lc2lzRXZlbnRTb3VyY2UobG9nU3RyZWFtLCB7XG4gICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5MQVRFU1QsXG4gICAgICBiYXRjaFNpemU6IDUwMCxcbiAgICAgIG1heEJhdGNoaW5nV2luZG93OiBEdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIHJldHJ5QXR0ZW1wdHM6IDIsXG4gICAgfSkpO1xuXG4gICAgLy8gQmVkcm9jayBwZXJtaXNzaW9uc1xuICAgIGFuYWx5emVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrOkludm9rZU1vZGVsXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6YmVkcm9jazoke2JlZHJvY2tSZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsLyR7YmVkcm9ja01vZGVsfWBdLFxuICAgIH0pKTtcblxuICAgIC8vIEtWUyBwZXJtaXNzaW9ucyBmb3Igd3JpdGluZyByZXZvY2F0aW9uc1xuICAgIGFuYWx5emVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6UHV0S2V5XCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3Byb3BzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUFybl0sXG4gICAgfSkpO1xuICB9XG59XG4iXX0=