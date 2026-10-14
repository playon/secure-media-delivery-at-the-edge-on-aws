"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CTASecureMediaStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cloudfront_origins_1 = require("aws-cdk-lib/aws-cloudfront-origins");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
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
        // CTA validator function.
        //
        // Explicit addDependency on the KVS: CloudFront KeyValueStore is a
        // two-phase AWS resource (Provisioning -> Ready). The L2 construct
        // returns the ARN before the store is Ready, so without this
        // dependency CDK can order the CF Function's KeyValueStoreAssociations
        // before the KVS is Ready and CloudFormation fails with:
        //   "cannot be associated before the resource is provisioned"
        // The failure is intermittent — it depends on CDK's graph traversal
        // order — which makes it especially frustrating to debug on a fresh
        // deploy.
        const validator = new aws_cdk_lib_1.aws_cloudfront.Function(this, "CTAValidator", {
            code: aws_cdk_lib_1.aws_cloudfront.FunctionCode.fromFile({ filePath: "lambda/cta_token_validator.js" }),
            functionName: `${aws_cdk_lib_1.Aws.STACK_NAME}-CTA-Validator`,
            runtime: aws_cdk_lib_1.aws_cloudfront.FunctionRuntime.JS_2_0,
            keyValueStore: this.kvStore,
        });
        validator.node.addDependency(this.kvStore);
        // Token generator (Node SDK)
        // NodejsFunction (esbuild) bundles the handler together with its
        // third-party dependency cbor-x, which is NOT provided by the Lambda
        // Node.js runtime. A plain Code.fromAsset("lambda") ships no node_modules,
        // so require('cbor-x') fails at module init and API Gateway returns a 502
        // with no CORS headers — surfacing in the browser as a CORS error.
        // The AWS SDK v3 packages (@aws-sdk/*) remain externalized by default
        // since they ARE present in the runtime.
        const generator = new aws_lambda_nodejs_1.NodejsFunction(this, "CTAGenerator", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            entry: "lambda/cta_token_generator.js",
            handler: "handler",
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
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.RUBY_3_4,
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
        const rotationOverlap = Number(config.main.rotationOverlapSeconds ?? 86400);
        const rotationPropagation = Number(config.main.rotationPropagationSeconds ?? 300);
        if (!Number.isSafeInteger(rotationOverlap) || rotationOverlap < 86400 ||
            !Number.isSafeInteger(rotationPropagation) || rotationPropagation < 300) {
            throw new Error("Rotation requires integer overlap >=86400s and propagation >=300s");
        }
        const syncKeysToKvs = new aws_cdk_lib_1.aws_lambda.Function(this, "SyncKeysToKvs", {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: "index.handler",
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/sync_keys"),
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            environment: {
                SECRET_NAME: signingSecret.secretName,
                KVS_ARN: this.kvStore.keyValueStoreArn,
                ROTATION_OVERLAP_SECONDS: String(rotationOverlap),
                ROTATION_PROPAGATION_SECONDS: String(rotationPropagation),
            },
        });
        signingSecret.grantRead(syncKeysToKvs);
        signingSecret.grantWrite(syncKeysToKvs);
        syncKeysToKvs.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: [
                "cloudfront-keyvaluestore:GetKey",
                "cloudfront-keyvaluestore:UpdateKeys",
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
        // Durable, execution-owned rotation. Only metadata enters workflow history.
        const rotationTask = (id, action) => {
            const task = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, id, {
                lambdaFunction: syncKeysToKvs,
                payload: aws_cdk_lib_1.aws_stepfunctions.TaskInput.fromObject({
                    action,
                    executionId: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Id"),
                }),
                resultPath: "$.rotation",
            });
            task.addRetry({ errors: ["States.TaskFailed"], interval: aws_cdk_lib_1.Duration.seconds(2), maxAttempts: 6, backoffRate: 2 });
            return task;
        };
        const prepareKey = rotationTask("PrepareSigningKey", "prepare");
        const waitForEdge = new aws_cdk_lib_1.aws_stepfunctions.Wait(this, "WaitForEdgePropagation", {
            time: aws_cdk_lib_1.aws_stepfunctions.WaitTime.timestampPath("$.rotation.Payload.propagationReadyTimestamp"),
        });
        const promoteKey = rotationTask("PromoteMintKey", "promote");
        const finalizeOverlap = rotationTask("FinalizeOverlap", "finalize");
        const waitForOverlap = new aws_cdk_lib_1.aws_stepfunctions.Wait(this, "WaitForOverlap", {
            time: aws_cdk_lib_1.aws_stepfunctions.WaitTime.timestampPath("$.rotation.Payload.cleanupTimestamp"),
        });
        const cleanupKey = rotationTask("RemovePreviousKey", "cleanup");
        const rotationWorkflow = new aws_cdk_lib_1.aws_stepfunctions.StateMachine(this, "KeyRotationWorkflow", {
            stateMachineName: `${aws_cdk_lib_1.Aws.STACK_NAME}_RotateKeys`,
            definitionBody: aws_cdk_lib_1.aws_stepfunctions.DefinitionBody.fromChainable(prepareKey.next(waitForEdge).next(promoteKey).next(finalizeOverlap).next(waitForOverlap).next(cleanupKey)),
        });
        // Keep disabled until the updated validators and mints are verified.
        const rotationSchedule = config.main.rotationFrequency || "30d";
        const rotationRate = this.parseRotationRate(rotationSchedule);
        new aws_cdk_lib_1.aws_events.Rule(this, "KeyRotationSchedule", {
            schedule: aws_cdk_lib_1.aws_events.Schedule.rate(rotationRate),
            enabled: config.main.rotationEnabled === true,
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
        // Attach CORS headers to API Gateway's default gateway responses so that
        // integration errors (e.g. a Lambda 5xx/timeout, or a 4xx) still carry
        // Access-Control-Allow-Origin. Without this, an errored request returns a
        // response with no CORS header, which browsers surface as a misleading
        // "blocked by CORS policy" error that masks the real status code.
        const corsResponseHeaders = {
            "Access-Control-Allow-Origin": "'*'",
            "Access-Control-Allow-Headers": "'*'",
        };
        api.addGatewayResponse("Default4XX", {
            type: aws_cdk_lib_1.aws_apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: corsResponseHeaders,
        });
        api.addGatewayResponse("Default5XX", {
            type: aws_cdk_lib_1.aws_apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: corsResponseHeaders,
        });
        const tokenResource = api.root.addResource("token");
        tokenResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generator));
        const tokenPythonResource = api.root.addResource("token-python");
        tokenPythonResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generatorPython));
        const tokenRubyResource = api.root.addResource("token-ruby");
        tokenRubyResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(generatorRuby));
        const revokeResource = api.root.addResource("revoke");
        revokeResource.addMethod("POST", new aws_cdk_lib_1.aws_apigateway.LambdaIntegration(revoker));
        // WAFv2 Web ACL — rate-limit POST /api/token per source IP.
        //: automated-scraping mitigation. Rate-based rules use a
        // rolling 5-minute window; 300 req/5min ≈ 60 req/min per IP, well
        // above legitimate player traffic (mint once → 2h TTL → next mint)
        // but tight enough to stop a mint-your-own-token scraper.
        // Blocked requests get a custom 429 response instead of the default 403.
        const rateLimitBody = "CTAWebAclRateLimit429";
        const webAcl = new aws_cdk_lib_1.aws_wafv2.CfnWebACL(this, "CTAWebAcl", {
            name: `${aws_cdk_lib_1.Aws.STACK_NAME}-token-rate-limit`,
            description: "Rate-limit POST /api/token to mitigate automated CWT minting",
            scope: "CLOUDFRONT",
            defaultAction: { allow: {} },
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: `${aws_cdk_lib_1.Aws.STACK_NAME}-web-acl`,
                sampledRequestsEnabled: true,
            },
            customResponseBodies: {
                [rateLimitBody]: {
                    contentType: "APPLICATION_JSON",
                    content: JSON.stringify({ error: "rate_limited", message: "Too many token mint requests from this IP; try again in a few minutes." }),
                },
            },
            rules: [{
                    name: "TokenMintRateLimit",
                    priority: 0,
                    action: {
                        block: {
                            customResponse: {
                                responseCode: 429,
                                customResponseBodyKey: rateLimitBody,
                            },
                        },
                    },
                    statement: {
                        rateBasedStatement: {
                            limit: 300,
                            aggregateKeyType: "IP",
                            scopeDownStatement: {
                                byteMatchStatement: {
                                    fieldToMatch: { uriPath: {} },
                                    positionalConstraint: "STARTS_WITH",
                                    searchString: "/api/token",
                                    textTransformations: [{ priority: 0, type: "NONE" }],
                                },
                            },
                        },
                    },
                    visibilityConfig: {
                        cloudWatchMetricsEnabled: true,
                        metricName: `${aws_cdk_lib_1.Aws.STACK_NAME}-token-rate-limit`,
                        sampledRequestsEnabled: true,
                    },
                }],
        });
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
                webAclId: webAcl.attrArn,
                defaultBehavior: {
                    origin: new aws_cloudfront_origins_1.HttpOrigin("cdn.mediaplaypen.com"),
                    viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: new aws_cdk_lib_1.aws_cloudfront.CachePolicy(this, "CTACachePolicy", {
                        headerBehavior: aws_cdk_lib_1.aws_cloudfront.CacheHeaderBehavior.allowList("CloudFront-Viewer-Country"),
                    }),
                    responseHeadersPolicy: new aws_cdk_lib_1.aws_cloudfront.ResponseHeadersPolicy(this, "CTACorsResponsePolicy", {
                        responseHeadersPolicyName: `${aws_cdk_lib_1.Aws.STACK_NAME}-CTA-CORS`,
                        corsBehavior: {
                            accessControlAllowOrigins: ["*"],
                            accessControlAllowHeaders: ["CTA-Common-Access-Token", "Content-Type"],
                            accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
                            accessControlExposeHeaders: ["CTA-Common-Access-Token"],
                            accessControlAllowCredentials: false,
                            accessControlMaxAge: aws_cdk_lib_1.Duration.hours(24),
                            originOverride: true,
                        },
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
                webAclId: webAcl.attrArn,
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
                value: `https://${distribution.distributionDomainName}/website/index-path.html`,
                description: "CTA Demo Website — Path Token Mode"
            });
            new aws_cdk_lib_1.CfnOutput(this, "DemoWebsiteHeaderUrl", {
                value: `https://${distribution.distributionDomainName}/website/index-header.html`,
                description: "CTA Demo Website — Header-Only Token Mode"
            });
            new aws_cdk_lib_1.CfnOutput(this, "DemoWebsiteHybridUrl", {
                value: `https://${distribution.distributionDomainName}/website/index-hybrid.html`,
                description: "CTA Demo Website — Hybrid (Path Init → Header Renewal)"
            });
            new aws_cdk_lib_1.CfnOutput(this, "DashboardUrl", {
                value: `https://${distribution.distributionDomainName}/website/dashboard.html`,
                description: "Revocation Dashboard with Bedrock Prompt Editor"
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
        new aws_cdk_lib_1.CfnOutput(this, "WebAclArn", {
            value: webAcl.attrArn,
            description: "WAFv2 Web ACL — rate-limits POST /api/token"
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3RhLXNlY3VyZS1tZWRpYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImN0YS1zZWN1cmUtbWVkaWEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBdUJxQjtBQUVyQiwrRUFBK0Y7QUFDL0YscUVBQStEO0FBTy9ELE1BQWEsbUJBQW9CLFNBQVEsbUJBQUs7SUFNNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxRQUFrQyxFQUFFO1FBQzVFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sVUFBVSxHQUFHLElBQUksMEJBQVksQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3RELElBQUksRUFBRSxRQUFRO1lBQ2QsT0FBTyxFQUFFLE1BQU07WUFDZixhQUFhLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDO1lBQ2hDLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDMUQsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsdUJBQXVCO1lBQ2hDLGFBQWEsRUFBRSxDQUFDLHNCQUFzQixFQUFFLHVCQUF1QixDQUFDO1lBQ2hFLFdBQVcsRUFBRSwrQkFBK0I7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sSUFBSTtZQUM3QixJQUFJLEVBQUU7Z0JBQ0osVUFBVSxFQUFFLFVBQVUsQ0FBQyxhQUFhLEtBQUssTUFBTTthQUNoRDtZQUNELE9BQU8sRUFBRTtnQkFDUCxLQUFLLEVBQUUsWUFBWSxDQUFDLGFBQWE7YUFDbEM7U0FDRixDQUFDO1FBRUYsa0JBQWtCO1FBQ2xCLE1BQU0sYUFBYSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUM5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SyxHQUFHLENBQUMsQ0FBQyxPQUFPLHNCQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxzQkFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2QyxLQUFLLEdBQUcsQ0FBQyxDQUFDLE9BQU8sc0JBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEMsT0FBTyxDQUFDLENBQUMsT0FBTyxzQkFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBM2dCRCxrREEyZ0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgU3RhY2ssXG4gIFN0YWNrUHJvcHMsXG4gIEF3cyxcbiAgUmVtb3ZhbFBvbGljeSxcbiAgRHVyYXRpb24sXG4gIENmbk91dHB1dCxcbiAgQ2ZuUGFyYW1ldGVyLFxuICBDdXN0b21SZXNvdXJjZSxcbiAgYXdzX2Nsb3VkZnJvbnQgYXMgY2xvdWRmcm9udCxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19hcGlnYXRld2F5IGFzIGFwaWdhdGV3YXksXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfczNfZGVwbG95bWVudCBhcyBzM2RlcGxveSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19zdGVwZnVuY3Rpb25zIGFzIHNmbixcbiAgYXdzX3N0ZXBmdW5jdGlvbnNfdGFza3MgYXMgdGFza3MsXG4gIGF3c19ldmVudHMgYXMgZXZlbnRzLFxuICBhd3NfZXZlbnRzX3RhcmdldHMgYXMgdGFyZ2V0cyxcbiAgYXdzX2tpbmVzaXMgYXMga2luZXNpcyxcbiAgYXdzX3dhZnYyIGFzIHdhZnYyLFxuICBjdXN0b21fcmVzb3VyY2VzLFxufSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuaW1wb3J0IHsgSHR0cE9yaWdpbiwgUmVzdEFwaU9yaWdpbiwgUzNCdWNrZXRPcmlnaW4gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ1RBU2VjdXJlTWVkaWFTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGNvbmZpZz86IGFueTtcbn1cblxuZXhwb3J0IGNsYXNzIENUQVNlY3VyZU1lZGlhU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBrdlN0b3JlOiBjbG91ZGZyb250LktleVZhbHVlU3RvcmU7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZGVtb0J1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nU3RyZWFtOiBraW5lc2lzLlN0cmVhbTtcbiAgXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBDVEFTZWN1cmVNZWRpYVN0YWNrUHJvcHMgPSB7fSkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZW5hYmxlRGVtbyA9IG5ldyBDZm5QYXJhbWV0ZXIodGhpcywgXCJFbmFibGVEZW1vXCIsIHtcbiAgICAgIHR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICBkZWZhdWx0OiBcInRydWVcIixcbiAgICAgIGFsbG93ZWRWYWx1ZXM6IFtcInRydWVcIiwgXCJmYWxzZVwiXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkRlcGxveSBkZW1vIHdlYnNpdGVcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGJlZHJvY2tNb2RlbCA9IG5ldyBDZm5QYXJhbWV0ZXIodGhpcywgXCJCZWRyb2NrTW9kZWxcIiwge1xuICAgICAgdHlwZTogXCJTdHJpbmdcIixcbiAgICAgIGRlZmF1bHQ6IFwiYW1hem9uLm5vdmEtbGl0ZS12MTowXCIsXG4gICAgICBhbGxvd2VkVmFsdWVzOiBbXCJhbWF6b24ubm92YS1wcm8tdjE6MFwiLCBcImFtYXpvbi5ub3ZhLWxpdGUtdjE6MFwiXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkJlZHJvY2sgbW9kZWwgZm9yIEFJIGFuYWx5c2lzXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5jb25maWcgfHwge1xuICAgICAgbWFpbjoge1xuICAgICAgICBlbmFibGVEZW1vOiBlbmFibGVEZW1vLnZhbHVlQXNTdHJpbmcgPT09IFwidHJ1ZVwiLFxuICAgICAgfSxcbiAgICAgIGJlZHJvY2s6IHtcbiAgICAgICAgbW9kZWw6IGJlZHJvY2tNb2RlbC52YWx1ZUFzU3RyaW5nLFxuICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBDVEEgc2lnbmluZyBrZXlcbiAgICBjb25zdCBzaWduaW5nU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCBcIkNUQUtleVwiLCB7XG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogJ3tcImFsZ29yaXRobVwiOlwiSE1BQy1TSEEyNTZcIn0nLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogXCJzaWduaW5nS2V5XCIsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IEtleVZhbHVlU3RvcmUgZm9yIHJldm9jYXRpb25cbiAgICB0aGlzLmt2U3RvcmUgPSBuZXcgY2xvdWRmcm9udC5LZXlWYWx1ZVN0b3JlKHRoaXMsIFwiQ1RBUmV2b2NhdGlvblN0b3JlXCIsIHtcbiAgICAgIGNvbW1lbnQ6IFwiQ1RBIHRva2VuIHJldm9jYXRpb24gbGlzdFwiLFxuICAgIH0pO1xuXG4gICAgLy8gQ1RBIHZhbGlkYXRvciBmdW5jdGlvbi5cbiAgICAvL1xuICAgIC8vIEV4cGxpY2l0IGFkZERlcGVuZGVuY3kgb24gdGhlIEtWUzogQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIGlzIGFcbiAgICAvLyB0d28tcGhhc2UgQVdTIHJlc291cmNlIChQcm92aXNpb25pbmcgLT4gUmVhZHkpLiBUaGUgTDIgY29uc3RydWN0XG4gICAgLy8gcmV0dXJucyB0aGUgQVJOIGJlZm9yZSB0aGUgc3RvcmUgaXMgUmVhZHksIHNvIHdpdGhvdXQgdGhpc1xuICAgIC8vIGRlcGVuZGVuY3kgQ0RLIGNhbiBvcmRlciB0aGUgQ0YgRnVuY3Rpb24ncyBLZXlWYWx1ZVN0b3JlQXNzb2NpYXRpb25zXG4gICAgLy8gYmVmb3JlIHRoZSBLVlMgaXMgUmVhZHkgYW5kIENsb3VkRm9ybWF0aW9uIGZhaWxzIHdpdGg6XG4gICAgLy8gICBcImNhbm5vdCBiZSBhc3NvY2lhdGVkIGJlZm9yZSB0aGUgcmVzb3VyY2UgaXMgcHJvdmlzaW9uZWRcIlxuICAgIC8vIFRoZSBmYWlsdXJlIGlzIGludGVybWl0dGVudCDigJQgaXQgZGVwZW5kcyBvbiBDREsncyBncmFwaCB0cmF2ZXJzYWxcbiAgICAvLyBvcmRlciDigJQgd2hpY2ggbWFrZXMgaXQgZXNwZWNpYWxseSBmcnVzdHJhdGluZyB0byBkZWJ1ZyBvbiBhIGZyZXNoXG4gICAgLy8gZGVwbG95LlxuICAgIGNvbnN0IHZhbGlkYXRvciA9IG5ldyBjbG91ZGZyb250LkZ1bmN0aW9uKHRoaXMsIFwiQ1RBVmFsaWRhdG9yXCIsIHtcbiAgICAgIGNvZGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25Db2RlLmZyb21GaWxlKHsgZmlsZVBhdGg6IFwibGFtYmRhL2N0YV90b2tlbl92YWxpZGF0b3IuanNcIiB9KSxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7QXdzLlNUQUNLX05BTUV9LUNUQS1WYWxpZGF0b3JgLFxuICAgICAgcnVudGltZTogY2xvdWRmcm9udC5GdW5jdGlvblJ1bnRpbWUuSlNfMl8wLFxuICAgICAga2V5VmFsdWVTdG9yZTogdGhpcy5rdlN0b3JlLFxuICAgIH0pO1xuICAgIHZhbGlkYXRvci5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5rdlN0b3JlKTtcblxuICAgIC8vIFRva2VuIGdlbmVyYXRvciAoTm9kZSBTREspXG4gICAgLy8gTm9kZWpzRnVuY3Rpb24gKGVzYnVpbGQpIGJ1bmRsZXMgdGhlIGhhbmRsZXIgdG9nZXRoZXIgd2l0aCBpdHNcbiAgICAvLyB0aGlyZC1wYXJ0eSBkZXBlbmRlbmN5IGNib3IteCwgd2hpY2ggaXMgTk9UIHByb3ZpZGVkIGJ5IHRoZSBMYW1iZGFcbiAgICAvLyBOb2RlLmpzIHJ1bnRpbWUuIEEgcGxhaW4gQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIikgc2hpcHMgbm8gbm9kZV9tb2R1bGVzLFxuICAgIC8vIHNvIHJlcXVpcmUoJ2Nib3IteCcpIGZhaWxzIGF0IG1vZHVsZSBpbml0IGFuZCBBUEkgR2F0ZXdheSByZXR1cm5zIGEgNTAyXG4gICAgLy8gd2l0aCBubyBDT1JTIGhlYWRlcnMg4oCUIHN1cmZhY2luZyBpbiB0aGUgYnJvd3NlciBhcyBhIENPUlMgZXJyb3IuXG4gICAgLy8gVGhlIEFXUyBTREsgdjMgcGFja2FnZXMgKEBhd3Mtc2RrLyopIHJlbWFpbiBleHRlcm5hbGl6ZWQgYnkgZGVmYXVsdFxuICAgIC8vIHNpbmNlIHRoZXkgQVJFIHByZXNlbnQgaW4gdGhlIHJ1bnRpbWUuXG4gICAgY29uc3QgZ2VuZXJhdG9yID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiQ1RBR2VuZXJhdG9yXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgZW50cnk6IFwibGFtYmRhL2N0YV90b2tlbl9nZW5lcmF0b3IuanNcIixcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFB5dGhvbiBTREspXG4gICAgY29uc3QgZ2VuZXJhdG9yUHl0aG9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkNUQUdlbmVyYXRvclB5dGhvblwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcHl0aG9uXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiBnZW5lcmF0b3IgKFJ1YnkgU0RLKVxuICAgIGNvbnN0IGdlbmVyYXRvclJ1YnkgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQ1RBR2VuZXJhdG9yUnVieVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5SVUJZXzNfNCxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEtcnVieVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgU0VDUkVUX05BTUU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSB9LFxuICAgIH0pO1xuXG4gICAgLy8gVG9rZW4gcmV2b2NhdGlvbiBoYW5kbGVyXG4gICAgY29uc3QgcmV2b2tlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFSZXZva2VyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJjdGFfcmV2b2NhdGlvbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7IEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuIH0sXG4gICAgfSk7XG5cbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChnZW5lcmF0b3IpO1xuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKGdlbmVyYXRvclB5dGhvbik7XG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFJlYWQoZ2VuZXJhdG9yUnVieSk7XG5cbiAgICAvLyBHcmFudCBLVlMgdXBkYXRlIHBlcm1pc3Npb24gdmlhIElBTSBwb2xpY3lcbiAgICByZXZva2VyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6UHV0S2V5XCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3RoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyAtLS0gS2V5IHN5bmMgTGFtYmRhIChjdXN0b20gcmVzb3VyY2UgKyByb3RhdGlvbikgLS0tXG4gICAgY29uc3Qgcm90YXRpb25PdmVybGFwID0gTnVtYmVyKGNvbmZpZy5tYWluLnJvdGF0aW9uT3ZlcmxhcFNlY29uZHMgPz8gODY0MDApO1xuICAgIGNvbnN0IHJvdGF0aW9uUHJvcGFnYXRpb24gPSBOdW1iZXIoY29uZmlnLm1haW4ucm90YXRpb25Qcm9wYWdhdGlvblNlY29uZHMgPz8gMzAwKTtcbiAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHJvdGF0aW9uT3ZlcmxhcCkgfHwgcm90YXRpb25PdmVybGFwIDwgODY0MDAgfHxcbiAgICAgICAgIU51bWJlci5pc1NhZmVJbnRlZ2VyKHJvdGF0aW9uUHJvcGFnYXRpb24pIHx8IHJvdGF0aW9uUHJvcGFnYXRpb24gPCAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlJvdGF0aW9uIHJlcXVpcmVzIGludGVnZXIgb3ZlcmxhcCA+PTg2NDAwcyBhbmQgcHJvcGFnYXRpb24gPj0zMDBzXCIpO1xuICAgIH1cbiAgICBjb25zdCBzeW5jS2V5c1RvS3ZzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlN5bmNLZXlzVG9LdnNcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS9zeW5jX2tleXNcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVF9OQU1FOiBzaWduaW5nU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuLFxuICAgICAgICBST1RBVElPTl9PVkVSTEFQX1NFQ09ORFM6IFN0cmluZyhyb3RhdGlvbk92ZXJsYXApLFxuICAgICAgICBST1RBVElPTl9QUk9QQUdBVElPTl9TRUNPTkRTOiBTdHJpbmcocm90YXRpb25Qcm9wYWdhdGlvbiksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFJlYWQoc3luY0tleXNUb0t2cyk7XG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFdyaXRlKHN5bmNLZXlzVG9LdnMpO1xuICAgIHN5bmNLZXlzVG9LdnMuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6R2V0S2V5XCIsXG4gICAgICAgIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOlVwZGF0ZUtleXNcIixcbiAgICAgICAgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCIsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZTogc3luYyBrZXkgdG8gS1ZTIG9uIGRlcGxveVxuICAgIGNvbnN0IGtleVN5bmNQcm92aWRlciA9IG5ldyBjdXN0b21fcmVzb3VyY2VzLlByb3ZpZGVyKHRoaXMsIFwiS2V5U3luY1Byb3ZpZGVyXCIsIHtcbiAgICAgIG9uRXZlbnRIYW5kbGVyOiBzeW5jS2V5c1RvS3ZzLFxuICAgIH0pO1xuXG4gICAgbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsIFwiS2V5U3luY1Jlc291cmNlXCIsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjoga2V5U3luY1Byb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgLy8gRm9yY2UgdXBkYXRlIG9uIGVhY2ggZGVwbG95IHRvIGVuc3VyZSBrZXkgaXMgc3luY2VkXG4gICAgICAgIFRpbWVzdGFtcDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIER1cmFibGUsIGV4ZWN1dGlvbi1vd25lZCByb3RhdGlvbi4gT25seSBtZXRhZGF0YSBlbnRlcnMgd29ya2Zsb3cgaGlzdG9yeS5cbiAgICBjb25zdCByb3RhdGlvblRhc2sgPSAoaWQ6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IHRhc2sgPSBuZXcgdGFza3MuTGFtYmRhSW52b2tlKHRoaXMsIGlkLCB7XG4gICAgICAgIGxhbWJkYUZ1bmN0aW9uOiBzeW5jS2V5c1RvS3ZzLFxuICAgICAgICBwYXlsb2FkOiBzZm4uVGFza0lucHV0LmZyb21PYmplY3Qoe1xuICAgICAgICAgIGFjdGlvbixcbiAgICAgICAgICBleGVjdXRpb25JZDogc2ZuLkpzb25QYXRoLnN0cmluZ0F0KFwiJCQuRXhlY3V0aW9uLklkXCIpLFxuICAgICAgICB9KSxcbiAgICAgICAgcmVzdWx0UGF0aDogXCIkLnJvdGF0aW9uXCIsXG4gICAgICB9KTtcbiAgICAgIHRhc2suYWRkUmV0cnkoeyBlcnJvcnM6IFtcIlN0YXRlcy5UYXNrRmFpbGVkXCJdLCBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygyKSwgbWF4QXR0ZW1wdHM6IDYsIGJhY2tvZmZSYXRlOiAyIH0pO1xuICAgICAgcmV0dXJuIHRhc2s7XG4gICAgfTtcbiAgICBjb25zdCBwcmVwYXJlS2V5ID0gcm90YXRpb25UYXNrKFwiUHJlcGFyZVNpZ25pbmdLZXlcIiwgXCJwcmVwYXJlXCIpO1xuICAgIGNvbnN0IHdhaXRGb3JFZGdlID0gbmV3IHNmbi5XYWl0KHRoaXMsIFwiV2FpdEZvckVkZ2VQcm9wYWdhdGlvblwiLCB7XG4gICAgICB0aW1lOiBzZm4uV2FpdFRpbWUudGltZXN0YW1wUGF0aChcIiQucm90YXRpb24uUGF5bG9hZC5wcm9wYWdhdGlvblJlYWR5VGltZXN0YW1wXCIpLFxuICAgIH0pO1xuICAgIGNvbnN0IHByb21vdGVLZXkgPSByb3RhdGlvblRhc2soXCJQcm9tb3RlTWludEtleVwiLCBcInByb21vdGVcIik7XG4gICAgY29uc3QgZmluYWxpemVPdmVybGFwID0gcm90YXRpb25UYXNrKFwiRmluYWxpemVPdmVybGFwXCIsIFwiZmluYWxpemVcIik7XG4gICAgY29uc3Qgd2FpdEZvck92ZXJsYXAgPSBuZXcgc2ZuLldhaXQodGhpcywgXCJXYWl0Rm9yT3ZlcmxhcFwiLCB7XG4gICAgICB0aW1lOiBzZm4uV2FpdFRpbWUudGltZXN0YW1wUGF0aChcIiQucm90YXRpb24uUGF5bG9hZC5jbGVhbnVwVGltZXN0YW1wXCIpLFxuICAgIH0pO1xuICAgIGNvbnN0IGNsZWFudXBLZXkgPSByb3RhdGlvblRhc2soXCJSZW1vdmVQcmV2aW91c0tleVwiLCBcImNsZWFudXBcIik7XG4gICAgY29uc3Qgcm90YXRpb25Xb3JrZmxvdyA9IG5ldyBzZm4uU3RhdGVNYWNoaW5lKHRoaXMsIFwiS2V5Um90YXRpb25Xb3JrZmxvd1wiLCB7XG4gICAgICBzdGF0ZU1hY2hpbmVOYW1lOiBgJHtBd3MuU1RBQ0tfTkFNRX1fUm90YXRlS2V5c2AsXG4gICAgICBkZWZpbml0aW9uQm9keTogc2ZuLkRlZmluaXRpb25Cb2R5LmZyb21DaGFpbmFibGUoXG4gICAgICAgIHByZXBhcmVLZXkubmV4dCh3YWl0Rm9yRWRnZSkubmV4dChwcm9tb3RlS2V5KS5uZXh0KGZpbmFsaXplT3ZlcmxhcCkubmV4dCh3YWl0Rm9yT3ZlcmxhcCkubmV4dChjbGVhbnVwS2V5KVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIEtlZXAgZGlzYWJsZWQgdW50aWwgdGhlIHVwZGF0ZWQgdmFsaWRhdG9ycyBhbmQgbWludHMgYXJlIHZlcmlmaWVkLlxuICAgIGNvbnN0IHJvdGF0aW9uU2NoZWR1bGUgPSBjb25maWcubWFpbi5yb3RhdGlvbkZyZXF1ZW5jeSB8fCBcIjMwZFwiO1xuICAgIGNvbnN0IHJvdGF0aW9uUmF0ZSA9IHRoaXMucGFyc2VSb3RhdGlvblJhdGUocm90YXRpb25TY2hlZHVsZSk7XG4gICAgbmV3IGV2ZW50cy5SdWxlKHRoaXMsIFwiS2V5Um90YXRpb25TY2hlZHVsZVwiLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUocm90YXRpb25SYXRlKSxcbiAgICAgIGVuYWJsZWQ6IGNvbmZpZy5tYWluLnJvdGF0aW9uRW5hYmxlZCA9PT0gdHJ1ZSxcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5TZm5TdGF0ZU1hY2hpbmUocm90YXRpb25Xb3JrZmxvdyldLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiQ1RBQVBJXCIsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBcIkNUQSBUb2tlbiBBUElcIixcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIENPUlMgaGVhZGVycyB0byBBUEkgR2F0ZXdheSdzIGRlZmF1bHQgZ2F0ZXdheSByZXNwb25zZXMgc28gdGhhdFxuICAgIC8vIGludGVncmF0aW9uIGVycm9ycyAoZS5nLiBhIExhbWJkYSA1eHgvdGltZW91dCwgb3IgYSA0eHgpIHN0aWxsIGNhcnJ5XG4gICAgLy8gQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luLiBXaXRob3V0IHRoaXMsIGFuIGVycm9yZWQgcmVxdWVzdCByZXR1cm5zIGFcbiAgICAvLyByZXNwb25zZSB3aXRoIG5vIENPUlMgaGVhZGVyLCB3aGljaCBicm93c2VycyBzdXJmYWNlIGFzIGEgbWlzbGVhZGluZ1xuICAgIC8vIFwiYmxvY2tlZCBieSBDT1JTIHBvbGljeVwiIGVycm9yIHRoYXQgbWFza3MgdGhlIHJlYWwgc3RhdHVzIGNvZGUuXG4gICAgY29uc3QgY29yc1Jlc3BvbnNlSGVhZGVycyA9IHtcbiAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IFwiJyonXCIsXG4gICAgICBcIkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnNcIjogXCInKidcIixcbiAgICB9O1xuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoXCJEZWZhdWx0NFhYXCIsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNFhYLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiBjb3JzUmVzcG9uc2VIZWFkZXJzLFxuICAgIH0pO1xuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoXCJEZWZhdWx0NVhYXCIsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNVhYLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiBjb3JzUmVzcG9uc2VIZWFkZXJzLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdG9rZW5SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW5cIik7XG4gICAgdG9rZW5SZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdlbmVyYXRvcikpO1xuXG4gICAgY29uc3QgdG9rZW5QeXRob25SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW4tcHl0aG9uXCIpO1xuICAgIHRva2VuUHl0aG9uUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZW5lcmF0b3JQeXRob24pKTtcblxuICAgIGNvbnN0IHRva2VuUnVieVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0b2tlbi1ydWJ5XCIpO1xuICAgIHRva2VuUnVieVJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2VuZXJhdG9yUnVieSkpO1xuICAgIFxuICAgIGNvbnN0IHJldm9rZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJyZXZva2VcIik7XG4gICAgcmV2b2tlUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihyZXZva2VyKSk7XG5cbiAgICAvLyBXQUZ2MiBXZWIgQUNMIOKAlCByYXRlLWxpbWl0IFBPU1QgL2FwaS90b2tlbiBwZXIgc291cmNlIElQLlxuICAgIC8vOiBhdXRvbWF0ZWQtc2NyYXBpbmcgbWl0aWdhdGlvbi4gUmF0ZS1iYXNlZCBydWxlcyB1c2UgYVxuICAgIC8vIHJvbGxpbmcgNS1taW51dGUgd2luZG93OyAzMDAgcmVxLzVtaW4g4omIIDYwIHJlcS9taW4gcGVyIElQLCB3ZWxsXG4gICAgLy8gYWJvdmUgbGVnaXRpbWF0ZSBwbGF5ZXIgdHJhZmZpYyAobWludCBvbmNlIOKGkiAyaCBUVEwg4oaSIG5leHQgbWludClcbiAgICAvLyBidXQgdGlnaHQgZW5vdWdoIHRvIHN0b3AgYSBtaW50LXlvdXItb3duLXRva2VuIHNjcmFwZXIuXG4gICAgLy8gQmxvY2tlZCByZXF1ZXN0cyBnZXQgYSBjdXN0b20gNDI5IHJlc3BvbnNlIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgNDAzLlxuICAgIGNvbnN0IHJhdGVMaW1pdEJvZHkgPSBcIkNUQVdlYkFjbFJhdGVMaW1pdDQyOVwiO1xuICAgIGNvbnN0IHdlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgXCJDVEFXZWJBY2xcIiwge1xuICAgICAgbmFtZTogYCR7QXdzLlNUQUNLX05BTUV9LXRva2VuLXJhdGUtbGltaXRgLFxuICAgICAgZGVzY3JpcHRpb246IFwiUmF0ZS1saW1pdCBQT1NUIC9hcGkvdG9rZW4gdG8gbWl0aWdhdGUgYXV0b21hdGVkIENXVCBtaW50aW5nXCIsXG4gICAgICBzY29wZTogXCJDTE9VREZST05UXCIsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGAke0F3cy5TVEFDS19OQU1FfS13ZWItYWNsYCxcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21SZXNwb25zZUJvZGllczoge1xuICAgICAgICBbcmF0ZUxpbWl0Qm9keV06IHtcbiAgICAgICAgICBjb250ZW50VHlwZTogXCJBUFBMSUNBVElPTl9KU09OXCIsXG4gICAgICAgICAgY29udGVudDogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogXCJyYXRlX2xpbWl0ZWRcIiwgbWVzc2FnZTogXCJUb28gbWFueSB0b2tlbiBtaW50IHJlcXVlc3RzIGZyb20gdGhpcyBJUDsgdHJ5IGFnYWluIGluIGEgZmV3IG1pbnV0ZXMuXCIgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcnVsZXM6IFt7XG4gICAgICAgIG5hbWU6IFwiVG9rZW5NaW50UmF0ZUxpbWl0XCIsXG4gICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICBhY3Rpb246IHtcbiAgICAgICAgICBibG9jazoge1xuICAgICAgICAgICAgY3VzdG9tUmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgcmVzcG9uc2VDb2RlOiA0MjksXG4gICAgICAgICAgICAgIGN1c3RvbVJlc3BvbnNlQm9keUtleTogcmF0ZUxpbWl0Qm9keSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBsaW1pdDogMzAwLFxuICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogXCJJUFwiLFxuICAgICAgICAgICAgc2NvcGVEb3duU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiBcIlNUQVJUU19XSVRIXCIsXG4gICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiBcIi9hcGkvdG9rZW5cIixcbiAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbeyBwcmlvcml0eTogMCwgdHlwZTogXCJOT05FXCIgfV0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYCR7QXdzLlNUQUNLX05BTUV9LXRva2VuLXJhdGUtbGltaXRgLFxuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9XSxcbiAgICB9KTtcblxuICAgIC8vIERlbW8gd2Vic2l0ZSAoY29uZGl0aW9uYWwpXG4gICAgbGV0IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gICAgbGV0IGRlbW9CdWNrZXQ6IHMzLkJ1Y2tldCB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBkZW1vQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRlbW9XZWJzaXRlXCIsIHtcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURlbW9TaXRlXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChcInJlc291cmNlcy9kZW1vLXdlYnNpdGVcIildLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgICBwcnVuZTogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiQ1RBRGlzdHJpYnV0aW9uXCIsIHtcbiAgICAgICAgd2ViQWNsSWQ6IHdlYkFjbC5hdHRyQXJuLFxuICAgICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBIdHRwT3JpZ2luKFwiY2RuLm1lZGlhcGxheXBlbi5jb21cIiksXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsIFwiQ1RBQ2FjaGVQb2xpY3lcIiwge1xuICAgICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgICAgIFwiQ2xvdWRGcm9udC1WaWV3ZXItQ291bnRyeVwiXG4gICAgICAgICAgICApLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeTogbmV3IGNsb3VkZnJvbnQuUmVzcG9uc2VIZWFkZXJzUG9saWN5KHRoaXMsIFwiQ1RBQ29yc1Jlc3BvbnNlUG9saWN5XCIsIHtcbiAgICAgICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeU5hbWU6IGAke0F3cy5TVEFDS19OQU1FfS1DVEEtQ09SU2AsXG4gICAgICAgICAgICBjb3JzQmVoYXZpb3I6IHtcbiAgICAgICAgICAgICAgYWNjZXNzQ29udHJvbEFsbG93T3JpZ2luczogW1wiKlwiXSxcbiAgICAgICAgICAgICAgYWNjZXNzQ29udHJvbEFsbG93SGVhZGVyczogW1wiQ1RBLUNvbW1vbi1BY2Nlc3MtVG9rZW5cIiwgXCJDb250ZW50LVR5cGVcIl0sXG4gICAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2xBbGxvd01ldGhvZHM6IFtcIkdFVFwiLCBcIkhFQURcIiwgXCJPUFRJT05TXCJdLFxuICAgICAgICAgICAgICBhY2Nlc3NDb250cm9sRXhwb3NlSGVhZGVyczogW1wiQ1RBLUNvbW1vbi1BY2Nlc3MtVG9rZW5cIl0sXG4gICAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2xBbGxvd0NyZWRlbnRpYWxzOiBmYWxzZSxcbiAgICAgICAgICAgICAgYWNjZXNzQ29udHJvbE1heEFnZTogRHVyYXRpb24uaG91cnMoMjQpLFxuICAgICAgICAgICAgICBvcmlnaW5PdmVycmlkZTogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVJfRVhDRVBUX0hPU1RfSEVBREVSLFxuICAgICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbe1xuICAgICAgICAgICAgZnVuY3Rpb246IHZhbGlkYXRvcixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9XSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAgIFwiL2FwaS8qXCI6IHtcbiAgICAgICAgICAgIG9yaWdpbjogbmV3IFJlc3RBcGlPcmlnaW4oYXBpKSxcbiAgICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5BTExfVklFV0VSX0VYQ0VQVF9IT1NUX0hFQURFUixcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiL3dlYnNpdGUvKlwiOiB7XG4gICAgICAgICAgICBvcmlnaW46IFMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKGRlbW9CdWNrZXQpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgIH0gZWxzZSB7XG4gICAgICBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgXCJDVEFEaXN0cmlidXRpb25cIiwge1xuICAgICAgICB3ZWJBY2xJZDogd2ViQWNsLmF0dHJBcm4sXG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IFJlc3RBcGlPcmlnaW4oYXBpKSxcbiAgICAgICAgICBmdW5jdGlvbkFzc29jaWF0aW9uczogW3tcbiAgICAgICAgICAgIGZ1bmN0aW9uOiB2YWxpZGF0b3IsXG4gICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25FdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsXG4gICAgICAgICAgfV0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmRpc3RyaWJ1dGlvbiA9IGRpc3RyaWJ1dGlvbjtcbiAgICBpZiAoY29uZmlnLm1haW4uZW5hYmxlRGVtbykge1xuICAgICAgdGhpcy5kZW1vQnVja2V0ID0gZGVtb0J1Y2tldCE7XG4gICAgfVxuXG4gICAgLy8gLS0tIFJlYWwtVGltZSBMb2dnaW5nIHZpYSBLaW5lc2lzIC0tLVxuICAgIGNvbnN0IGxvZ1N0cmVhbSA9IG5ldyBraW5lc2lzLlN0cmVhbSh0aGlzLCBcIlJlYWx0aW1lTG9nU3RyZWFtXCIsIHtcbiAgICAgIHN0cmVhbU1vZGU6IGtpbmVzaXMuU3RyZWFtTW9kZS5PTl9ERU1BTkQsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IER1cmF0aW9uLmhvdXJzKDI0KSxcbiAgICB9KTtcbiAgICB0aGlzLmxvZ1N0cmVhbSA9IGxvZ1N0cmVhbTtcblxuICAgIGNvbnN0IGNmS2luZXNpc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDbG91ZEZyb250S2luZXNpc1JvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJjbG91ZGZyb250LmFtYXpvbmF3cy5jb21cIiksXG4gICAgfSk7XG4gICAgbG9nU3RyZWFtLmdyYW50V3JpdGUoY2ZLaW5lc2lzUm9sZSk7XG5cbiAgICBjb25zdCByZWFsdGltZUxvZ0NvbmZpZyA9IG5ldyBjbG91ZGZyb250LkNmblJlYWx0aW1lTG9nQ29uZmlnKHRoaXMsIFwiUmVhbHRpbWVMb2dDb25maWdcIiwge1xuICAgICAgbmFtZTogYCR7QXdzLlNUQUNLX05BTUV9LXJlYWx0aW1lLWxvZ3NgLFxuICAgICAgc2FtcGxpbmdSYXRlOiAxMDAsXG4gICAgICBlbmRQb2ludHM6IFt7XG4gICAgICAgIHN0cmVhbVR5cGU6IFwiS2luZXNpc1wiLFxuICAgICAgICBraW5lc2lzU3RyZWFtQ29uZmlnOiB7XG4gICAgICAgICAgcm9sZUFybjogY2ZLaW5lc2lzUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIHN0cmVhbUFybjogbG9nU3RyZWFtLnN0cmVhbUFybixcbiAgICAgICAgfSxcbiAgICAgIH1dLFxuICAgICAgZmllbGRzOiBbXG4gICAgICAgIFwidGltZXN0YW1wXCIsIFwiYy1pcFwiLCBcInNjLXN0YXR1c1wiLCBcImNzLXVyaS1zdGVtXCIsIFwiY3MtbWV0aG9kXCIsXG4gICAgICAgIFwiY3MtaG9zdFwiLCBcImNzLXVzZXItYWdlbnRcIiwgXCJzYy1ieXRlc1wiLCBcInRpbWUtdGFrZW5cIiwgXCJjLWNvdW50cnlcIixcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggcmVhbC10aW1lIGxvZ3MgdG8gdGhlIGRlZmF1bHQgY2FjaGUgYmVoYXZpb3JcbiAgICBjb25zdCBjZm5EaXN0ID0gZGlzdHJpYnV0aW9uLm5vZGUuZGVmYXVsdENoaWxkIGFzIGNsb3VkZnJvbnQuQ2ZuRGlzdHJpYnV0aW9uO1xuICAgIGNmbkRpc3QuYWRkUHJvcGVydHlPdmVycmlkZShcbiAgICAgIFwiRGlzdHJpYnV0aW9uQ29uZmlnLkRlZmF1bHRDYWNoZUJlaGF2aW9yLlJlYWx0aW1lTG9nQ29uZmlnQXJuXCIsXG4gICAgICByZWFsdGltZUxvZ0NvbmZpZy5hdHRyQXJuXG4gICAgKTtcblxuICAgIC8vIC0tLSBEYXNoYm9hcmQ6IGxpc3QgcmV2b2tlZCBzZXNzaW9ucyBmcm9tIEtWUyAtLS1cbiAgICBjb25zdCBsaXN0UmV2b2tlZCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJMaXN0UmV2b2tlZFwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwibGlzdF9yZXZva2VkLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgS1ZTX0FSTjogdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4gfSxcbiAgICB9KTtcbiAgICBsaXN0UmV2b2tlZC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkxpc3RLZXlzXCIsIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOkRlc2NyaWJlS2V5VmFsdWVTdG9yZVwiXSxcbiAgICAgIHJlc291cmNlczogW3RoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgL3Jldm9rZWQgdG8gdGhlIGV4aXN0aW5nIEFQSVxuICAgIGFwaS5yb290LmFkZFJlc291cmNlKFwicmV2b2tlZFwiKS5hZGRNZXRob2QoXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxpc3RSZXZva2VkKVxuICAgICk7XG5cbiAgICAvLyBEZXBsb3kgZGFzaGJvYXJkIEhUTUwgKGFsb25nc2lkZSBkZW1vIHNpdGUgaWYgZW5hYmxlZClcbiAgICBpZiAoY29uZmlnLm1haW4uZW5hYmxlRGVtbykge1xuICAgICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lEYXNoYm9hcmRcIiwge1xuICAgICAgICBzb3VyY2VzOiBbXG4gICAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KFwicmVzb3VyY2VzL2Rhc2hib2FyZFwiKSxcbiAgICAgICAgICBzM2RlcGxveS5Tb3VyY2UuZGF0YShcImNvbmZpZy5qc1wiLFxuICAgICAgICAgICAgYHdpbmRvdy5DVEFfQ09ORklHPXthcGlFbmRwb2ludDpcIiR7YXBpLnVybC5yZXBsYWNlKC9cXC8kLywnJyl9XCIsY2RuRG9tYWluOlwiaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfVwifTtgXG4gICAgICAgICAgKSxcbiAgICAgICAgXSxcbiAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGRlbW9CdWNrZXQhLFxuICAgICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogXCJ3ZWJzaXRlXCIsXG4gICAgICAgIHBydW5lOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIC0tLSBLVlMgQ2xlYW51cDogcHVyZ2UgZXhwaXJlZCByZXZvY2F0aW9ucyBvbiBhIHNjaGVkdWxlIC0tLVxuICAgIGNvbnN0IGt2c0NsZWFudXAgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiS3ZzQ2xlYW51cFwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwia3ZzX2NsZWFudXAuaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhXCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIGVudmlyb25tZW50OiB7IEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuLCBUVExfSE9VUlM6IFwiMjRcIiB9LFxuICAgIH0pO1xuICAgIGt2c0NsZWFudXAuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpMaXN0S2V5c1wiLCBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZWxldGVLZXlcIiwgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcbiAgICBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJLdnNDbGVhbnVwU2NoZWR1bGVcIiwge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKER1cmF0aW9uLmhvdXJzKDEpKSxcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihrdnNDbGVhbnVwKV0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkFQSUVuZHBvaW50XCIsIHsgXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vYXBpYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNUQSBBUEkgRW5kcG9pbnRcIlxuICAgIH0pO1xuICAgIFxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiRGVtb1dlYnNpdGVVcmxcIiwgeyBcbiAgICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9L3dlYnNpdGUvaW5kZXgtcGF0aC5odG1sYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIERlbW8gV2Vic2l0ZSDigJQgUGF0aCBUb2tlbiBNb2RlXCJcbiAgICAgIH0pO1xuICAgICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkRlbW9XZWJzaXRlSGVhZGVyVXJsXCIsIHsgXG4gICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS93ZWJzaXRlL2luZGV4LWhlYWRlci5odG1sYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIERlbW8gV2Vic2l0ZSDigJQgSGVhZGVyLU9ubHkgVG9rZW4gTW9kZVwiXG4gICAgICB9KTtcbiAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJEZW1vV2Vic2l0ZUh5YnJpZFVybFwiLCB7IFxuICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vd2Vic2l0ZS9pbmRleC1oeWJyaWQuaHRtbGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkNUQSBEZW1vIFdlYnNpdGUg4oCUIEh5YnJpZCAoUGF0aCBJbml0IOKGkiBIZWFkZXIgUmVuZXdhbClcIlxuICAgICAgfSk7XG4gICAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiRGFzaGJvYXJkVXJsXCIsIHsgXG4gICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS93ZWJzaXRlL2Rhc2hib2FyZC5odG1sYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiUmV2b2NhdGlvbiBEYXNoYm9hcmQgd2l0aCBCZWRyb2NrIFByb21wdCBFZGl0b3JcIlxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJLZXlWYWx1ZVN0b3JlSWRcIiwgeyBcbiAgICAgIHZhbHVlOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUlkLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIElEXCJcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJTZWNyZXRBcm5cIiwge1xuICAgICAgdmFsdWU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIHNpZ25pbmcgc2VjcmV0IEFSTlwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQ1RBU3RhbmRhcmRcIiwge1xuICAgICAgdmFsdWU6IFwiQ1RBLTUwMDctQlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiSW1wbGVtZW50ZWQgc3RhbmRhcmQgdmVyc2lvblwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUm90YXRpb25Xb3JrZmxvd1wiLCB7XG4gICAgICB2YWx1ZTogcm90YXRpb25Xb3JrZmxvdy5zdGF0ZU1hY2hpbmVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiS2V5IHJvdGF0aW9uIFN0ZXAgRnVuY3Rpb25zIHdvcmtmbG93XCJcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJXZWJBY2xBcm5cIiwge1xuICAgICAgdmFsdWU6IHdlYkFjbC5hdHRyQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiV0FGdjIgV2ViIEFDTCDigJQgcmF0ZS1saW1pdHMgUE9TVCAvYXBpL3Rva2VuXCJcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VSb3RhdGlvblJhdGUocmF0ZTogc3RyaW5nKTogRHVyYXRpb24ge1xuICAgIGNvbnN0IG1hdGNoID0gcmF0ZS5tYXRjaCgvXihcXGQrKShbbWhkXSkkLyk7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIER1cmF0aW9uLmRheXMoMzApO1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgIGNhc2UgJ20nOiByZXR1cm4gRHVyYXRpb24ubWludXRlcyh2YWx1ZSk7XG4gICAgICBjYXNlICdoJzogcmV0dXJuIER1cmF0aW9uLmhvdXJzKHZhbHVlKTtcbiAgICAgIGNhc2UgJ2QnOiByZXR1cm4gRHVyYXRpb24uZGF5cyh2YWx1ZSk7XG4gICAgICBkZWZhdWx0OiByZXR1cm4gRHVyYXRpb24uZGF5cygzMCk7XG4gICAgfVxuICB9XG59XG4iXX0=