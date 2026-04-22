import {
  Stack,
  StackProps,
  Aws,
  RemovalPolicy,
  Duration,
  CfnOutput,
  CfnParameter,
  CustomResource,
  aws_cloudfront as cloudfront,
  aws_lambda as lambda,
  aws_apigateway as apigateway,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_iam as iam,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_events as events,
  aws_events_targets as targets,
  custom_resources,
} from "aws-cdk-lib";

import { HttpOrigin, RestApiOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

export interface CTASecureMediaStackProps extends StackProps {
  readonly config?: any;
}

export class CTASecureMediaStack extends Stack {
  public readonly kvStore: cloudfront.KeyValueStore;
  
  constructor(scope: Construct, id: string, props: CTASecureMediaStackProps = {}) {
    super(scope, id, props);

    const enableDemo = new CfnParameter(this, "EnableDemo", {
      type: "String",
      default: "true",
      allowedValues: ["true", "false"],
      description: "Deploy demo website",
    });

    const bedrockModel = new CfnParameter(this, "BedrockModel", {
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
    const signingSecret = new secretsmanager.Secret(this, "CTAKey", {
      generateSecretString: {
        secretStringTemplate: '{"algorithm":"HMAC-SHA256"}',
        generateStringKey: "signingKey",
        passwordLength: 64,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // CloudFront KeyValueStore for revocation
    this.kvStore = new cloudfront.KeyValueStore(this, "CTARevocationStore", {
      comment: "CTA token revocation list",
    });

    // CTA validator function
    const validator = new cloudfront.Function(this, "CTAValidator", {
      code: cloudfront.FunctionCode.fromFile({ filePath: "lambda/cta_token_validator.js" }),
      functionName: `${Aws.STACK_NAME}-CTA-Validator`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      keyValueStore: this.kvStore,
    });

    // Token generator (Node SDK)
    const generator = new lambda.Function(this, "CTAGenerator", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "cta_token_generator.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      environment: { SECRET_NAME: signingSecret.secretName },
    });

    // Token generator (Python SDK)
    const generatorPython = new lambda.Function(this, "CTAGeneratorPython", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "handler.handler",
      code: lambda.Code.fromAsset("lambda-python"),
      timeout: Duration.seconds(10),
      environment: { SECRET_NAME: signingSecret.secretName },
    });

    // Token generator (Ruby SDK)
    const generatorRuby = new lambda.Function(this, "CTAGeneratorRuby", {
      runtime: lambda.Runtime.RUBY_3_3,
      handler: "handler.handler",
      code: lambda.Code.fromAsset("lambda-ruby"),
      timeout: Duration.seconds(10),
      environment: { SECRET_NAME: signingSecret.secretName },
    });

    // Token revocation handler
    const revoker = new lambda.Function(this, "CTARevoker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "cta_revocation.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      environment: { KVS_ARN: this.kvStore.keyValueStoreArn },
    });

    signingSecret.grantRead(generator);
    signingSecret.grantRead(generatorPython);
    signingSecret.grantRead(generatorRuby);

    // Grant KVS update permission via IAM policy
    revoker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["cloudfront-keyvaluestore:PutKey", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
      resources: [this.kvStore.keyValueStoreArn],
    }));

    // --- Key sync Lambda (custom resource + rotation) ---
    const syncKeysToKvs = new lambda.Function(this, "SyncKeysToKvs", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/sync_keys"),
      timeout: Duration.seconds(30),
      environment: {
        SECRET_NAME: signingSecret.secretName,
        KVS_ARN: this.kvStore.keyValueStoreArn,
      },
    });

    signingSecret.grantRead(syncKeysToKvs);
    signingSecret.grantWrite(syncKeysToKvs);
    syncKeysToKvs.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "cloudfront-keyvaluestore:PutKey",
        "cloudfront-keyvaluestore:DescribeKeyValueStore",
      ],
      resources: [this.kvStore.keyValueStoreArn],
    }));

    // Custom resource: sync key to KVS on deploy
    const keySyncProvider = new custom_resources.Provider(this, "KeySyncProvider", {
      onEventHandler: syncKeysToKvs,
    });

    new CustomResource(this, "KeySyncResource", {
      serviceToken: keySyncProvider.serviceToken,
      properties: {
        // Force update on each deploy to ensure key is synced
        Timestamp: Date.now().toString(),
      },
    });

    // --- Key rotation workflow ---
    const rotateKeyTask = new tasks.LambdaInvoke(this, "RotateSigningKey", {
      lambdaFunction: syncKeysToKvs,
      payload: sfn.TaskInput.fromObject({ rotate: true }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const rotationWorkflow = new sfn.StateMachine(this, "KeyRotationWorkflow", {
      stateMachineName: `${Aws.STACK_NAME}_RotateKeys`,
      definitionBody: sfn.DefinitionBody.fromChainable(rotateKeyTask),
      timeout: Duration.minutes(5),
    });

    // Rotate keys monthly by default
    const rotationSchedule = config.main.rotationFrequency || "30d";
    const rotationRate = this.parseRotationRate(rotationSchedule);
    new events.Rule(this, "KeyRotationSchedule", {
      schedule: events.Schedule.rate(rotationRate),
      targets: [new targets.SfnStateMachine(rotationWorkflow)],
    });

    // API Gateway
    const api = new apigateway.RestApi(this, "CTAAPI", {
      restApiName: "CTA Token API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const tokenResource = api.root.addResource("token");
    tokenResource.addMethod("POST", new apigateway.LambdaIntegration(generator));

    const tokenPythonResource = api.root.addResource("token-python");
    tokenPythonResource.addMethod("POST", new apigateway.LambdaIntegration(generatorPython));

    const tokenRubyResource = api.root.addResource("token-ruby");
    tokenRubyResource.addMethod("POST", new apigateway.LambdaIntegration(generatorRuby));
    
    const revokeResource = api.root.addResource("revoke");
    revokeResource.addMethod("POST", new apigateway.LambdaIntegration(revoker));

    // Demo website (conditional)
    let distribution: cloudfront.Distribution;
    
    if (config.main.enableDemo) {
      const demoBucket = new s3.Bucket(this, "DemoWebsite", {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

      new s3deploy.BucketDeployment(this, "DeployDemoSite", {
        sources: [s3deploy.Source.asset("resources/demo-website")],
        destinationBucket: demoBucket,
        destinationKeyPrefix: "website",
      });

      // Origin routing Lambda@Edge — routes /dash/* to Akamai, everything else to Mux
      // ---------------------------------------------------------------------------
      // Origin Router — Lambda@Edge (origin-request)
      //
      // This function runs after the CloudFront Function (viewer-request) has
      // validated and stripped the CTA path token. At this point the URI is a
      // clean content path like /x36xhzz/... (HLS) or /dash/akamai/... (DASH).
      //
      // Problem: CloudFront can only have one origin per cache behavior, but we
      // serve both HLS (test-streams.mux.dev) and DASH (dash.akamaized.net)
      // content through the default behavior (required for path-based tokens).
      //
      // Solution: This Lambda@Edge inspects the URI after token stripping and
      // dynamically rewrites the origin for DASH requests:
      //
      //   /x36xhzz/...           → default origin (test-streams.mux.dev)
      //   /dash/akamai/bbb_30fps → strip /dash, route to dash.akamaized.net
      //
      // The /dash prefix is a routing marker only — it's stripped before the
      // request reaches the Akamai origin, so the origin sees /akamai/bbb_30fps.
      // ---------------------------------------------------------------------------
      const originRouter = new lambda.Function(this, "OriginRouter", {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
          /**
           * Lambda@Edge Origin Router (origin-request event)
           *
           * Runs after the CTA validator CloudFront Function has:
           *   1. Validated the COSE MAC0 token
           *   2. Stripped the token from the URI path
           *
           * Routes requests to the correct upstream origin based on path:
           *   - /dash/*  → dash.akamaized.net (DASH content)
           *   - all else → default origin (HLS content on test-streams.mux.dev)
           *
           * For DASH requests, the /dash prefix is stripped so the origin
           * receives the correct path (e.g. /akamai/bbb_30fps/bbb_30fps.mpd).
           */
          exports.handler = async (event) => {
            const request = event.Records[0].cf.request;

            if (request.uri.startsWith('/dash/')) {
              // Strip the /dash routing prefix: /dash/akamai/... → /akamai/...
              request.uri = request.uri.substring(5);

              // Override the origin to Akamai's DASH CDN
              request.origin = {
                custom: {
                  domainName: 'dash.akamaized.net',
                  port: 443,
                  protocol: 'https',
                  path: '',
                  sslProtocols: ['TLSv1.2'],
                  readTimeout: 30,
                  keepaliveTimeout: 5,
                  customHeaders: {}
                }
              };

              // Set the Host header to match the new origin
              // (required for the origin to serve the correct content)
              request.headers['host'] = [{ key: 'host', value: 'dash.akamaized.net' }];
            }

            // HLS requests pass through unchanged to the default origin
            return request;
          };
        `),
      });

      distribution = new cloudfront.Distribution(this, "CTADistribution", {
        defaultBehavior: {
          origin: new HttpOrigin("test-streams.mux.dev"),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, "CTACachePolicy", {
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
              "CloudFront-Viewer-Country"
            ),
          }),
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [{
            function: validator,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
          edgeLambdas: [{
            functionVersion: originRouter.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
          }],
        },
        additionalBehaviors: {
          "/api/*": {
            origin: new RestApiOrigin(api),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          },
          "/website/*": {
            origin: S3BucketOrigin.withOriginAccessControl(demoBucket),
          },
        },
      });

      // Deploy config.js with runtime values (API endpoint, stream URL)
      const configBody = `window.CTA_CONFIG={apiEndpoint:"${api.url.replace(/\/$/,'')}",hlsUrl:"https://${distribution.distributionDomainName}/x36xhzz/x36xhzz.m3u8",hlsPath:"/x36xhzz/",dashUrl:"https://${distribution.distributionDomainName}/dash/akamai/bbb_30fps/bbb_30fps.mpd",dashPath:"/dash/"};`;
      new s3deploy.BucketDeployment(this, "DeployDemoConfig", {
        sources: [s3deploy.Source.data("config.js", configBody)],
        destinationBucket: demoBucket,
        destinationKeyPrefix: "website",
        prune: false,
      });
    } else {
      distribution = new cloudfront.Distribution(this, "CTADistribution", {
        defaultBehavior: {
          origin: new RestApiOrigin(api),
          functionAssociations: [{
            function: validator,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
        },
      });
    }

    // Outputs
    new CfnOutput(this, "APIEndpoint", { 
      value: `https://${distribution.distributionDomainName}/api`,
      description: "CTA API Endpoint"
    });
    
    if (config.main.enableDemo) {
      new CfnOutput(this, "DemoWebsiteUrl", { 
        value: `https://${distribution.distributionDomainName}/website/index.html`,
        description: "CTA Demo Website URL"
      });
    }
    
    new CfnOutput(this, "KeyValueStoreId", { 
      value: this.kvStore.keyValueStoreId,
      description: "CloudFront KeyValueStore ID"
    });

    new CfnOutput(this, "SecretArn", {
      value: signingSecret.secretArn,
      description: "CTA signing secret ARN"
    });

    new CfnOutput(this, "CTAStandard", {
      value: "CTA-5007-B",
      description: "Implemented standard version"
    });

    new CfnOutput(this, "RotationWorkflow", {
      value: rotationWorkflow.stateMachineName,
      description: "Key rotation Step Functions workflow"
    });
  }

  private parseRotationRate(rate: string): Duration {
    const match = rate.match(/^(\d+)([mhd])$/);
    if (!match) return Duration.days(30);
    const value = parseInt(match[1]);
    switch (match[2]) {
      case 'm': return Duration.minutes(value);
      case 'h': return Duration.hours(value);
      case 'd': return Duration.days(value);
      default: return Duration.days(30);
    }
  }
}
