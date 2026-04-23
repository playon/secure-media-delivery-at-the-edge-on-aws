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
        if (config.main.enableDemo) {
            const demoBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, "DemoWebsite", {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3RhLXNlY3VyZS1tZWRpYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImN0YS1zZWN1cmUtbWVkaWEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBcUJxQjtBQUVyQiwrRUFBK0Y7QUFPL0YsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQUc1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLFFBQWtDLEVBQUU7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxVQUFVLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDdEQsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsTUFBTTtZQUNmLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUM7WUFDaEMsV0FBVyxFQUFFLHFCQUFxQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLDBCQUFZLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUMxRCxJQUFJLEVBQUUsUUFBUTtZQUNkLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IsYUFBYSxFQUFFLENBQUMsc0JBQXNCLEVBQUUsdUJBQXVCLENBQUM7WUFDaEUsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxJQUFJO1lBQzdCLElBQUksRUFBRTtnQkFDSixVQUFVLEVBQUUsVUFBVSxDQUFDLGFBQWEsS0FBSyxNQUFNO2FBQ2hEO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLEtBQUssRUFBRSxZQUFZLENBQUMsYUFBYTthQUNsQztTQUNGLENBQUM7UUFFRixrQkFBa0I7UUFDbEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzlELG9CQUFvQixFQUFF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WUFBWTtZQUNuQixXQUFXLEVBQUUsOEJBQThCO1NBQzVDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDdEMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLGdCQUFnQjtZQUN4QyxXQUFXLEVBQUUsc0NBQXNDO1NBQ3BELENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxJQUFZO1FBQ3BDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sc0JBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDakIsS0FBSyxHQUFHLENBQUMsQ0FBQyxPQUFPLHNCQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxzQkFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2QyxLQUFLLEdBQUcsQ0FBQyxDQUFDLE9BQU8sc0JBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEMsT0FBTyxDQUFDLENBQUMsT0FBTyxzQkFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBaFNELGtEQWdTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFN0YWNrLFxuICBTdGFja1Byb3BzLFxuICBBd3MsXG4gIFJlbW92YWxQb2xpY3ksXG4gIER1cmF0aW9uLFxuICBDZm5PdXRwdXQsXG4gIENmblBhcmFtZXRlcixcbiAgQ3VzdG9tUmVzb3VyY2UsXG4gIGF3c19jbG91ZGZyb250IGFzIGNsb3VkZnJvbnQsXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfYXBpZ2F0ZXdheSBhcyBhcGlnYXRld2F5LFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX3MzX2RlcGxveW1lbnQgYXMgczNkZXBsb3ksXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfc3RlcGZ1bmN0aW9ucyBhcyBzZm4sXG4gIGF3c19zdGVwZnVuY3Rpb25zX3Rhc2tzIGFzIHRhc2tzLFxuICBhd3NfZXZlbnRzIGFzIGV2ZW50cyxcbiAgYXdzX2V2ZW50c190YXJnZXRzIGFzIHRhcmdldHMsXG4gIGN1c3RvbV9yZXNvdXJjZXMsXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5pbXBvcnQgeyBIdHRwT3JpZ2luLCBSZXN0QXBpT3JpZ2luLCBTM0J1Y2tldE9yaWdpbiB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENUQVNlY3VyZU1lZGlhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICByZWFkb25seSBjb25maWc/OiBhbnk7XG59XG5cbmV4cG9ydCBjbGFzcyBDVEFTZWN1cmVNZWRpYVN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkga3ZTdG9yZTogY2xvdWRmcm9udC5LZXlWYWx1ZVN0b3JlO1xuICBcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENUQVNlY3VyZU1lZGlhU3RhY2tQcm9wcyA9IHt9KSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBlbmFibGVEZW1vID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCBcIkVuYWJsZURlbW9cIiwge1xuICAgICAgdHlwZTogXCJTdHJpbmdcIixcbiAgICAgIGRlZmF1bHQ6IFwidHJ1ZVwiLFxuICAgICAgYWxsb3dlZFZhbHVlczogW1widHJ1ZVwiLCBcImZhbHNlXCJdLFxuICAgICAgZGVzY3JpcHRpb246IFwiRGVwbG95IGRlbW8gd2Vic2l0ZVwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmVkcm9ja01vZGVsID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCBcIkJlZHJvY2tNb2RlbFwiLCB7XG4gICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgZGVmYXVsdDogXCJhbWF6b24ubm92YS1wcm8tdjE6MFwiLFxuICAgICAgYWxsb3dlZFZhbHVlczogW1wiYW1hem9uLm5vdmEtcHJvLXYxOjBcIiwgXCJhbWF6b24ubm92YS1saXRlLXYxOjBcIl0sXG4gICAgICBkZXNjcmlwdGlvbjogXCJCZWRyb2NrIG1vZGVsIGZvciBBSSBhbmFseXNpc1wiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29uZmlnID0gcHJvcHMuY29uZmlnIHx8IHtcbiAgICAgIG1haW46IHtcbiAgICAgICAgZW5hYmxlRGVtbzogZW5hYmxlRGVtby52YWx1ZUFzU3RyaW5nID09PSBcInRydWVcIixcbiAgICAgIH0sXG4gICAgICBiZWRyb2NrOiB7XG4gICAgICAgIG1vZGVsOiBiZWRyb2NrTW9kZWwudmFsdWVBc1N0cmluZyxcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gQ1RBIHNpZ25pbmcga2V5XG4gICAgY29uc3Qgc2lnbmluZ1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgXCJDVEFLZXlcIiwge1xuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6ICd7XCJhbGdvcml0aG1cIjpcIkhNQUMtU0hBMjU2XCJ9JyxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6IFwic2lnbmluZ0tleVwiLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIGZvciByZXZvY2F0aW9uXG4gICAgdGhpcy5rdlN0b3JlID0gbmV3IGNsb3VkZnJvbnQuS2V5VmFsdWVTdG9yZSh0aGlzLCBcIkNUQVJldm9jYXRpb25TdG9yZVwiLCB7XG4gICAgICBjb21tZW50OiBcIkNUQSB0b2tlbiByZXZvY2F0aW9uIGxpc3RcIixcbiAgICB9KTtcblxuICAgIC8vIENUQSB2YWxpZGF0b3IgZnVuY3Rpb25cbiAgICBjb25zdCB2YWxpZGF0b3IgPSBuZXcgY2xvdWRmcm9udC5GdW5jdGlvbih0aGlzLCBcIkNUQVZhbGlkYXRvclwiLCB7XG4gICAgICBjb2RlOiBjbG91ZGZyb250LkZ1bmN0aW9uQ29kZS5mcm9tRmlsZSh7IGZpbGVQYXRoOiBcImxhbWJkYS9jdGFfdG9rZW5fdmFsaWRhdG9yLmpzXCIgfSksXG4gICAgICBmdW5jdGlvbk5hbWU6IGAke0F3cy5TVEFDS19OQU1FfS1DVEEtVmFsaWRhdG9yYCxcbiAgICAgIHJ1bnRpbWU6IGNsb3VkZnJvbnQuRnVuY3Rpb25SdW50aW1lLkpTXzJfMCxcbiAgICAgIGtleVZhbHVlU3RvcmU6IHRoaXMua3ZTdG9yZSxcbiAgICB9KTtcblxuICAgIC8vIFRva2VuIGdlbmVyYXRvciAoTm9kZSBTREspXG4gICAgY29uc3QgZ2VuZXJhdG9yID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkNUQUdlbmVyYXRvclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwiY3RhX3Rva2VuX2dlbmVyYXRvci5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7IFNFQ1JFVF9OQU1FOiBzaWduaW5nU2VjcmV0LnNlY3JldE5hbWUgfSxcbiAgICB9KTtcblxuICAgIC8vIFRva2VuIGdlbmVyYXRvciAoUHl0aG9uIFNESylcbiAgICBjb25zdCBnZW5lcmF0b3JQeXRob24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQ1RBR2VuZXJhdG9yUHl0aG9uXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEzLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS1weXRob25cIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7IFNFQ1JFVF9OQU1FOiBzaWduaW5nU2VjcmV0LnNlY3JldE5hbWUgfSxcbiAgICB9KTtcblxuICAgIC8vIFRva2VuIGdlbmVyYXRvciAoUnVieSBTREspXG4gICAgY29uc3QgZ2VuZXJhdG9yUnVieSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDVEFHZW5lcmF0b3JSdWJ5XCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlJVQllfM18zLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS1ydWJ5XCIpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBTRUNSRVRfTkFNRTogc2lnbmluZ1NlY3JldC5zZWNyZXROYW1lIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUb2tlbiByZXZvY2F0aW9uIGhhbmRsZXJcbiAgICBjb25zdCByZXZva2VyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkNUQVJldm9rZXJcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImN0YV9yZXZvY2F0aW9uLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYVwiKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgS1ZTX0FSTjogdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm4gfSxcbiAgICB9KTtcblxuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKGdlbmVyYXRvcik7XG4gICAgc2lnbmluZ1NlY3JldC5ncmFudFJlYWQoZ2VuZXJhdG9yUHl0aG9uKTtcbiAgICBzaWduaW5nU2VjcmV0LmdyYW50UmVhZChnZW5lcmF0b3JSdWJ5KTtcblxuICAgIC8vIEdyYW50IEtWUyB1cGRhdGUgcGVybWlzc2lvbiB2aWEgSUFNIHBvbGljeVxuICAgIHJldm9rZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpQdXRLZXlcIiwgXCJjbG91ZGZyb250LWtleXZhbHVlc3RvcmU6RGVzY3JpYmVLZXlWYWx1ZVN0b3JlXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rdlN0b3JlLmtleVZhbHVlU3RvcmVBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIC0tLSBLZXkgc3luYyBMYW1iZGEgKGN1c3RvbSByZXNvdXJjZSArIHJvdGF0aW9uKSAtLS1cbiAgICBjb25zdCBzeW5jS2V5c1RvS3ZzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlN5bmNLZXlzVG9LdnNcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS9zeW5jX2tleXNcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVF9OQU1FOiBzaWduaW5nU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIEtWU19BUk46IHRoaXMua3ZTdG9yZS5rZXlWYWx1ZVN0b3JlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHN5bmNLZXlzVG9LdnMpO1xuICAgIHNpZ25pbmdTZWNyZXQuZ3JhbnRXcml0ZShzeW5jS2V5c1RvS3ZzKTtcbiAgICBzeW5jS2V5c1RvS3ZzLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIFwiY2xvdWRmcm9udC1rZXl2YWx1ZXN0b3JlOlB1dEtleVwiLFxuICAgICAgICBcImNsb3VkZnJvbnQta2V5dmFsdWVzdG9yZTpEZXNjcmliZUtleVZhbHVlU3RvcmVcIixcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFt0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUFybl0sXG4gICAgfSkpO1xuXG4gICAgLy8gQ3VzdG9tIHJlc291cmNlOiBzeW5jIGtleSB0byBLVlMgb24gZGVwbG95XG4gICAgY29uc3Qga2V5U3luY1Byb3ZpZGVyID0gbmV3IGN1c3RvbV9yZXNvdXJjZXMuUHJvdmlkZXIodGhpcywgXCJLZXlTeW5jUHJvdmlkZXJcIiwge1xuICAgICAgb25FdmVudEhhbmRsZXI6IHN5bmNLZXlzVG9LdnMsXG4gICAgfSk7XG5cbiAgICBuZXcgQ3VzdG9tUmVzb3VyY2UodGhpcywgXCJLZXlTeW5jUmVzb3VyY2VcIiwge1xuICAgICAgc2VydmljZVRva2VuOiBrZXlTeW5jUHJvdmlkZXIuc2VydmljZVRva2VuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAvLyBGb3JjZSB1cGRhdGUgb24gZWFjaCBkZXBsb3kgdG8gZW5zdXJlIGtleSBpcyBzeW5jZWRcbiAgICAgICAgVGltZXN0YW1wOiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gLS0tIEtleSByb3RhdGlvbiB3b3JrZmxvdyAtLS1cbiAgICBjb25zdCByb3RhdGVLZXlUYXNrID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCBcIlJvdGF0ZVNpZ25pbmdLZXlcIiwge1xuICAgICAgbGFtYmRhRnVuY3Rpb246IHN5bmNLZXlzVG9LdnMsXG4gICAgICBwYXlsb2FkOiBzZm4uVGFza0lucHV0LmZyb21PYmplY3QoeyByb3RhdGU6IHRydWUgfSksXG4gICAgICByZXN1bHRQYXRoOiBzZm4uSnNvblBhdGguRElTQ0FSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJvdGF0aW9uV29ya2Zsb3cgPSBuZXcgc2ZuLlN0YXRlTWFjaGluZSh0aGlzLCBcIktleVJvdGF0aW9uV29ya2Zsb3dcIiwge1xuICAgICAgc3RhdGVNYWNoaW5lTmFtZTogYCR7QXdzLlNUQUNLX05BTUV9X1JvdGF0ZUtleXNgLFxuICAgICAgZGVmaW5pdGlvbkJvZHk6IHNmbi5EZWZpbml0aW9uQm9keS5mcm9tQ2hhaW5hYmxlKHJvdGF0ZUtleVRhc2spLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICB9KTtcblxuICAgIC8vIFJvdGF0ZSBrZXlzIG1vbnRobHkgYnkgZGVmYXVsdFxuICAgIGNvbnN0IHJvdGF0aW9uU2NoZWR1bGUgPSBjb25maWcubWFpbi5yb3RhdGlvbkZyZXF1ZW5jeSB8fCBcIjMwZFwiO1xuICAgIGNvbnN0IHJvdGF0aW9uUmF0ZSA9IHRoaXMucGFyc2VSb3RhdGlvblJhdGUocm90YXRpb25TY2hlZHVsZSk7XG4gICAgbmV3IGV2ZW50cy5SdWxlKHRoaXMsIFwiS2V5Um90YXRpb25TY2hlZHVsZVwiLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUocm90YXRpb25SYXRlKSxcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5TZm5TdGF0ZU1hY2hpbmUocm90YXRpb25Xb3JrZmxvdyldLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiQ1RBQVBJXCIsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBcIkNUQSBUb2tlbiBBUElcIixcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdG9rZW5SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW5cIik7XG4gICAgdG9rZW5SZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdlbmVyYXRvcikpO1xuXG4gICAgY29uc3QgdG9rZW5QeXRob25SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwidG9rZW4tcHl0aG9uXCIpO1xuICAgIHRva2VuUHl0aG9uUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZW5lcmF0b3JQeXRob24pKTtcblxuICAgIGNvbnN0IHRva2VuUnVieVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0b2tlbi1ydWJ5XCIpO1xuICAgIHRva2VuUnVieVJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2VuZXJhdG9yUnVieSkpO1xuICAgIFxuICAgIGNvbnN0IHJldm9rZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJyZXZva2VcIik7XG4gICAgcmV2b2tlUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihyZXZva2VyKSk7XG5cbiAgICAvLyBEZW1vIHdlYnNpdGUgKGNvbmRpdGlvbmFsKVxuICAgIGxldCBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICAgIFxuICAgIGlmIChjb25maWcubWFpbi5lbmFibGVEZW1vKSB7XG4gICAgICBjb25zdCBkZW1vQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRlbW9XZWJzaXRlXCIsIHtcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURlbW9TaXRlXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChcInJlc291cmNlcy9kZW1vLXdlYnNpdGVcIildLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgfSk7XG5cbiAgICAgIGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCBcIkNUQURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IEh0dHBPcmlnaW4oXCJjZG4ubWVkaWFwbGF5cGVuLmNvbVwiKSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBjYWNoZVBvbGljeTogbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgXCJDVEFDYWNoZVBvbGljeVwiLCB7XG4gICAgICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdChcbiAgICAgICAgICAgICAgXCJDbG91ZEZyb250LVZpZXdlci1Db3VudHJ5XCJcbiAgICAgICAgICAgICksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVJfRVhDRVBUX0hPU1RfSEVBREVSLFxuICAgICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbe1xuICAgICAgICAgICAgZnVuY3Rpb246IHZhbGlkYXRvcixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9XSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAgIFwiL2FwaS8qXCI6IHtcbiAgICAgICAgICAgIG9yaWdpbjogbmV3IFJlc3RBcGlPcmlnaW4oYXBpKSxcbiAgICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5BTExfVklFV0VSX0VYQ0VQVF9IT1NUX0hFQURFUixcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiL3dlYnNpdGUvKlwiOiB7XG4gICAgICAgICAgICBvcmlnaW46IFMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKGRlbW9CdWNrZXQpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gRGVwbG95IGNvbmZpZy5qcyDigJQgb25seSBkZXBsb3ltZW50LXNwZWNpZmljIHZhbHVlcyAoZG9tYWluLCBBUEkgZW5kcG9pbnQpXG4gICAgICAvLyBTdHJlYW0gcGF0aHMgYXJlIGhhcmRjb2RlZCBpbiBpbmRleC5odG1sIHNpbmNlIHRoZXkgZG9uJ3QgY2hhbmdlIHBlciBzdGFja1xuICAgICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lEZW1vQ29uZmlnXCIsIHtcbiAgICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5kYXRhKFwiY29uZmlnLmpzXCIsXG4gICAgICAgICAgYHdpbmRvdy5DVEFfQ09ORklHPXthcGlFbmRwb2ludDpcIiR7YXBpLnVybC5yZXBsYWNlKC9cXC8kLywnJyl9XCIsY2RuRG9tYWluOlwiaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfVwifTtgXG4gICAgICAgICldLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogZGVtb0J1Y2tldCxcbiAgICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IFwid2Vic2l0ZVwiLFxuICAgICAgICBwcnVuZTogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiQ1RBRGlzdHJpYnV0aW9uXCIsIHtcbiAgICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgUmVzdEFwaU9yaWdpbihhcGkpLFxuICAgICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbe1xuICAgICAgICAgICAgZnVuY3Rpb246IHZhbGlkYXRvcixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9XSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQVBJRW5kcG9pbnRcIiwgeyBcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS9hcGlgLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIEFQSSBFbmRwb2ludFwiXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKGNvbmZpZy5tYWluLmVuYWJsZURlbW8pIHtcbiAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJEZW1vV2Vic2l0ZVVybFwiLCB7IFxuICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vd2Vic2l0ZS9pbmRleC5odG1sYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIERlbW8gV2Vic2l0ZSBVUkxcIlxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJLZXlWYWx1ZVN0b3JlSWRcIiwgeyBcbiAgICAgIHZhbHVlOiB0aGlzLmt2U3RvcmUua2V5VmFsdWVTdG9yZUlkLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBLZXlWYWx1ZVN0b3JlIElEXCJcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJTZWNyZXRBcm5cIiwge1xuICAgICAgdmFsdWU6IHNpZ25pbmdTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ1RBIHNpZ25pbmcgc2VjcmV0IEFSTlwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQ1RBU3RhbmRhcmRcIiwge1xuICAgICAgdmFsdWU6IFwiQ1RBLTUwMDctQlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiSW1wbGVtZW50ZWQgc3RhbmRhcmQgdmVyc2lvblwiXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUm90YXRpb25Xb3JrZmxvd1wiLCB7XG4gICAgICB2YWx1ZTogcm90YXRpb25Xb3JrZmxvdy5zdGF0ZU1hY2hpbmVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiS2V5IHJvdGF0aW9uIFN0ZXAgRnVuY3Rpb25zIHdvcmtmbG93XCJcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VSb3RhdGlvblJhdGUocmF0ZTogc3RyaW5nKTogRHVyYXRpb24ge1xuICAgIGNvbnN0IG1hdGNoID0gcmF0ZS5tYXRjaCgvXihcXGQrKShbbWhkXSkkLyk7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIER1cmF0aW9uLmRheXMoMzApO1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgIGNhc2UgJ20nOiByZXR1cm4gRHVyYXRpb24ubWludXRlcyh2YWx1ZSk7XG4gICAgICBjYXNlICdoJzogcmV0dXJuIER1cmF0aW9uLmhvdXJzKHZhbHVlKTtcbiAgICAgIGNhc2UgJ2QnOiByZXR1cm4gRHVyYXRpb24uZGF5cyh2YWx1ZSk7XG4gICAgICBkZWZhdWx0OiByZXR1cm4gRHVyYXRpb24uZGF5cygzMCk7XG4gICAgfVxuICB9XG59XG4iXX0=