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

import {
  Stack,
  StackProps,
  Duration,
  aws_kinesis as kinesis,
  aws_lambda as lambda,
  aws_lambda_event_sources as eventsources,
  aws_cloudfront as cloudfront,
  aws_iam as iam,
} from "aws-cdk-lib";

import { Construct } from "constructs";

export interface AutoRevocationStackProps extends StackProps {
  readonly kvStore: cloudfront.KeyValueStore;
  readonly logStream: kinesis.Stream;
  readonly config: any;
}

export class AutoRevocationStack extends Stack {

  constructor(scope: Construct, id: string, props: AutoRevocationStackProps) {
    super(scope, id, props);

    const config = props.config;
    const bedrockRegion = config.bedrock?.region || this.region;
    const bedrockModel = config.bedrock?.model || "amazon.nova-pro-v1:0";

    // Kinesis stream processor — aggregates sessions, calls Bedrock, revokes
    const analyzer = new lambda.Function(this, "KinesisAnalyzer", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "kinesis_analyzer.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        KVS_ARN: props.kvStore.keyValueStoreArn,
        BEDROCK_REGION: bedrockRegion,
        BEDROCK_MODEL: bedrockModel,
      },
    });

    // Consume the Kinesis stream from the main stack
    analyzer.addEventSource(new eventsources.KinesisEventSource(props.logStream, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 500,
      maxBatchingWindow: Duration.seconds(60),
      retryAttempts: 2,
    }));

    // Bedrock permissions
    analyzer.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [`arn:aws:bedrock:${bedrockRegion}::foundation-model/${bedrockModel}`],
    }));

    // KVS permissions for writing revocations
    analyzer.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cloudfront-keyvaluestore:PutKey", "cloudfront-keyvaluestore:DescribeKeyValueStore"],
      resources: [props.kvStore.keyValueStoreArn],
    }));
  }
}
