import {
  Stack,
  StackProps,
  Aws,
  RemovalPolicy,
  Duration,
  CfnOutput,
  aws_cloudfront as cloudfront,
  aws_lambda as lambda,
  aws_apigateway as apigateway,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
} from "aws-cdk-lib";

import { Construct } from "constructs";

export interface CTASecureMediaStackProps extends StackProps {
  readonly config: any;
}

export class CTASecureMediaStack extends Stack {
  public readonly kvStore: cloudfront.KeyValueStore;
  
  constructor(scope: Construct, id: string, props: CTASecureMediaStackProps) {
    super(scope, id, props);

    const config = props.config;

    // CTA signing key (Secrets Manager)
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
      keyValueStore: this.kvStore,
    });

    // Token generator
    const generator = new lambda.Function(this, "CTAGenerator", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "cta_token_generator.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      environment: { SECRET_NAME: signingSecret.secretName },
    });

    // Token revocation handler
    const revoker = new lambda.Function(this, "CTARevoker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "cta_revocation.handler", 
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      environment: { KVS_ID: this.kvStore.keyValueStoreId },
    });

    signingSecret.grantRead(generator);
    this.kvStore.grant(revoker, "cloudfront:UpdateKeyValueStore");

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
    
    const revokeResource = api.root.addResource("revoke");
    revokeResource.addMethod("POST", new apigateway.LambdaIntegration(revoker));

    // Demo website (conditional)
    let distribution: cloudfront.Distribution;
    
    if (config.main.enableDemo) {
      const demoBucket = new s3.Bucket(this, "DemoWebsite", {
        websiteIndexDocument: "index.html",
        publicReadAccess: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      new s3deploy.BucketDeployment(this, "DeployDemoSite", {
        sources: [s3deploy.Source.asset("resources/demo-website")],
        destinationBucket: demoBucket,
      });

      distribution = new cloudfront.Distribution(this, "CTADistribution", {
        defaultBehavior: {
          origin: new cloudfront.S3Origin(demoBucket),
          functionAssociations: [{
            function: validator,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
        },
        additionalBehaviors: {
          "/api/*": {
            origin: new cloudfront.RestApiOrigin(api),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          },
        },
      });
    } else {
      // API-only distribution
      distribution = new cloudfront.Distribution(this, "CTADistribution", {
        defaultBehavior: {
          origin: new cloudfront.RestApiOrigin(api),
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
      new CfnOutput(this, "DemoWebsite", { 
        value: `https://${distribution.distributionDomainName}`,
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
  }
}
