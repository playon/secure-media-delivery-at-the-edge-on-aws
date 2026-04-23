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
  readonly distribution: cloudfront.Distribution;
  readonly config: any;
}

export class AutoRevocationStack extends Stack {

  constructor(scope: Construct, id: string, props: AutoRevocationStackProps) {
    super(scope, id, props);

    const config = props.config;
    const bedrockRegion = config.bedrock?.region || this.region;
    const bedrockModel = config.bedrock?.model || "amazon.nova-pro-v1:0";

    // --- Kinesis Data Stream for CloudFront real-time logs ---
    const logStream = new kinesis.Stream(this, "RealtimeLogStream", {
      streamName: `${this.stackName}-cf-realtime-logs`,
      shardCount: 1,
      retentionPeriod: Duration.hours(24),
    });

    // --- CloudFront Real-Time Log Configuration ---
    // Sends selected log fields to the Kinesis stream.
    // Fields chosen for session analysis: timestamp, IP, status, URI, method,
    // host, user-agent, bytes, time-taken, country.
    const realtimeLogConfig = new cloudfront.CfnRealtimeLogConfig(this, "RealtimeLogConfig", {
      name: `${this.stackName}-realtime-logs`,
      samplingRate: 100, // 100% of requests
      endPoints: [{
        streamType: "Kinesis",
        kinesisStreamConfig: {
          roleArn: new iam.Role(this, "CloudFrontKinesisRole", {
            assumedBy: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
            inlinePolicies: {
              kinesis: new iam.PolicyDocument({
                statements: [new iam.PolicyStatement({
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

    // Kinesis event source — process in batches for efficient aggregation
    analyzer.addEventSource(new eventsources.KinesisEventSource(logStream, {
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
