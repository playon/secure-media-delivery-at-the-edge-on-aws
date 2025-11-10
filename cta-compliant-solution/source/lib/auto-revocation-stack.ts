import {
  Stack,
  StackProps,
  Duration,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_lambda as lambda,
  aws_events as events,
  aws_events_targets as targets,
  aws_dynamodb as ddb,
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
  aws_iam as iam,
} from "aws-cdk-lib";

import { Construct } from "constructs";

export interface AutoRevocationStackProps extends StackProps {
  readonly kvStore: cloudfront.KeyValueStore;
  readonly config: any;
}

export class AutoRevocationStack extends Stack {
  
  constructor(scope: Construct, id: string, props: AutoRevocationStackProps) {
    super(scope, id, props);

    const config = props.config;
    const bedrockRegion = config.bedrock?.region || this.region;
    const bedrockModel = config.bedrock?.model || "amazon.nova-pro-v1:0";
    const frequency = this.parseFrequency(config.main.revocationFrequency);

    // DynamoDB for session tracking
    const sessionsTable = new ddb.Table(this, "SessionsTable", {
      partitionKey: { name: "session_id", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
    });

    // S3 for Athena queries
    const queryBucket = new s3.Bucket(this, "AthenaQueryBucket");

    // Lambda functions
    const prepareQuery = new lambda.Function(this, "PrepareQuery", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "prepare_query.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.minutes(1),
      environment: {
        QUERY_BUCKET: queryBucket.bucketName,
      },
    });

    const bedrockAnalyzer = new lambda.Function(this, "BedrockAnalyzer", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "bedrock_analyzer.handler", 
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.minutes(10),
      environment: {
        BEDROCK_REGION: bedrockRegion,
        BEDROCK_MODEL: bedrockModel,
      },
    });

    const updateRevocations = new lambda.Function(this, "UpdateRevocations", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "update_revocations.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.minutes(2),
      environment: {
        KVS_ID: props.kvStore.keyValueStoreId,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
    });

    // Permissions
    queryBucket.grantReadWrite(prepareQuery);
    sessionsTable.grantReadWriteData(updateRevocations);
    props.kvStore.grant(updateRevocations, "cloudfront:UpdateKeyValueStore");
    
    // Bedrock permissions
    bedrockAnalyzer.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["bedrock:InvokeModel"],
      resources: [`arn:aws:bedrock:${bedrockRegion}::foundation-model/${bedrockModel}`],
    }));

    bedrockAnalyzer.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["athena:GetQueryResults", "athena:GetQueryExecution"],
      resources: ["*"],
    }));

    // Step Functions workflow
    const workflow = new tasks.LambdaInvoke(this, "PrepareQueryTask", {
      lambdaFunction: prepareQuery,
      outputPath: "$.Payload",
    }).next(new tasks.LambdaInvoke(this, "BedrockAnalysisTask", {
      lambdaFunction: bedrockAnalyzer,
      outputPath: "$.Payload",
    })).next(new tasks.LambdaInvoke(this, "UpdateRevocationsTask", {
      lambdaFunction: updateRevocations,
      outputPath: "$.Payload",
    }));

    const stateMachine = new sfn.StateMachine(this, "BedrockAutoRevocationWorkflow", {
      definition: workflow,
      timeout: Duration.minutes(20),
      comment: `AI-powered revocation using ${bedrockModel}`,
    });

    // EventBridge schedule
    new events.Rule(this, "BedrockRevocationSchedule", {
      schedule: events.Schedule.rate(frequency),
      targets: [new targets.SfnStateMachine(stateMachine)],
    });
  }

  private parseFrequency(freq: string): Duration {
    const match = freq.match(/^(\d+)([mh])$/);
    if (!match) return Duration.minutes(10);
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return unit === 'h' ? Duration.hours(value) : Duration.minutes(value);
  }
}
