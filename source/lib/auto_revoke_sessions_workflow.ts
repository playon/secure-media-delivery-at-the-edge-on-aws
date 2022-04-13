/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  Duration,
  CfnOutput,
  Aws,
  RemovalPolicy,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_s3 as s3,
  aws_dynamodb as ddb,
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda as lambda,
  aws_iam as iam,


} from "aws-cdk-lib";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";


export interface IConfigProps {

  bucket: IBucket;
  dynamodbTable: ddb.ITable;
  configuration: IConfiguration;
}

export class AutoRevokeSessionsWorkflow extends Construct {
  constructor(scope: Construct, id: string, props: IConfigProps, params_filename: string) {
    super(scope, id);

    const submitAthenaQuery = new lambda.Function(this, "SubmitQuery", {
      functionName: Aws.STACK_NAME + "_SubmitQuery",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/submit_query"),
      handler: "index.lambda_handler",
      environment: {
        BUCKET_NAME : props.bucket.bucketName,
        PARAMS_FILENAME : params_filename
      },
    });

    submitAthenaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["athena:StartQueryExecution"],
        resources: [
          "arn:aws:athena:*:*:workgroup/*",
          "arn:aws:athena:*:*:datacatalog/*"
        ],
      })
    );
    props.bucket.grantRead(submitAthenaQuery);

    const prepareQueryJob = new tasks.LambdaInvoke(this, "Prepare Athena Query", {
      lambdaFunction: submitAthenaQuery,
    });

    const startQueryExecutionJob = new tasks.AthenaStartQueryExecution(
      this,
      "Start Athena Query",
      {
        queryString:  sfn.JsonPath.stringAt("$.Payload"),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        resultConfiguration: {
          outputLocation: {
            bucketName: props.bucket.bucketName,
            objectKey: "results",
          },
        },
      }
    );

    const getQueryResultsJob = new tasks.AthenaGetQueryResults(
      this,
      "Get Query Results",
      {
        queryExecutionId: sfn.JsonPath.stringAt(
          "$.QueryExecution.QueryExecutionId"
        ),
        resultPath: sfn.JsonPath.stringAt("$.GetQueryResults"),
      }
    );

    const sendToDdb = new tasks.DynamoPutItem(this, "Save to DynamoDB", {
      item: {
        sessionid: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[0].VarCharValue")
        ),
        type: tasks.DynamoAttributeValue.fromString('AUTO'),
        score: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[1].VarCharValue")
        ),
        ip_rate: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[2].VarCharValue")
        ),
        ip_penalty: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[3].VarCharValue")
        ),
        referer_penalty: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[4].VarCharValue")
        ),
        ua_penalty: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.Data[5].VarCharValue")
        ),
        //last_update: tasks.DynamoAttributeValue.fromString(
        //  sfn.JsonPath.stringAt("$.Data[5].VarCharValue")
        //),
        //TTL: tasks.DynamoAttributeValue.fromString(
        //  sfn.JsonPath.stringAt("$.Data[5].VarCharValue")
        //),
      },
      table: props.dynamodbTable,

      //inputPath: sfn.JsonPath.stringAt("$.Data[0].VarCharValue"),
    });

    const prepareNextParams = new sfn.Pass(this, "Prepare Next Query Params", {
      parameters: {
        "QueryExecutionId.$": "$.StartQueryParams.QueryExecutionId",
        "NextToken.$": "$.GetQueryResults.NextToken",
      },
      resultPath: sfn.JsonPath.stringAt("$.StartQueryParams"),
    });

    const hasMoreResults = new sfn.Choice(this, "Has More Results?")
      .when(
        sfn.Condition.isPresent("$.GetQueryResults.NextToken"),
        prepareNextParams.next(getQueryResultsJob)
      )
      .otherwise(new sfn.Succeed(this, "Done"));

    //Save_to_dynamodb
    const map = new sfn.Map(this, "Map State", {
      maxConcurrency: 1,
      inputPath: sfn.JsonPath.stringAt("$.GetQueryResults.ResultSet.Rows[1:]"),
      resultPath: sfn.JsonPath.DISCARD,
    });
    map.iterator(sendToDdb);

    // Step function to orchestrate Athena query and retrieving the results
    const workflow = new sfn.StateMachine(this, "AthenaQuery", {
      stateMachineName: Aws.STACK_NAME + "_DetectSessions",
      definition: prepareQueryJob
        .next(startQueryExecutionJob)
        .next(getQueryResultsJob)
        .next(map)
        .next(hasMoreResults),
      timeout: Duration.minutes(60),
    });

    const triggerFrequency =
      props.configuration.sessionRevocation?.trigger_workflow_frequency || 0;
    if (triggerFrequency > 0) {
      // Trigger Sfn to rotate the secrets every X minutes
      const rule = new events.Rule(this, "RuleInvalidateSessions", {
        schedule: events.Schedule.rate(Duration.minutes(triggerFrequency)),
        description: "Trigger StepFunction to detect sessions to invalidate",
        enabled: true,
      });

      rule.addTarget(new targets.SfnStateMachine(workflow));
    }

    new CfnOutput(this, "SessionInvalidateName", {
      value: workflow.stateMachineName,
      exportName: Aws.STACK_NAME + "StateMachineName",
      description: "State machine used to detect sessions to invalidate",
    });
  }
}
