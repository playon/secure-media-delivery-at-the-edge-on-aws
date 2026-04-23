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
            default: "amazon.nova-lite-v1:0",
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
                prune: false,
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
            streamMode: aws_cdk_lib_1.aws_kinesis.StreamMode.ON_DEMAND,
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
                sources: [
                    aws_cdk_lib_1.aws_s3_deployment.Source.asset("resources/dashboard"),
                    aws_cdk_lib_1.aws_s3_deployment.Source.data("config.js", `window.CTA_CONFIG={apiEndpoint:"${api.url.replace(/\/$/, '')}",cdnDomain:"https://${distribution.distributionDomainName}"};`),
                ],
                destinationBucket: demoBucket,
                destinationKeyPrefix: "website",
                prune: false,
            });
        }
        // --- KVS Cleanup: purge expired revocations on a schedule ---
        const kvsCleanup = new aws_cdk_lib_1.aws_lambda.Function(this, "KvsCleanup", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "kvs_cleanup.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda"),
            timeout: aws_cdk_lib_1.Duration.minutes(2),
            environment: { KVS_ARN: this.kvStore.keyValueStoreArn, TTL_HOURS: "24" },
        });
        kvsCleanup.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            actions: ["cloudfront-keyvaluestore:ListKeys", "cloudfront-keyvaluestore:DeleteKey", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
            resources: [this.kvStore.keyValueStoreArn],
        }));
        new aws_cdk_lib_1.aws_events.Rule(this, "KvsCleanupSchedule", {
            schedule: aws_cdk_lib_1.aws_events.Schedule.rate(aws_cdk_lib_1.Duration.hours(1)),
            targets: [new aws_cdk_lib_1.aws_events_targets.LambdaFunction(kvsCleanup)],
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3RhLXNlY3VyZS1tZWRpYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImN0YS1zZWN1cmUtbWVkaWEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBc0JxQjtBQUVyQiwrRUFBK0Y7QUFPL0YsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQU01QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLFFBQWtDLEVBQUU7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxVQUFVLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDdEQsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsTUFBTTtZQUNmLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUM7WUFDaEMsV0FBVyxFQUFFLHFCQUFxQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLDBCQUFZLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUMxRCxJQUFJLEVBQUUsUUFBUTtZQUNkLE9BQU8sRUFBRSx1QkFBdUI7WUFDaEMsYUFBYSxFQUFFLENBQUMsc0JBQXNCLEVBQUUsdUJBQXVCLENBQUM7WUFDaEUsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxJQUFJO1lBQzdCLElBQUksRUFBRTtnQkFDSixVQUFVLEVBQUUsVUFBVSxDQUFDLGFBQWEsS0FBSyxNQUFNO2FBQ2hEO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLEtBQUssRUFBRSxZQUFZLENBQUMsYUFBYTthQUNsQztTQUNGLENBQUM7UUFFRixrQkFBa0I7UUFDbEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzlELG9CQUFvQixFQUFF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Q0FBQyxnQkFBZ0I7WUFDeEMsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8saUJBQWlCLENBQUMsSUFBWTtRQUNwQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLEtBQUs7WUFBRSxPQUFPLHNCQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2pCLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6QyxLQUFLLEdBQUcsQ0FBQyxDQUFDLE9BQU8sc0JBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsS0FBSyxHQUFHLENBQUMsQ0FBQyxPQUFPLHNCQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sc0JBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXJYRCxrREFxWEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTdGFjayxcbiAgU3RhY2tQcm9wcyxcbiAgQXdzLFxuICBSZW1vdmFsUG9saWN5LFxuICBEdXJhdGlvbixcbiAgQ2ZuT3V0cHV0LFxuICBDZm5QYXJhbWV0ZXIsXG4gIEN1c3RvbVJlc291cmNlLFxuICBhd3NfY2xvdWRmcm9udCBhcyBjbG91ZGZyb250LFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2FwaWdhdGV3YXkgYXMgYXBpZ2F0ZXdheSxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19zM19kZXBsb3ltZW50IGFzIHMzZGVwbG95LFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX3N0ZXBmdW5jdGlvbnMgYXMgc2ZuLFxuICBhd3Nfc3RlcGZ1bmN0aW9uc190YXNrcyBhcyB0YXNrcyxcbiAgYXdzX2V2ZW50cyBhcyBldmVudHMsXG4gIGF3c19ldmVudHNfdGFyZ2V0cyBhcyB0YXJnZXRzLFxuICBhd3Nfa2luZXNpcyBhcyBraW5lc2lzLFxuICBjdXN0b21fcmVzb3VyY2VzLFxufSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuaW1wb3J0IHsgSHR0cE9yaWdpbiwgUmVzdEFwaU9yaWdpbiwgUzNCdWNrZXRPcmlnaW4gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDVEFTZWN1cmVNZWRpYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkgY29uZmlnPzogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgQ1RBU2VjdXJlTWVkaWFTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGt2U3RvcmU6IGNsb3VkZnJvbnQuS2V5VmFsdWVTdG9yZTtcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIHB1YmxpYyByZWFkb25seSBkZW1vQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBsb2dTdHJlYW06IGtpbmVzaXMuU3RyZWFtO1xuICBcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENUQVNlY3VyZU1lZGlhU3RhY2tQcm9wcyA9IHt9KSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBlbmFibGVEZW1vID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCBcIkVuYWJsZURlbW9cIiwge1xuICAgICAgdHlwZTogXCJTdHJpbmdcIixcbiAgICAgIGRlZmF1bHQ6IFwidHJ1ZVwiLFxuICAgICAgYWxsb3dlZFZhbHVlczogW1widHJ1ZVwiLCBcImZhbHNlXCJdLFxuICAgICAgZGVzY3JpcHRpb246IFwiRGVwbG95IGRlbW8gd2Vic2l0ZVwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmVkcm9ja01vZGVsID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCBcIkJlZHJvY2tNb2RlbFwiLCB7XG4gICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgZGVmYXVsdDogXCJhbWF6b24ubm92YS1saXRlLXYxOjBcIixcbiAgICAgIGFsbG93ZWRWYWx1ZXM6IFtcImFtYXpvbi5ub3ZhLXByby12MTowXCIsIFwiYW1hem9uLm5vdmEtbGl0ZS12MTowXCJdLFxuICAgICAgZGVzY3JpcHRpb246IFwiQmVkcm9jayBtb2RlbCBmb3IgQUkgYW5hbHlzaXNcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLmNvbmZpZyB8fCB7XG4gICAgICBtYWluOiB7XG4gICAgICAgIGVuYWJsZURlbW86IGVuYWJsZURlbW8udmFsdWVBc1N0cmluZyA9PT0gXCJ0cnVlXCIsXG4gICAgICB9LFxuICAgICAgYmVkcm9jazoge1xuICAgICAgICBtb2RlbDogYmVkcm9ja01vZGVsLnZhbHVlQXNTdHJpbmcsXG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIENUQSBzaWduaW5nIGtleVxuICAgIGNvbnN0IHNpZ25pbmdTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsIFwiQ1RBS2V5XCIsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiAne1wiYWxnb3JpdGhtXCI6XCJITUFDLVNIQTI1NlwifScsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiBcInNpZ25pbmdLZXlcIixcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgS2V5VmFsdWVTdG9yZSBmb3IgcmV2b2NhdGlvblxuICAgIHRoaXMua3ZTdG9yZSA9IG5ldyBjbG91ZGZyb250LktleVZhbHVlU3RvcmUodGhpcywgXCJDVEFSZXZvY2F0aW9uU3RvcmVcIiwge1xuICAgICAgY29tbWVudDogXCJDVEEgdG9rZW4gcmV2b2NhdGlvbiBsaXN0XCIsXG4gICAgfSk7XG5cbiAgICAvLyBDVEEgdmFsaWRhdG9yIGZ1bmN0aW9uXG4gICAgY29uc3QgdmFsaWRhdG9yID0gbmV3IGNsb3VkZnJvbnQuRnVuY3Rpb24odGhpcywgXCJDVEFWYWxpZGF0b3JcIiwge1xuICAgICAgY29kZTogY2xvdWRmcm9udC5GdW5jdGlvbkNvZGUuZnJvbUZpbGUoeyBmaWxlUGF0aDogXCJsYW1iZGEvY3RhX3Rva2VuX3ZhbGlkYXRvci5qc1wiIH0pLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtBd3MuU1RBQ0tfTkFNRX0tQ1RBLVZhbGlkYXRvcmAsXG4gICAgICBydW50aW1lOiBjbG91ZGZyb250LkZ1bmN0aW9uUnVudGltZS5KU18yXzAsXG4gICAgICBrZXlWYWx1ZVN0b3JlOiB0aGlzLmt2U3RvcmUsXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKE5vZGUgU0RLKVxuICAgIGNvbnN0IGdlbmVyYXRvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFHZW5lcmF0b3JcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImN0YV90b2tlbl9nZW5lcmF0b3IuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFB5dGhvbiBTREspXG4gICAgY29uc3QgZ2VuZXJhdG9yUHl0aG9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkNUQUdlbmVyYXRvclB5dGhvblwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcHl0aG9uXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFJ1YnkgU0RLKVxuICAgIGNvbnN0IGdlbmVyYXRvclJ1YnkgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQ1RBR2VuZXJhdG9yUnVieVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5SVUJZXzNfMyxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcnVieVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgU0VDUkVUX05BTUU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSB9LFxuICAgIH0pO1xuXG4gICAgLy8gVG9rZW4gcmV2b2NhdGlvbiBoYW5kbGVyXG4gICAgY29uc3QgcmV2b2tlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFSZXZva2VyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJjdGFfcmV2b2NhdGlvbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7IEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuIH0sXG4gICAgfSk7XG5cbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChnZW5lcmF0b3IpO1xuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKGdlbmVyYXRvclB5dGhvbik7XG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFJlYWQoZ2VuZXJhdG9yUnVieSk7XG5cbiAgICAvLyBHcmFudCBLVlMgdXBkYXRlIHBlcm1pc3Npb24gdmlhIElBTSBwb2xpY3lcbiAgICByZXZva2VyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6UHV0S2V5XCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3RoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyAtLS0gS2V5IHN5bmMgTGFtYmRhIChjdXN0b20gcmVzb3VyY2UgKyByb3RhdGlvbikgLS0tXG4gICAgY29uc3Qgc3luY0tleXNUb0t2cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJTeW5jS2V5c1RvS3ZzXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEvc3luY19rZXlzXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICBLVlNfQVJOOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChzeW5jS2V5c1RvS3ZzKTtcbiAgICBzaWduaW5nU2VjcmV0LmdyYW50V3JpdGUoc3luY0tleXNUb0t2cyk7XG4gICAgc3luY0tleXNUb0t2cy5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpQdXRLZXlcIixcbiAgICAgICAgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCIsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZTogc3luYyBrZXkgdG8gS1ZTIG9uIGRlcGxveVxuICAgIGNvbnN0IGtleVN5bmNQcm92aWRlciA9IG5ldyBjdXN0b21fcmVzb3VyY2VzLlByb3ZpZGVyKHRoaXMsIFwiS2V5U3luY1Byb3ZpZGVyXCIsIHtcbiAgICAgIG9uRXZlbnRIYW5kbGVyOiBzeW5jS2V5c1RvS3ZzLFxuICAgIH0pO1xuXG4gICAgbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsIFwiS2V5U3luY1Jlc291cmNlXCIsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjoga2V5U3luY1Byb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9uIGVhY2ggZGVwbG95IHRvIGVuc3VyZSBrZXkgaXMgc3luY2VkXG4gICAgICAgIFRpbWVzdGFtcDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIC0tLSBLZXkgcm90YXRpb24gd29ya2Zsb3cgLS0tXG4gICAgY29uc3Qgcm90YXRlS2V5VGFzayA9IG5ldyB0YXNrcy5MYW1iZGFJbnZva2UodGhpcywgXCJSb3RhdGVTaWduaW5nS2V5XCIsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiBzeW5jS2V5c1RvS3ZzLFxuICAgICAgcGF5bG9hZDogc2ZuLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHsgcm90YXRlOiB0cnVlIH0pLFxuICAgICAgcmVzdWx0UGF0aDogc2ZuLkpzb25QYXRoLkRJU0NBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByb3RhdGlvbldvcmtmbG93ID0gbmV3IHNmbi5TdGF0ZU1hY2hpbmUodGhpcywgXCJLZXlSb3RhdGlvbldvcmtmbG93XCIsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6IGAke0F3cy5TVEFDS19OQU1FfV9Sb3RhdGVLZXlzYCxcbiAgICAgIGRlZmluaXRpb25Cb2R5OiBzZm4uRGVmaW5pdGlvbkJvZHkuZnJvbUNoYWluYWJsZShyb3RhdGVLZXlUYXNrKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICAvLyBSb3RhdGUga2V5cyBtb250aGx5IGJ5IGRlZmF1bHRcbiAgICBjb25zdCByb3RhdGlvblNjaGVkdWxlID0gY29uZmlnLm1haW4ucm90YXRpb25GcmVxdWVuY3kgfHwgXCIzMGRcIjtcbiAgICBjb25zdCByb3RhdGlvblJhdGUgPSB0aGlzLnBhcnNlUm90YXRpb25SYXRlKHJvdGF0aW9uU2NoZWR1bGUpO1xuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCBcIktleVJvdGF0aW9uU2NoZWR1bGVcIiwge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKHJvdGF0aW9uUmF0ZSksXG4gICAgICB0YXJnZXRzOiBbbmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHJvdGF0aW9uV29ya2Zsb3cpXSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcIkNUQUFQSVwiLCB7XG4gICAgICByZXN0QXBpTmFtZTogXCJDVEEgVG9rZW4gQVBJXCIsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRva2VuUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcInRva2VuXCIpO1xuICAgIHRva2VuUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZW5lcmF0b3IpKTtcblxuICAgIGNvbnN0IHRva2VuUHl0aG9uUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcInRva2VuLXB5dGhvblwiKTtcbiAgICB0b2tlblB5dGhvblJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2VuZXJhdG9yUHl0aG9uKSk7XG5cbiAgICBjb25zdCB0b2tlblJ1YnlSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW4tcnVieVwiKTtcbiAgICB0b2tlblJ1YnlSZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdlbmVyYXRvclJ1YnkpKTtcbiAgICBcbiAgICBjb25zdCByZXZva2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwicmV2b2tlXCIpO1xuICAgIHJldm9rZVJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocmV2b2tlcikpO1xuXG4gICAgLy8gRGVtbyB3ZWJzaXRlIChjb25kaXRpb25hbClcbiAgICBsZXQgZGlzdHJpYnV0aW9uOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbjtcbiAgICBsZXQgZGVtb0J1Y2tldDogczMuQnVja2V0IHwgdW5kZWZpbmVkO1xuICAgIFxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBkZW1vQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRlbW9XZWJzaXRlXCIsIHtcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURlbW9TaXRlXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChcInJlc291cmNlcy9kZW1vLXdlYnNpdGVcIildLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgICBwcnVuZTogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiQ1RBRGlzdHJpYnV0aW9uXCIsIHtcbiAgICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgSHR0cE9yaWdpbihcImNkbi5tZWRpYXBsYXlwZW4uY29tXCIpLFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCBcIkNUQUNhY2hlUG9saWN5XCIsIHtcbiAgICAgICAgICAgIGhlYWRlckJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlSGVhZGVyQmVoYXZpb3IuYWxsb3dMaXN0KFxuICAgICAgICAgICAgICBcIkNsb3VkRnJvbnQtVmlld2VyLUNvdW50cnlcIlxuICAgICAgICAgICAgKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBvcmlnaW5SZXF1ZXN0UG9saWN5OiBjbG91ZGZyb250Lk9yaWdpblJlcXVlc3RQb2xpY3kuQUxMX1ZJRVdFUl9FWENFUFRfSE9TVF9IRUFERVIsXG4gICAgICAgICAgZnVuY3Rpb25Bc3NvY2lhdGlvbnM6IFt7XG4gICAgICAgICAgICBmdW5jdGlvbjogdmFsaWRhdG9yLFxuICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkZ1bmN0aW9uRXZlbnRUeXBlLlZJRVdFUl9SRVFVRVNULFxuICAgICAgICAgIH1dLFxuICAgICAgICB9LFxuICAgICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICAgXCIvYXBpLypcIjoge1xuICAgICAgICAgICAgb3JpZ2luOiBuZXcgUmVzdEFwaU9yaWdpbihhcGkpLFxuICAgICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXG4gICAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxuICAgICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVJfRVhDRVBUX0hPU1RfSEVBREVSLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCIvd2Vic2l0ZS8qXCI6IHtcbiAgICAgICAgICAgIG9yaWdpbjogUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2woZGVtb0J1Y2tldCksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgfSBlbHNlIHtcbiAgICAgIGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCBcIkNUQURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IFJlc3RBcGlPcmlnaW4oYXBpKSxcbiAgICAgICAgICBmdW5jdGlvbkFzc29jaWF0aW9uczogW3tcbiAgICAgICAgICAgIGZ1bmN0aW9uOiB2YWxpZGF0b3IsXG4gICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25FdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsXG4gICAgICAgICAgfV0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmRpc3RyaWJ1dGlvbiA9IGRpc3RyaWJ1dGlvbjtcbiAgICBpZiAoY29uZmlnLm1haW4uZW5hYmxlRGVtbykge1xuICAgICAgdGhpcy5kZW1vQnVja2V0ID0gZGVtb0J1Y2tldCE7XG4gICAgfVxuXG4gICAgLy8gLS0tIFJlYWwtVGltZSBMb2dnaW5nIHZpYSBLaW5lc2lzIC0tLVxuICAgIGNvbnN0IGxvZ1N0cmVhbSA9IG5ldyBraW5lc2lzLlN0cmVhbSh0aGlzLCBcIlJlYWx0aW1lTG9nU3RyZWFtXCIsIHtcbiAgICAgIHN0cmVhbU1vZGU6IGtpbmVzaXMuU3RyZWFtTW9kZS5PTl9ERU1BTkQsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IER1cmF0aW9uLmhvdXJzKDI0KSxcbiAgICB9KTtcbiAgICB0aGlzLmxvZ1N0cmVhbSA9IGxvZ1N0cmVhbTtcblxuICAgIGNvbnN0IGNmS2luZXNpc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDbG91ZEZyb250S2luZXNpc1JvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJjbG91ZGZyb250LmFtYXpvbmF3cy5jb21cIiksXG4gICAgfSk7XG4gICAgbG9nU3RyZWFtLmdyYW50V3JpdGUoY2ZLaW5lc2lzUm9sZSk7XG5cbiAgICBjb25zdCByZWFsdGltZUxvZ0NvbmZpZyA9IG5ldyBjbG91ZGZyb250LkNmblJlYWx0aW1lTG9nQ29uZmlnKHRoaXMsIFwiUmVhbHRpbWVMb2dDb25maWdcIiwge1xuICAgICAgbmFtZTogYCR7QXdzLlNUQUNLX05BTUV9LXJlYWx0aW1lLWxvZ3NgLFxuICAgICAgc2FtcGxpbmdSYXRlOiAxMDAsXG4gICAgICBlbmRQb2ludHM6IFt7XG4gICAgICAgIHN0cmVhbVR5cGU6IFwiS2luZXNpc1wiLFxuICAgICAgICBraW5lc2lzU3RyZWFtQ29uZmlnOiB7XG4gICAgICAgICAgcm9sZUFybjogY2ZLaW5lc2lzUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIHN0cmVhbUFybjogbG9nU3RyZWFtLnN0cmVhbUFybixcbiAgICAgICAgfSxcbiAgICAgIH1dLFxuICAgICAgZmllbGRzOiBbXG4gICAgICAgIFwidGltZXN0YW1wXCIsIFwiYy1pcFwiLCBcInNjLXN0YXR1c1wiLCBcImNzLXVyaS1zdGVtXCIsIFwiY3MtbWV0aG9kXCIsXG4gICAgICAgIFwiY3MtaG9zdFwiLCBcImNzLXVzZXItYWdlbnRcIiwgXCJzYy1ieXRlc1wiLCBcInRpbWUtdGFrZW5cIiwgXCJjLWNvdW50cnlcIixcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggcmVhbC10aW1lIGxvZ3MgdG8gdGhlIGRlZmF1bHQgY2FjaGUgYmVoYXZpb3JcbiAgICBjb25zdCBjZm5EaXN0ID0gZGlzdHJpYnV0aW9uLm5vZGUuZGVmYXVsdENoaWxkIGFzIGNsb3VkZnJvbnQuQ2ZuRGlzdHJpYnV0aW9uO1xuICAgIGNmbkRpc3QuYWRkUHJvcGVydHlPdmVycmlkZShcbiAgICAgIFwiRGlzdHJpYnV0aW9uQ29uZmlnLkRlZmF1bHRDYWNoZUJlaGF2aW9yLlJlYWx0aW1lTG9nQ29uZmlnQXJuXCIsXG4gICAgICByZWFsdGltZUxvZ0NvbmZpZy5hdHRyQXJuXG4gICAgKTtcblxuICAgIC8vIC0tLSBEYXNoYm9hcmQ6IGxpc3QgcmV2b2tlZCBzZXNzaW9ucyBmcm9tIEtWUyAtLS1cbiAgICBjb25zdCBsaXN0UmV2b2tlZCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJMaXN0UmV2b2tlZFwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwibGlzdF9yZXZva2VkLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgS1ZTX0FSTjogdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4gfSxcbiAgICB9KTtcbiAgICBsaXN0UmV2b2tlZC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkxpc3RLZXlzXCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3RoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgL3Jldm9rZWQgdG8gdGhlIGV4aXN0aW5nIEFQSVxuICAgIGFwaS5yb290LmFkZFJlc291cmNlKFwicmV2b2tlZFwiKS5hZGRNZXRob2QoXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxpc3RSZXZva2VkKVxuICAgICk7XG5cbiAgICAvLyBEZXBsb3kgZGFzaGJvYXJkIEhUTUwgKGFsb25nc2lkZSBkZW1vIHNpdGUgaWYgZW5hYmxlZClcbiAgICBpZiAoY29uZmlnLm1haW4uZW5hYmxlRGVtbykge1xuICAgICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lEYXNoYm9hcmRcIiwge1xuICAgICAgICBzb3VyY2VzOiBbXG4gICAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KFwicmVzb3VyY2VzL2Rhc2hib2FyZFwiKSxcbiAgICAgICAgICBzM2RlcGxveS5Tb3VyY2UuZGF0YShcImNvbmZpZy5qc1wiLFxuICAgICAgICAgICAgYHdpbmRvdy5DVEFfQ09ORklHPXthcGlFbmRwb2ludDpcIiR7YXBpLnVybC5yZXBsYWNlKC9cXC8kLywnJyl9XCIsY2RuRG9tYWluOlwiaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfVwifTtgXG4gICAgICAgICAgKSxcbiAgICAgICAgXSxcbiAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGRlbW9CdWNrZXQhLFxuICAgICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogXCJ3ZWJzaXRlXCIsXG4gICAgICAgIHBydW5lOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIC0tLSBLVlMgQ2xlYW51cDogcHVyZ2UgZXhwaXJlZCByZXZvY2F0aW9ucyBvbiBhIHNjaGVkdWxlIC0tLVxuICAgIGNvbnN0IGt2c0NsZWFudXAgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiS3ZzQ2xlYW51cFwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwia3ZzX2NsZWFudXAuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIGVudmlyb25tZW50OiB7IEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuLCBUVExfSE9VUlM6IFwiMjRcIiB9LFxuICAgIH0pO1xuICAgIGt2c0NsZWFudXAuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpMaXN0S2V5c1wiLCBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZWxldGVLZXlcIiwgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcbiAgICBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJLdnNDbGVhbnVwU2NoZWR1bGVcIiwge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKER1cmF0aW9uLmhvdXJzKDEpKSxcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihrdnNDbGVhbnVwKV0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkFQSUVuZHBvaW50XCIsIHsgXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vYXBpYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNUQSBBUEkgRW5kcG9pbnRcIlxuICAgIH0pO1xuICAgIFxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiRGVtb1dlYnNpdGVVcmxcIiwgeyBcbiAgICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9L3dlYnNpdGUvaW5kZXguaHRtbGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkNUQSBEZW1vIFdlYnNpdGUgVVJMXCJcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiS2V5VmFsdWVTdG9yZUlkXCIsIHsgXG4gICAgICB2YWx1ZTogdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNsb3VkRnJvbnQgS2V5VmFsdWVTdG9yZSBJRFwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiU2VjcmV0QXJuXCIsIHtcbiAgICAgIHZhbHVlOiBzaWduaW5nU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNUQSBzaWduaW5nIHNlY3JldCBBUk5cIlxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkNUQVN0YW5kYXJkXCIsIHtcbiAgICAgIHZhbHVlOiBcIkNUQS01MDA3LUJcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkltcGxlbWVudGVkIHN0YW5kYXJkIHZlcnNpb25cIlxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlJvdGF0aW9uV29ya2Zsb3dcIiwge1xuICAgICAgdmFsdWU6IHJvdGF0aW9uV29ya2Zsb3cuc3RhdGVNYWNoaW5lTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIktleSByb3RhdGlvbiBTdGVwIEZ1bmN0aW9ucyB3b3JrZmxvd1wiXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlUm90YXRpb25SYXRlKHJhdGU6IHN0cmluZyk6IER1cmF0aW9uIHtcbiAgICBjb25zdCBtYXRjaCA9IHJhdGUubWF0Y2goL14oXFxkKykoW21oZF0pJC8pO1xuICAgIGlmICghbWF0Y2gpIHJldHVybiBEdXJhdGlvbi5kYXlzKDMwKTtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlSW50KG1hdGNoWzFdKTtcbiAgICBzd2l0Y2ggKG1hdGNoWzJdKSB7XG4gICAgICBjYXNlICdtJzogcmV0dXJuIER1cmF0aW9uLm1pbnV0ZXModmFsdWUpO1xuICAgICAgY2FzZSAnaCc6IHJldHVybiBEdXJhdGlvbi5ob3Vycyh2YWx1ZSk7XG4gICAgICBjYXNlICdkJzogcmV0dXJuIER1cmF0aW9uLmRheXModmFsdWUpO1xuICAgICAgZGVmYXVsdDogcmV0dXJuIER1cmF0aW9uLmRheXMoMzApO1xuICAgIH1cbiAgfVxufVxuIl19