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
        // --- Editable Bedrock Prompt via SSM Parameter Store ---
        const promptParam = new aws_cdk_lib_1.aws_ssm.StringParameter(this, "BedrockPrompt", {
            parameterName: `/${this.stackName}/bedrock-prompt`,
            stringValue: "You are a video streaming security analyst. Analyze these CTA-5007-B token session metrics from CloudFront real-time logs and identify sessions that should be revoked due to unauthorized sharing or abuse.\n\nEach session represents a unique CTA token being used to access protected video content through CloudFront.\n\n## Indicators of Token Sharing / Abuse\n- Multiple distinct IP addresses using the same token (strongest signal)\n- Requests from multiple countries with the same token\n- Multiple different User-Agent strings (different devices/browsers)\n- Abnormally high request rates (automated scraping)\n- High error rates combined with high request volume (brute force)\n\n## Indicators of Legitimate Use\n- Single IP, single country, single User-Agent = normal viewer\n- Moderate request rates (1-5 requests/sec is normal for adaptive streaming)\n- IP changes within the same country could be mobile network handoff (less suspicious)\n\n## Instructions\nRespond with ONLY a JSON array of session keys that should be revoked. If no sessions should be revoked, respond with an empty array [].\nBe conservative — only revoke sessions with strong evidence of sharing or abuse.",
        });
        // Pass SSM param name to the analyzer Lambda
        analyzer.addEnvironment("PROMPT_PARAM", promptParam.parameterName);
        promptParam.grantRead(analyzer);
        // Prompt management API
        const promptManager = new aws_cdk_lib_1.aws_lambda.Function(this, "PromptManager", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "prompt_manager.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { PROMPT_PARAM: promptParam.parameterName },
        });
        promptParam.grantRead(promptManager);
        promptParam.grantWrite(promptManager);
        const promptApi = new aws_cdk_lib_1.aws_apigateway.RestApi(this, "PromptAPI", {
            restApiName: "CTA Prompt API",
            defaultCorsPreflightOptions: {
                allowOrigins: aws_cdk_lib_1.aws_apigateway.Cors.ALL_ORIGINS,
                allowMethods: aws_cdk_lib_1.aws_apigateway.Cors.ALL_METHODS,
            },
        });
        const promptResource = promptApi.root.addResource("prompt");
        promptResource.addMethod("GET", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(promptManager));
        promptResource.addMethod("PUT", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(promptManager));
        new aws_cdk_lib_1.CfnOutput(this, "PromptAPIEndpoint", {
            value: promptApi.url.replace(/\/$/, ''),
            description: "Prompt management API endpoint",
        });
        // Deploy prompt-config.js so the dashboard can find the prompt API
        if (props.demoBucket) {
            new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, "DeployPromptConfig", {
                sources: [aws_cdk_lib_1.aws_s3_deployment.Source.data("prompt-config.js", `window.PROMPT_CONFIG={apiEndpoint:"${promptApi.url.replace(/\/$/, '')}"};`)],
                destinationBucket: props.demoBucket,
                destinationKeyPrefix: "website",
                prune: false,
            });
        }
    }
}
exports.AutoRevocationStack = AutoRevocationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1yZXZvY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0by1yZXZvY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7OztHQVVHOzs7QUFFSCw2Q0FjcUI7QUFXckIsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQUU1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDNUIsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUM1RCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxzQkFBc0IsQ0FBQztRQUVyRSx5RUFBeUU7UUFDekUsTUFBTSxRQUFRLEdBQUcsSUFBSSx3QkFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDNUQsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLDBCQUEwQjtZQUNuQyxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztZQUNyQyxPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzVCLFVBQVUsRUFBRSxHQUFHO1lBQ2YsV0FBVyxFQUFFO2dCQUNYLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLGdCQUFnQjtnQkFDdkMsY0FBYyxFQUFFLGFBQWE7Z0JBQzdCLGFBQWEsRUFBRSxZQUFZO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxzQ0FBWSxDQUFD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QztTQUM5QyxDQUFDLENBQUM7UUFFSCxtRUFBbUU7UUFDbkUsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsSUFBSSwrQkFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtnQkFDeEQsT0FBTyxFQUFFLENBQUMsK0JBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUMvQyxzQ0FBc0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxLQUFLLENBQzNFLENBQUM7Z0JBQ0YsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLFVBQVU7Z0JBQ25DLG9CQUFvQixFQUFFLFNBQVM7Z0JBQy9CLEtBQUssRUFBRSxLQUFLO2FBQ2IsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7Q0FDRjtBQTVGRCxrREE0RkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENUQSBBdXRvLVJldm9jYXRpb24gU3RhY2sgKG9wdGlvbmFsKVxuICpcbiAqIEFkZHMgQUktcG93ZXJlZCBzZXNzaW9uIGFuYWx5c2lzIHRvIHRoZSByZWFsLXRpbWUgbG9nIHBpcGVsaW5lLlxuICogQ29uc3VtZXMgdGhlIEtpbmVzaXMgc3RyZWFtIGNyZWF0ZWQgYnkgdGhlIG1haW4gc3RhY2ssIGFuYWx5emVzXG4gKiBzZXNzaW9uIHBhdHRlcm5zIHdpdGggQmVkcm9jayBOb3ZhIFBybywgYW5kIHJldm9rZXMgc3VzcGljaW91c1xuICogc2Vzc2lvbnMgaW4gQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlLlxuICpcbiAqIFRoZSBtYWluIHN0YWNrIGhhbmRsZXM6IEtpbmVzaXMgc3RyZWFtLCBSZWFsdGltZUxvZ0NvbmZpZywgZGFzaGJvYXJkLlxuICogVGhpcyBzdGFjayBhZGRzOiBMYW1iZGEgY29uc3VtZXIgKyBCZWRyb2NrIGFuYWx5c2lzLlxuICovXG5cbmltcG9ydCB7XG4gIFN0YWNrLFxuICBTdGFja1Byb3BzLFxuICBEdXJhdGlvbixcbiAgQ2ZuT3V0cHV0LFxuICBhd3Nfa2luZXNpcyBhcyBraW5lc2lzLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2xhbWJkYV9ldmVudF9zb3VyY2VzIGFzIGV2ZW50c291cmNlcyxcbiAgYXdzX2Nsb3VkZnJvbnQgYXMgY2xvdWRmcm9udCxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19zc20gYXMgc3NtLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19zM19kZXBsb3ltZW50IGFzIHMzZGVwbG95LFxuICBhd3NfYXBpZ2F0ZXdheSBhcyBhcGlnYXRld2F5LFxufSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBBdXRvUmV2b2NhdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkga3ZTdG9yZTogY2xvdWRmcm9udC5LZXlWYWx1ZVN0b3JlO1xuICByZWFkb25seSBsb2dTdHJlYW06IGtpbmVzaXMuU3RyZWFtO1xuICByZWFkb25seSBkZW1vQnVja2V0PzogczMuSUJ1Y2tldDtcbiAgcmVhZG9ubHkgY29uZmlnOiBhbnk7XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRvUmV2b2NhdGlvblN0YWNrIGV4dGVuZHMgU3RhY2sge1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRvUmV2b2NhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLmNvbmZpZztcbiAgICBjb25zdCBiZWRyb2NrUmVnaW9uID0gY29uZmlnLmJlZHJvY2s/LnJlZ2lvbiB8fCB0aGlzLnJlZ2lvbjtcbiAgICBjb25zdCBiZWRyb2NrTW9kZWwgPSBjb25maWcuYmVkcm9jaz8ubW9kZWwgfHwgXCJhbWF6b24ubm92YS1wcm8tdjE6MFwiO1xuXG4gICAgLy8gS2luZXNpcyBzdHJlYW0gcHJvY2Vzc29yIOKAlCBhZ2dyZWdhdGVzIHNlc3Npb25zLCBjYWxscyBCZWRyb2NrLCByZXZva2VzXG4gICAgY29uc3QgYW5hbHl6ZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiS2luZXNpc0FuYWx5emVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJraW5lc2lzX2FuYWx5emVyLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBLVlNfQVJOOiBwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4sXG4gICAgICAgIEJFRFJPQ0tfUkVHSU9OOiBiZWRyb2NrUmVnaW9uLFxuICAgICAgICBCRURST0NLX01PREVMOiBiZWRyb2NrTW9kZWwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29uc3VtZSB0aGUgS2luZXNpcyBzdHJlYW0gZnJvbSB0aGUgbWFpbiBzdGFja1xuICAgIGFuYWx5emVyLmFkZEV2ZW50U291cmNlKG5ldyBldmVudHNvdXJjZXMuS2luZXNpc0V2ZW50U291cmNlKHByb3BzLmxvZ1N0cmVhbSwge1xuICAgICAgc3RhcnRpbmdQb3NpdGlvbjogbGFtYmRhLlN0YXJ0aW5nUG9zaXRpb24uTEFURVNULFxuICAgICAgYmF0Y2hTaXplOiA1MDAsXG4gICAgICBtYXhCYXRjaGluZ1dpbmRvdzogRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICByZXRyeUF0dGVtcHRzOiAyLFxuICAgIH0pKTtcblxuICAgIC8vIEJlZHJvY2sgcGVybWlzc2lvbnNcbiAgICBhbmFseXplci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiYmVkcm9jazpJbnZva2VNb2RlbFwiXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmJlZHJvY2s6JHtiZWRyb2NrUmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8ke2JlZHJvY2tNb2RlbH1gXSxcbiAgICB9KSk7XG5cbiAgICAvLyBLVlMgcGVybWlzc2lvbnMgZm9yIHdyaXRpbmcgcmV2b2NhdGlvbnNcbiAgICBhbmFseXplci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOlB1dEtleVwiLCBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZXNjcmliZUtleVZhbHVlU3RvcmVcIl0sXG4gICAgICByZXNvdXJjZXM6IFtwcm9wcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIC0tLSBFZGl0YWJsZSBCZWRyb2NrIFByb21wdCB2aWEgU1NNIFBhcmFtZXRlciBTdG9yZSAtLS1cbiAgICBjb25zdCBwcm9tcHRQYXJhbSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIFwiQmVkcm9ja1Byb21wdFwiLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgLyR7dGhpcy5zdGFja05hbWV9L2JlZHJvY2stcHJvbXB0YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBcIllvdSBhcmUgYSB2aWRlbyBzdHJlYW1pbmcgc2VjdXJpdHkgYW5hbHlzdC4gQW5hbHl6ZSB0aGVzZSBDVEEtNTAwNy1CIHRva2VuIHNlc3Npb24gbWV0cmljcyBmcm9tIENsb3VkRnJvbnQgcmVhbC10aW1lIGxvZ3MgYW5kIGlkZW50aWZ5IHNlc3Npb25zIHRoYXQgc2hvdWxkIGJlIHJldm9rZWQgZHVlIHRvIHVuYXV0aG9yaXplZCBzaGFyaW5nIG9yIGFidXNlLlxcblxcbkVhY2ggc2Vzc2lvbiByZXByZXNlbnRzIGEgdW5pcXVlIENUQSB0b2tlbiBiZWluZyB1c2VkIHRvIGFjY2VzcyBwcm90ZWN0ZWQgdmlkZW8gY29udGVudCB0aHJvdWdoIENsb3VkRnJvbnQuXFxuXFxuIyMgSW5kaWNhdG9ycyBvZiBUb2tlbiBTaGFyaW5nIC8gQWJ1c2VcXG4tIE11bHRpcGxlIGRpc3RpbmN0IElQIGFkZHJlc3NlcyB1c2luZyB0aGUgc2FtZSB0b2tlbiAoc3Ryb25nZXN0IHNpZ25hbClcXG4tIFJlcXVlc3RzIGZyb20gbXVsdGlwbGUgY291bnRyaWVzIHdpdGggdGhlIHNhbWUgdG9rZW5cXG4tIE11bHRpcGxlIGRpZmZlcmVudCBVc2VyLUFnZW50IHN0cmluZ3MgKGRpZmZlcmVudCBkZXZpY2VzL2Jyb3dzZXJzKVxcbi0gQWJub3JtYWxseSBoaWdoIHJlcXVlc3QgcmF0ZXMgKGF1dG9tYXRlZCBzY3JhcGluZylcXG4tIEhpZ2ggZXJyb3IgcmF0ZXMgY29tYmluZWQgd2l0aCBoaWdoIHJlcXVlc3Qgdm9sdW1lIChicnV0ZSBmb3JjZSlcXG5cXG4jIyBJbmRpY2F0b3JzIG9mIExlZ2l0aW1hdGUgVXNlXFxuLSBTaW5nbGUgSVAsIHNpbmdsZSBjb3VudHJ5LCBzaW5nbGUgVXNlci1BZ2VudCA9IG5vcm1hbCB2aWV3ZXJcXG4tIE1vZGVyYXRlIHJlcXVlc3QgcmF0ZXMgKDEtNSByZXF1ZXN0cy9zZWMgaXMgbm9ybWFsIGZvciBhZGFwdGl2ZSBzdHJlYW1pbmcpXFxuLSBJUCBjaGFuZ2VzIHdpdGhpbiB0aGUgc2FtZSBjb3VudHJ5IGNvdWxkIGJlIG1vYmlsZSBuZXR3b3JrIGhhbmRvZmYgKGxlc3Mgc3VzcGljaW91cylcXG5cXG4jIyBJbnN0cnVjdGlvbnNcXG5SZXNwb25kIHdpdGggT05MWSBhIEpTT04gYXJyYXkgb2Ygc2Vzc2lvbiBrZXlzIHRoYXQgc2hvdWxkIGJlIHJldm9rZWQuIElmIG5vIHNlc3Npb25zIHNob3VsZCBiZSByZXZva2VkLCByZXNwb25kIHdpdGggYW4gZW1wdHkgYXJyYXkgW10uXFxuQmUgY29uc2VydmF0aXZlIOKAlCBvbmx5IHJldm9rZSBzZXNzaW9ucyB3aXRoIHN0cm9uZyBldmlkZW5jZSBvZiBzaGFyaW5nIG9yIGFidXNlLlwiLFxuICAgIH0pO1xuXG4gICAgLy8gUGFzcyBTU00gcGFyYW0gbmFtZSB0byB0aGUgYW5hbHl6ZXIgTGFtYmRhXG4gICAgYW5hbHl6ZXIuYWRkRW52aXJvbm1lbnQoXCJQUk9NUFRfUEFSQU1cIiwgcHJvbXB0UGFyYW0ucGFyYW1ldGVyTmFtZSk7XG4gICAgcHJvbXB0UGFyYW0uZ3JhbnRSZWFkKGFuYWx5emVyKTtcblxuICAgIC8vIFByb21wdCBtYW5hZ2VtZW50IEFQSVxuICAgIGNvbnN0IHByb21wdE1hbmFnZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiUHJvbXB0TWFuYWdlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwicHJvbXB0X21hbmFnZXIuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBQUk9NUFRfUEFSQU06IHByb21wdFBhcmFtLnBhcmFtZXRlck5hbWUgfSxcbiAgICB9KTtcbiAgICBwcm9tcHRQYXJhbS5ncmFudFJlYWQocHJvbXB0TWFuYWdlcik7XG4gICAgcHJvbXB0UGFyYW0uZ3JhbnRXcml0ZShwcm9tcHRNYW5hZ2VyKTtcblxuICAgIGNvbnN0IHByb21wdEFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJQcm9tcHRBUElcIiwge1xuICAgICAgcmVzdEFwaU5hbWU6IFwiQ1RBIFByb21wdCBBUElcIixcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGNvbnN0IHByb21wdFJlc291cmNlID0gcHJvbXB0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJwcm9tcHRcIik7XG4gICAgcHJvbXB0UmVzb3VyY2UuYWRkTWV0aG9kKFwiR0VUXCIsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb21wdE1hbmFnZXIpKTtcbiAgICBwcm9tcHRSZXNvdXJjZS5hZGRNZXRob2QoXCJQVVRcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvbXB0TWFuYWdlcikpO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlByb21wdEFQSUVuZHBvaW50XCIsIHtcbiAgICAgIHZhbHVlOiBwcm9tcHRBcGkudXJsLnJlcGxhY2UoL1xcLyQvLCAnJyksXG4gICAgICBkZXNjcmlwdGlvbjogXCJQcm9tcHQgbWFuYWdlbWVudCBBUEkgZW5kcG9pbnRcIixcbiAgICB9KTtcblxuICAgIC8vIERlcGxveSBwcm9tcHQtY29uZmlnLmpzIHNvIHRoZSBkYXNoYm9hcmQgY2FuIGZpbmQgdGhlIHByb21wdCBBUElcbiAgICBpZiAocHJvcHMuZGVtb0J1Y2tldCkge1xuICAgICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lQcm9tcHRDb25maWdcIiwge1xuICAgICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmRhdGEoXCJwcm9tcHQtY29uZmlnLmpzXCIsXG4gICAgICAgICAgYHdpbmRvdy5QUk9NUFRfQ09ORklHPXthcGlFbmRwb2ludDpcIiR7cHJvbXB0QXBpLnVybC5yZXBsYWNlKC9cXC8kLywnJyl9XCJ9O2BcbiAgICAgICAgKV0sXG4gICAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBwcm9wcy5kZW1vQnVja2V0LFxuICAgICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogXCJ3ZWJzaXRlXCIsXG4gICAgICAgIHBydW5lOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuIl19