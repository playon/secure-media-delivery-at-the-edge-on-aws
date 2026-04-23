"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CTASecureMediaStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cloudfront_origins_1 = require("aws-cdk-lib/aws-cloudfront-origins");
class CTASecureMediaStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        const enableDemo = new aws_cdk_lib_1.CfnParameter(this, "EnableDemo", {
            type: "String",
            default: "true",
            allowedValues: ["true", "false"],
            description: "Deploy demo website",
        });
        const bedrockModel = new aws_cdk_lib_1.CfnParameter(this, "BedrockModel", {
            type: "String",
            default: "amazon.nova-pro-v1:0",
            allowedValues: ["amazon.nova-pro-v1:0", "amazon.nova-lite-v1:0"],
            description: "Bedrock model for AI analysis",
        });
        const config = props.config || {
            main: {
                enableDemo: enableDemo.valueAsString === "true",
            },
            bedrock: {
                model: bedrockModel.valueAsString,
            }
        };
        // CTA signing key
        const signingSecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, "CTAKey", {
            generateSecretString: {
                secretStringTemplate: '{"algorithm":"HMAC-SHA256"}',
                generateStringKey: "signingKey",
                passwordLength: 64,
            },
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        // CloudFront KeyValueStore for revocation
        this.kvStore = new aws_cdk_lib_1.aws_cloudfront.KeyValueStore(this, "CTARevocationStore", {
            comment: "CTA token revocation list",
        });
        // CTA validator function
        const validator = new aws_cdk_lib_1.aws_cloudfront.Function(this, "CTAValidator", {
            code: aws_cdk_lib_1.aws_cloudfront.FunctionCode.fromFile({ filePath: "lambda/cta_token_validator.js" }),
            functionName: `${aws_cdk_lib_1.Aws.STACK_NAME}-CTA-Validator`,
            runtime: aws_cdk_lib_1.aws_cloudfront.FunctionRuntime.JS_2_0,
            keyValueStore: this.kvStore,
        });
        // Token generator (Node SDK)
        const generator = new aws_cdk_lib_1.aws_lambda.Function(this, "CTAGenerator", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "cta_token_generator.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { SECRET_NAME: signingSecret.secretName },
        });
        // Token generator (Python SDK)
        const generatorPython = new aws_cdk_lib_1.aws_lambda.Function(this, "CTAGeneratorPython", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_13,
            handler: "handler.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda-python"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { SECRET_NAME: signingSecret.secretName },
        });
        // Token generator (Ruby SDK)
        const generatorRuby = new aws_cdk_lib_1.aws_lambda.Function(this, "CTAGeneratorRuby", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.RUBY_3_3,
            handler: "handler.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda-ruby"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { SECRET_NAME: signingSecret.secretName },
        });
        // Token revocation handler
        const revoker = new aws_cdk_lib_1.aws_lambda.Function(this, "CTARevoker", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "cta_revocation.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { KVS_ARN: this.kvStore.keyValueStoreArn },
        });
        signingSecret.grantRead(generator);
        signingSecret.grantRead(generatorPython);
        signingSecret.grantRead(generatorRuby);
        // Grant KVS update permission via IAM policy
        revoker.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["cloudfront-keyvaluestore:PutKey", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
            resources: [this.kvStore.keyValueStoreArn],
        }));
        // --- Key sync Lambda (custom resource + rotation) ---
        const syncKeysToKvs = new aws_cdk_lib_1.aws_lambda.Function(this, "SyncKeysToKvs", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "index.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/sync_keys"),
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            environment: {
                SECRET_NAME: signingSecret.secretName,
                KVS_ARN: this.kvStore.keyValueStoreArn,
            },
        });
        signingSecret.grantRead(syncKeysToKvs);
        signingSecret.grantWrite(syncKeysToKvs);
        syncKeysToKvs.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: [
                "cloudfront-keyvaluestore:PutKey",
                "cloudfront-keyvaluestore:DescribeKeyValueStore",
            ],
            resources: [this.kvStore.keyValueStoreArn],
        }));
        // Custom resource: sync key to KVS on deploy
        const keySyncProvider = new aws_cdk_lib_1.custom_resources.Provider(this, "KeySyncProvider", {
            onEventHandler: syncKeysToKvs,
        });
        new aws_cdk_lib_1.CustomResource(this, "KeySyncResource", {
            serviceToken: keySyncProvider.serviceToken,
            properties: {
                // Force update on each deploy to ensure key is synced
                Timestamp: Date.now().toString(),
            },
        });
        // --- Key rotation workflow ---
        const rotateKeyTask = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "RotateSigningKey", {
            lambdaFunction: syncKeysToKvs,
            payload: aws_cdk_lib_1.aws_stepfunctions.TaskInput.fromObject({ rotate: true }),
            resultPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.DISCARD,
        });
        const rotationWorkflow = new aws_cdk_lib_1.aws_stepfunctions.StateMachine(this, "KeyRotationWorkflow", {
            stateMachineName: `${aws_cdk_lib_1.Aws.STACK_NAME}_RotateKeys`,
            definitionBody: aws_cdk_lib_1.aws_stepfunctions.DefinitionBody.fromChainable(rotateKeyTask),
            timeout: aws_cdk_lib_1.Duration.minutes(5),
        });
        // Rotate keys monthly by default
        const rotationSchedule = config.main.rotationFrequency || "30d";
        const rotationRate = this.parseRotationRate(rotationSchedule);
        new aws_cdk_lib_1.aws_events.Rule(this, "KeyRotationSchedule", {
            schedule: aws_cdk_lib_1.aws_events.Schedule.rate(rotationRate),
            targets: [new aws_cdk_lib_1.aws_events_targets.SfnStateMachine(rotationWorkflow)],
        });
        // API Gateway
        const api = new aws_cdk_lib_1.aws_apigateway.RestApi(this, "CTAAPI", {
            restApiName: "CTA Token API",
            defaultCorsPreflightOptions: {
                allowOrigins: aws_cdk_lib_1.aws_apigateway.Cors.ALL_ORIGINS,
                allowMethods: aws_cdk_lib_1.aws_apigateway.Cors.ALL_METHODS,
            },
        });
        const tokenResource = api.root.addResource("token");
        tokenResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generator));
        const tokenPythonResource = api.root.addResource("token-python");
        tokenPythonResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generatorPython));
        const tokenRubyResource = api.root.addResource("token-ruby");
        tokenRubyResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generatorRuby));
        const revokeResource = api.root.addResource("revoke");
        revokeResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(revoker));
        // Demo website (conditional)
        let distribution;
        let demoBucket;
        if (config.main.enableDemo) {
            demoBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, "DemoWebsite", {
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
            });
            new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, "DeployDemoSite", {
                sources: [aws_cdk_lib_1.aws_s3_deployment.Source.asset("resources/demo-website")],
                destinationBucket: demoBucket,
                destinationKeyPrefix: "website",
            });
            distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, "CTADistribution", {
                defaultBehavior: {
                    origin: new aws_cloudfront_origins_1.HttpOrigin("cdn.mediaplaypen.com"),
                    viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: new aws_cdk_lib_1.aws_cloudfront.CachePolicy(this, "CTACachePolicy", {
                        headerBehavior: aws_cdk_lib_1.aws_cloudfront.CacheHeaderBehavior.allowList("CloudFront-Viewer-Country"),
                    }),
                    originRequestPolicy: aws_cdk_lib_1.aws_cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                    functionAssociations: [{
                            function: validator,
                            eventType: aws_cdk_lib_1.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
                        }],
                },
                additionalBehaviors: {
                    "/api/*": {
                        origin: new aws_cloudfront_origins_1.RestApiOrigin(api),
                        viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: aws_cdk_lib_1.aws_cloudfront.CachePolicy.CACHING_DISABLED,
                        originRequestPolicy: aws_cdk_lib_1.aws_cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                    },
                    "/website/*": {
                        origin: aws_cloudfront_origins_1.S3BucketOrigin.withOriginAccessControl(demoBucket),
                    },
                },
            });
            // Deploy config.js — only deployment-specific values (domain, API endpoint)
            // Stream paths are hardcoded in index.html since they don't change per stack
            new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, "DeployDemoConfig", {
                sources: [aws_cdk_lib_1.aws_s3_deployment.Source.data("config.js", `window.CTA_CONFIG={apiEndpoint:"${api.url.replace(/\/$/, '')}",cdnDomain:"https://${distribution.distributionDomainName}"};`)],
                destinationBucket: demoBucket,
                destinationKeyPrefix: "website",
                prune: false,
            });
        }
        else {
            distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, "CTADistribution", {
                defaultBehavior: {
                    origin: new aws_cloudfront_origins_1.RestApiOrigin(api),
                    functionAssociations: [{
                            function: validator,
                            eventType: aws_cdk_lib_1.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
                        }],
                },
            });
        }
        this.distribution = distribution;
        if (config.main.enableDemo) {
            this.demoBucket = demoBucket;
        }
        // --- Real-Time Logging via Kinesis ---
        const logStream = new aws_cdk_lib_1.aws_kinesis.Stream(this, "RealtimeLogStream", {
            shardCount: 1,
            retentionPeriod: aws_cdk_lib_1.Duration.hours(24),
        });
        this.logStream = logStream;
        const cfKinesisRole = new aws_cdk_lib_1.aws_iam.Role(this, "CloudFrontKinesisRole", {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal("cloudfront.amazonaws.com"),
        });
        logStream.grantWrite(cfKinesisRole);
        const realtimeLogConfig = new aws_cdk_lib_1.aws_cloudfront.CfnRealtimeLogConfig(this, "RealtimeLogConfig", {
            name: `${aws_cdk_lib_1.Aws.STACK_NAME}-realtime-logs`,
            samplingRate: 100,
            endPoints: [{
                    streamType: "Kinesis",
                    kinesisStreamConfig: {
                        roleArn: cfKinesisRole.roleArn,
                        streamArn: logStream.streamArn,
                    },
                }],
            fields: [
                "timestamp", "c-ip", "sc-status", "cs-uri-stem", "cs-method",
                "cs-host", "cs-user-agent", "sc-bytes", "time-taken", "c-country",
            ],
        });
        // Attach real-time logs to the default cache behavior
        const cfnDist = distribution.node.defaultChild;
        cfnDist.addPropertyOverride("DistributionConfig.DefaultCacheBehavior.RealtimeLogConfigArn", realtimeLogConfig.attrArn);
        // --- Dashboard: list revoked sessions from KVS ---
        const listRevoked = new aws_cdk_lib_1.aws_lambda.Function(this, "ListRevoked", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "list_revoked.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            environment: { KVS_ARN: this.kvStore.keyValueStoreArn },
        });
        listRevoked.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            actions: ["cloudfront-keyvaluestore:ListKeys", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
            resources: [this.kvStore.keyValueStoreArn],
        }));
        // Add /revoked to the existing API
        api.root.addResource("revoked").addMethod("GET", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(listRevoked));
        // Deploy dashboard HTML (alongside demo site if enabled)
        if (config.main.enableDemo) {
            new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, "DeployDashboard", {
                sources: [aws_cdk_lib_1.aws_s3_deployment.Source.asset("resources/dashboard")],
                destinationBucket: demoBucket,
                destinationKeyPrefix: "website",
                prune: false,
            });
        }
        // Outputs
        new aws_cdk_lib_1.CfnOutput(this, "APIEndpoint", {
            value: `https://${distribution.distributionDomainName}/api`,
            description: "CTA API Endpoint"
        });
        if (config.main.enableDemo) {
            new aws_cdk_lib_1.CfnOutput(this, "DemoWebsiteUrl", {
                value: `https://${distribution.distributionDomainName}/website/index.html`,
                description: "CTA Demo Website URL"
            });
        }
        new aws_cdk_lib_1.CfnOutput(this, "KeyValueStoreId", {
            value: this.kvStore.keyValueStoreId,
            description: "CloudFront KeyValueStore ID"
        });
        new aws_cdk_lib_1.CfnOutput(this, "SecretArn", {
            value: signingSecret.secretArn,
            description: "CTA signing secret ARN"
        });
        new aws_cdk_lib_1.CfnOutput(this, "CTAStandard", {
            value: "CTA-5007-B",
            description: "Implemented standard version"
        });
        new aws_cdk_lib_1.CfnOutput(this, "RotationWorkflow", {
            value: rotationWorkflow.stateMachineName,
            description: "Key rotation Step Functions workflow"
        });
    }
    parseRotationRate(rate) {
        const match = rate.match(/^(\d+)([mhd])$/);
        if (!match)
            return aws_cdk_lib_1.Duration.days(30);
        const value = parseInt(match[1]);
        switch (match[2]) {
            case 'm': return aws_cdk_lib_1.Duration.minutes(value);
            case 'h': return aws_cdk_lib_1.Duration.hours(value);
            case 'd': return aws_cdk_lib_1.Duration.days(value);
            default: return aws_cdk_lib_1.Duration.days(30);
        }
    }
}
exports.CTASecureMediaStack = CTASecureMediaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3RhLXNlY3VyZS1tZWRpYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImN0YS1zZWN1cmUtbWVkaWEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBc0JxQjtBQUVyQiwrRUFBK0Y7QUFPL0YsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQU01QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLFFBQWtDLEVBQUU7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxVQUFVLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDdEQsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsTUFBTTtZQUNmLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUM7WUFDaEMsV0FBVyxFQUFFLHFCQUFxQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLDBCQUFZLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUMxRCxJQUFJLEVBQUUsUUFBUTtZQUNkLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IsYUFBYSxFQUFFLENBQUMsc0JBQXNCLEVBQUUsdUJBQXVCLENBQUM7WUFDaEUsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxJQUFJO1lBQzdCLElBQUksRUFBRTtnQkFDSixVQUFVLEVBQUUsVUFBVSxDQUFDLGFBQWEsS0FBSyxNQUFNO2FBQ2hEO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLEtBQUssRUFBRSxZQUFZLENBQUMsYUFBYTthQUNsQztTQUNGLENBQUM7UUFFRixrQkFBa0I7UUFDbEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzlELG9CQUFvQixFQUFF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V0Qsa0RBd1dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgU3RhY2ssXG4gIFN0YWNrUHJvcHMsXG4gIEF3cyxcbiAgUmVtb3ZhbFBvbGljeSxcbiAgRHVyYXRpb24sXG4gIENmbk91dHB1dCxcbiAgQ2ZuUGFyYW1ldGVyLFxuICBDdXN0b21SZXNvdXJjZSxcbiAgYXdzX2Nsb3VkZnJvbnQgYXMgY2xvdWRmcm9udCxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19hcGlnYXRld2F5IGFzIGFwaWdhdGV3YXksXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfczNfZGVwbG95bWVudCBhcyBzM2RlcGxveSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19zdGVwZnVuY3Rpb25zIGFzIHNmbixcbiAgYXdzX3N0ZXBmdW5jdGlvbnNfdGFza3MgYXMgdGFza3MsXG4gIGF3c19ldmVudHMgYXMgZXZlbnRzLFxuICBhd3NfZXZlbnRzX3RhcmdldHMgYXMgdGFyZ2V0cyxcbiAgYXdzX2tpbmVzaXMgYXMga2luZXNpcyxcbiAgY3VzdG9tX3Jlc291cmNlcyxcbn0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5cbmltcG9ydCB7IEh0dHBPcmlnaW4sIFJlc3RBcGlPcmlnaW4sIFMzQnVja2V0T3JpZ2luIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ1RBU2VjdXJlTWVkaWFTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGNvbmZpZz86IGFueTtcbn1cblxuZXhwb3J0IGNsYXNzIENUQVNlY3VyZU1lZGlhU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBrdlN0b3JlOiBjbG91ZGZyb250LktleVZhbHVlU3RvcmU7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZGVtb0J1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nU3RyZWFtOiBraW5lc2lzLlN0cmVhbTtcbiAgXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBDVEFTZWN1cmVNZWRpYVN0YWNrUHJvcHMgPSB7fSkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZW5hYmxlRGVtbyA9IG5ldyBDZm5QYXJhbWV0ZXIodGhpcywgXCJFbmFibGVEZW1vXCIsIHtcbiAgICAgIHR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICBkZWZhdWx0OiBcInRydWVcIixcbiAgICAgIGFsbG93ZWRWYWx1ZXM6IFtcInRydWVcIiwgXCJmYWxzZVwiXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkRlcGxveSBkZW1vIHdlYnNpdGVcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJlZHJvY2tNb2RlbCA9IG5ldyBDZm5QYXJhbWV0ZXIodGhpcywgXCJCZWRyb2NrTW9kZWxcIiwge1xuICAgICAgdHlwZTogXCJTdHJpbmdcIixcbiAgICAgIGRlZmF1bHQ6IFwiYW1hem9uLm5vdmEtcHJvLXYxOjBcIixcbiAgICAgIGFsbG93ZWRWYWx1ZXM6IFtcImFtYXpvbi5ub3ZhLXByby12MTowXCIsIFwiYW1hem9uLm5vdmEtbGl0ZS12MTowXCJdLFxuICAgICAgZGVzY3JpcHRpb246IFwiQmVkcm9jayBtb2RlbCBmb3IgQUkgYW5hbHlzaXNcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLmNvbmZpZyB8fCB7XG4gICAgICBtYWluOiB7XG4gICAgICAgIGVuYWJsZURlbW86IGVuYWJsZURlbW8udmFsdWVBc1N0cmluZyA9PT0gXCJ0cnVlXCIsXG4gICAgICB9LFxuICAgICAgYmVkcm9jazoge1xuICAgICAgICBtb2RlbDogYmVkcm9ja01vZGVsLnZhbHVlQXNTdHJpbmcsXG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIENUQSBzaWduaW5nIGtleVxuICAgIGNvbnN0IHNpZ25pbmdTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsIFwiQ1RBS2V5XCIsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiAne1wiYWxnb3JpdGhtXCI6XCJITUFDLVNIQTI1NlwifScsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiBcInNpZ25pbmdLZXlcIixcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgS2V5VmFsdWVTdG9yZSBmb3IgcmV2b2NhdGlvblxuICAgIHRoaXMua3ZTdG9yZSA9IG5ldyBjbG91ZGZyb250LktleVZhbHVlU3RvcmUodGhpcywgXCJDVEFSZXZvY2F0aW9uU3RvcmVcIiwge1xuICAgICAgY29tbWVudDogXCJDVEEgdG9rZW4gcmV2b2NhdGlvbiBsaXN0XCIsXG4gICAgfSk7XG5cbiAgICAvLyBDVEEgdmFsaWRhdG9yIGZ1bmN0aW9uXG4gICAgY29uc3QgdmFsaWRhdG9yID0gbmV3IGNsb3VkZnJvbnQuRnVuY3Rpb24odGhpcywgXCJDVEFWYWxpZGF0b3JcIiwge1xuICAgICAgY29kZTogY2xvdWRmcm9udC5GdW5jdGlvbkNvZGUuZnJvbUZpbGUoeyBmaWxlUGF0aDogXCJsYW1iZGEvY3RhX3Rva2VuX3ZhbGlkYXRvci5qc1wiIH0pLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtBd3MuU1RBQ0tfTkFNRX0tQ1RBLVZhbGlkYXRvcmAsXG4gICAgICBydW50aW1lOiBjbG91ZGZyb250LkZ1bmN0aW9uUnVudGltZS5KU18yXzAsXG4gICAgICBrZXlWYWx1ZVN0b3JlOiB0aGlzLmt2U3RvcmUsXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKE5vZGUgU0RLKVxuICAgIGNvbnN0IGdlbmVyYXRvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFHZW5lcmF0b3JcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImN0YV90b2tlbl9nZW5lcmF0b3IuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFB5dGhvbiBTREspXG4gICAgY29uc3QgZ2VuZXJhdG9yUHl0aG9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkNUQUdlbmVyYXRvclB5dGhvblwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcHl0aG9uXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFJ1YnkgU0RLKVxuICAgIGNvbnN0IGdlbmVyYXRvclJ1YnkgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQ1RBR2VuZXJhdG9yUnVieVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5SVUJZXzNfMyxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcnVieVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgU0VDUkVUX05BTUU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSB9LFxuICAgIH0pO1xuXG4gICAgLy8gVG9rZW4gcmV2b2NhdGlvbiBoYW5kbGVyXG4gICAgY29uc3QgcmV2b2tlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFSZXZva2VyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJjdGFfcmV2b2NhdGlvbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7IEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuIH0sXG4gICAgfSk7XG5cbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChnZW5lcmF0b3IpO1xuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKGdlbmVyYXRvclB5dGhvbik7XG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFJlYWQoZ2VuZXJhdG9yUnVieSk7XG5cbiAgICAvLyBHcmFudCBLVlMgdXBkYXRlIHBlcm1pc3Npb24gdmlhIElBTSBwb2xpY3lcbiAgICByZXZva2VyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6UHV0S2V5XCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3RoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyAtLS0gS2V5IHN5bmMgTGFtYmRhIChjdXN0b20gcmVzb3VyY2UgKyByb3RhdGlvbikgLS0tXG4gICAgY29uc3Qgc3luY0tleXNUb0t2cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJTeW5jS2V5c1RvS3ZzXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEvc3luY19rZXlzXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICBLVlNfQVJOOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChzeW5jS2V5c1RvS3ZzKTtcbiAgICBzaWduaW5nU2VjcmV0LmdyYW50V3JpdGUoc3luY0tleXNUb0t2cyk7XG4gICAgc3luY0tleXNUb0t2cy5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpQdXRLZXlcIixcbiAgICAgICAgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCIsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZTogc3luYyBrZXkgdG8gS1ZTIG9uIGRlcGxveVxuICAgIGNvbnN0IGtleVN5bmNQcm92aWRlciA9IG5ldyBjdXN0b21fcmVzb3VyY2VzLlByb3ZpZGVyKHRoaXMsIFwiS2V5U3luY1Byb3ZpZGVyXCIsIHtcbiAgICAgIG9uRXZlbnRIYW5kbGVyOiBzeW5jS2V5c1RvS3ZzLFxuICAgIH0pO1xuXG4gICAgbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsIFwiS2V5U3luY1Jlc291cmNlXCIsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjoga2V5U3luY1Byb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9uIGVhY2ggZGVwbG95IHRvIGVuc3VyZSBrZXkgaXMgc3luY2VkXG4gICAgICAgIFRpbWVzdGFtcDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIC0tLSBLZXkgcm90YXRpb24gd29ya2Zsb3cgLS0tXG4gICAgY29uc3Qgcm90YXRlS2V5VGFzayA9IG5ldyB0YXNrcy5MYW1iZGFJbnZva2UodGhpcywgXCJSb3RhdGVTaWduaW5nS2V5XCIsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiBzeW5jS2V5c1RvS3ZzLFxuICAgICAgcGF5bG9hZDogc2ZuLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHsgcm90YXRlOiB0cnVlIH0pLFxuICAgICAgcmVzdWx0UGF0aDogc2ZuLkpzb25QYXRoLkRJU0NBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByb3RhdGlvbldvcmtmbG93ID0gbmV3IHNmbi5TdGF0ZU1hY2hpbmUodGhpcywgXCJLZXlSb3RhdGlvbldvcmtmbG93XCIsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6IGAke0F3cy5TVEFDS19OQU1FfV9Sb3RhdGVLZXlzYCxcbiAgICAgIGRlZmluaXRpb25Cb2R5OiBzZm4uRGVmaW5pdGlvbkJvZHkuZnJvbUNoYWluYWJsZShyb3RhdGVLZXlUYXNrKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICAvLyBSb3RhdGUga2V5cyBtb250aGx5IGJ5IGRlZmF1bHRcbiAgICBjb25zdCByb3RhdGlvblNjaGVkdWxlID0gY29uZmlnLm1haW4ucm90YXRpb25GcmVxdWVuY3kgfHwgXCIzMGRcIjtcbiAgICBjb25zdCByb3RhdGlvblJhdGUgPSB0aGlzLnBhcnNlUm90YXRpb25SYXRlKHJvdGF0aW9uU2NoZWR1bGUpO1xuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCBcIktleVJvdGF0aW9uU2NoZWR1bGVcIiwge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKHJvdGF0aW9uUmF0ZSksXG4gICAgICB0YXJnZXRzOiBbbmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHJvdGF0aW9uV29ya2Zsb3cpXSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcIkNUQUFQSVwiLCB7XG4gICAgICByZXN0QXBpTmFtZTogXCJDVEEgVG9rZW4gQVBJXCIsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRva2VuUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcInRva2VuXCIpO1xuICAgIHRva2VuUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZW5lcmF0b3IpKTtcblxuICAgIGNvbnN0IHRva2VuUHl0aG9uUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcInRva2VuLXB5dGhvblwiKTtcbiAgICB0b2tlblB5dGhvblJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2VuZXJhdG9yUHl0aG9uKSk7XG5cbiAgICBjb25zdCB0b2tlblJ1YnlSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW4tcnVieVwiKTtcbiAgICB0b2tlblJ1YnlSZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdlbmVyYXRvclJ1YnkpKTtcbiAgICBcbiAgICBjb25zdCByZXZva2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwicmV2b2tlXCIpO1xuICAgIHJldm9rZVJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocmV2b2tlcikpO1xuXG4gICAgLy8gRGVtbyB3ZWJzaXRlIChjb25kaXRpb25hbClcbiAgICBsZXQgZGlzdHJpYnV0aW9uOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbjtcbiAgICBsZXQgZGVtb0J1Y2tldDogczMuQnVja2V0IHwgdW5kZWZpbmVkO1xuICAgIFxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBkZW1vQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRlbW9XZWJzaXRlXCIsIHtcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURlbW9TaXRlXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChcInJlc291cmNlcy9kZW1vLXdlYnNpdGVcIildLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgfSk7XG5cbiAgICAgIGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCBcIkNUQURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IEh0dHBPcmlnaW4oXCJjZG4ubWVkaWFwbGF5cGVuLmNvbVwiKSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBjYWNoZVBvbGljeTogbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgXCJDVEFDYWNoZVBvbGljeVwiLCB7XG4gICAgICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdChcbiAgICAgICAgICAgICAgXCJDbG91ZEZyb250LVZpZXdlci1Db3VudHJ5XCJcbiAgICAgICAgICAgICksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVJfRVhDRVBUX0hPU1RfSEVBREVSLFxuICAgICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbe1xuICAgICAgICAgICAgZnVuY3Rpb246IHZhbGlkYXRvcixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9XSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAgIFwiL2FwaS8qXCI6IHtcbiAgICAgICAgICAgIG9yaWdpbjogbmV3IFJlc3RBcGlPcmlnaW4oYXBpKSxcbiAgICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5BTExfVklFV0VSX0VYQ0VQVF9IT1NUX0hFQURFUixcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiL3dlYnNpdGUvKlwiOiB7XG4gICAgICAgICAgICBvcmlnaW46IFMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKGRlbW9CdWNrZXQpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gRGVwbG95IGNvbmZpZy5qcyDigJQgb25seSBkZXBsb3ltZW50LXNwZWNpZmljIHZhbHVlcyAoZG9tYWluLCBBUEkgZW5kcG9pbnQpXG4gICAgICAvLyBTdHJlYW0gcGF0aHMgYXJlIGhhcmRjb2RlZCBpbiBpbmRleC5odG1sIHNpbmNlIHRoZXkgZG9uJ3QgY2hhbmdlIHBlciBzdGFja1xuICAgICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lEZW1vQ29uZmlnXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5kYXRhKFwiY29uZmlnLmpzXCIsXG4gICAgICAgICAgYHdpbmRvdy5DVEFfQ09ORklHPXthcGlFbmRwb2ludDpcIiR7YXBpLnVybC5yZXBsYWNlKC9cXC8kLywnJyl9XCIsY2RuRG9tYWluOlwiaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfVwifTtgXG4gICAgICAgICldLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgICBwcnVuZTogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiQ1RBRGlzdHJpYnV0aW9uXCIsIHtcbiAgICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgUmVzdEFwaU9yaWdpbihhcGkpLFxuICAgICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbe1xuICAgICAgICAgICAgZnVuY3Rpb246IHZhbGlkYXRvcixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9XSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuZGlzdHJpYnV0aW9uID0gZGlzdHJpYnV0aW9uO1xuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICB0aGlzLmRlbW9CdWNrZXQgPSBkZW1vQnVja2V0ITtcbiAgICB9XG5cbiAgICAvLyAtLS0gUmVhbC1UaW1lIExvZ2dpbmcgdmlhIEtpbmVzaXMgLS0tXG4gICAgY29uc3QgbG9nU3RyZWFtID0gbmV3IGtpbmVzaXMuU3RyZWFtKHRoaXMsIFwiUmVhbHRpbWVMb2dTdHJlYW1cIiwge1xuICAgICAgc2hhcmRDb3VudDogMSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uaG91cnMoMjQpLFxuICAgIH0pO1xuICAgIHRoaXMubG9nU3RyZWFtID0gbG9nU3RyZWFtO1xuXG4gICAgY29uc3QgY2ZLaW5lc2lzUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIkNsb3VkRnJvbnRLaW5lc2lzUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImNsb3VkZnJvbnQuYW1hem9uYXdzLmNvbVwiKSxcbiAgICB9KTtcbiAgICBsb2dTdHJlYW0uZ3JhbnRXcml0ZShjZktpbmVzaXNSb2xlKTtcblxuICAgIGNvbnN0IHJlYWx0aW1lTG9nQ29uZmlnID0gbmV3IGNsb3VkZnJvbnQuQ2ZuUmVhbHRpbWVMb2dDb25maWcodGhpcywgXCJSZWFsdGltZUxvZ0NvbmZpZ1wiLCB7XG4gICAgICBuYW1lOiBgJHtBd3MuU1RBQ0tfTkFNRX0tcmVhbHRpbWUtbG9nc2AsXG4gICAgICBzYW1wbGluZ1JhdGU6IDEwMCxcbiAgICAgIGVuZFBvaW50czogW3tcbiAgICAgICAgc3RyZWFtVHlwZTogXCJLaW5lc2lzXCIsXG4gICAgICAgIGtpbmVzaXNTdHJlYW1Db25maWc6IHtcbiAgICAgICAgICByb2xlQXJuOiBjZktpbmVzaXNSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgc3RyZWFtQXJuOiBsb2dTdHJlYW0uc3RyZWFtQXJuLFxuICAgICAgICB9LFxuICAgICAgfV0sXG4gICAgICBmaWVsZHM6IFtcbiAgICAgICAgXCJ0aW1lc3RhbXBcIiwgXCJjLWlwXCIsIFwic2Mtc3RhdHVzXCIsIFwiY3MtdXJpLXN0ZW1cIiwgXCJjcy1tZXRob2RcIixcbiAgICAgICAgXCJjcy1ob3N0XCIsIFwiY3MtdXNlci1hZ2VudFwiLCBcInNjLWJ5dGVzXCIsIFwidGltZS10YWtlblwiLCBcImMtY291bnRyeVwiLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCByZWFsLXRpbWUgbG9ncyB0byB0aGUgZGVmYXVsdCBjYWNoZSBiZWhhdmlvclxuICAgIGNvbnN0IGNmbkRpc3QgPSBkaXN0cmlidXRpb24ubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY2xvdWRmcm9udC5DZm5EaXN0cmlidXRpb247XG4gICAgY2ZuRGlzdC5hZGRQcm9wZXJ0eU92ZXJyaWRlKFxuICAgICAgXCJEaXN0cmlidXRpb25Db25maWcuRGVmYXVsdENhY2hlQmVoYXZpb3IuUmVhbHRpbWVMb2dDb25maWdBcm5cIixcbiAgICAgIHJlYWx0aW1lTG9nQ29uZmlnLmF0dHJBcm5cbiAgICApO1xuXG4gICAgLy8gLS0tIERhc2hib2FyZDogbGlzdCByZXZva2VkIHNlc3Npb25zIGZyb20gS1ZTIC0tLVxuICAgIGNvbnN0IGxpc3RSZXZva2VkID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkxpc3RSZXZva2VkXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJsaXN0X3Jldm9rZWQuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBLVlNfQVJOOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUFybiB9LFxuICAgIH0pO1xuICAgIGxpc3RSZXZva2VkLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6TGlzdEtleXNcIiwgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIEFkZCAvcmV2b2tlZCB0byB0aGUgZXhpc3RpbmcgQVBJXG4gICAgYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJyZXZva2VkXCIpLmFkZE1ldGhvZChcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24obGlzdFJldm9rZWQpXG4gICAgKTtcblxuICAgIC8vIERlcGxveSBkYXNoYm9hcmQgSFRNTCAoYWxvbmdzaWRlIGRlbW8gc2l0ZSBpZiBlbmFibGVkKVxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURhc2hib2FyZFwiLCB7XG4gICAgICAgIHNvdXJjZXM6IFtzM2RlcGxveS5Tb3VyY2UuYXNzZXQoXCJyZXNvdXJjZXMvZGFzaGJvYXJkXCIpXSxcbiAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGRlbW9CdWNrZXQhLFxuICAgICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogXCJ3ZWJzaXRlXCIsXG4gICAgICAgIHBydW5lOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQVBJRW5kcG9pbnRcIiwgeyBcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS9hcGlgLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIEFQSSBFbmRwb2ludFwiXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKGNvbmZpZy5tYWluLmVuYWJsZURlbW8pIHtcbiAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJEZW1vV2Vic2l0ZVVybFwiLCB7IFxuICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vd2Vic2l0ZS9pbmRleC5odG1sYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIERlbW8gV2Vic2l0ZSBVUkxcIlxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJLZXlWYWx1ZVN0b3JlSWRcIiwgeyBcbiAgICAgIHZhbHVlOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUlkLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIElEXCJcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJTZWNyZXRBcm5cIiwge1xuICAgICAgdmFsdWU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIHNpZ25pbmcgc2VjcmV0IEFSTlwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQ1RBU3RhbmRhcmRcIiwge1xuICAgICAgdmFsdWU6IFwiQ1RBLTUwMDctQlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiSW1wbGVtZW50ZWQgc3RhbmRhcmQgdmVyc2lvblwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUm90YXRpb25Xb3JrZmxvd1wiLCB7XG4gICAgICB2YWx1ZTogcm90YXRpb25Xb3JrZmxvdy5zdGF0ZU1hY2hpbmVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiS2V5IHJvdGF0aW9uIFN0ZXAgRnVuY3Rpb25zIHdvcmtmbG93XCJcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VSb3RhdGlvblJhdGUocmF0ZTogc3RyaW5nKTogRHVyYXRpb24ge1xuICAgIGNvbnN0IG1hdGNoID0gcmF0ZS5tYXRjaCgvXihcXGQrKShbbWhkXSkkLyk7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIER1cmF0aW9uLmRheXMoMzApO1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgIGNhc2UgJ20nOiByZXR1cm4gRHVyYXRpb24ubWludXRlcyh2YWx1ZSk7XG4gICAgICBjYXNlICdoJzogcmV0dXJuIER1cmF0aW9uLmhvdXJzKHZhbHVlKTtcbiAgICAgIGNhc2UgJ2QnOiByZXR1cm4gRHVyYXRpb24uZGF5cyh2YWx1ZSk7XG4gICAgICBkZWZhdWx0OiByZXR1cm4gRHVyYXRpb24uZGF5cygzMCk7XG4gICAgfVxuICB9XG59XG4iXX0=