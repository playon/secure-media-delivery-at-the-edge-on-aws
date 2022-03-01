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
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_s3 as s3,
  aws_dynamodb as ddb,
  aws_events as events,
  aws_events_targets as targets,

} from 'aws-cdk-lib';

import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { AthenaTable } from './athena_table';



export interface IConfigProps {

  accountId:string,
  athenaDatabaseName: string,
  athenaTableName:string,
  logsBucketName: string,
  dynamodbTable: ddb.ITable,
  configuration: IConfiguration

}

export class GetSessionsWorkflow extends Construct {


  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    new AthenaTable(this, 'AthenaTable',{
          logsBucketName: props.logsBucketName,
          accountId: props.accountId,
          athenaDatabaseName: props.athenaDatabaseName,
          athenaTableName: props.athenaTableName
    })

    const resultsBucketName = new s3.Bucket(this, "ResultsBucket")

    const startQueryExecutionJob = new tasks.AthenaStartQueryExecution(this, "Start Athena Query", {
            queryString: "SELECT uri FROM " + props.athenaTableName + " limit 11",
            integrationPattern: sfn.IntegrationPattern.RUN_JOB,
            queryExecutionContext: {
                databaseName: props.athenaDatabaseName
            },
            resultConfiguration: {
                outputLocation: {
                    bucketName: resultsBucketName.bucketName,
                    objectKey: "results"
                }
            }
        })

    const getQueryResultsJob = new tasks.AthenaGetQueryResults(this, "Get Query Results",{
        queryExecutionId: sfn.JsonPath.stringAt("$.QueryExecution.QueryExecutionId"),
        resultPath: sfn.JsonPath.stringAt("$.GetQueryResults"),
    })

    const sendToDdb = new tasks.DynamoPutItem(this, "Save to DynamoDB",{
            item: {
                "sessionid": tasks.DynamoAttributeValue.fromString(
                    sfn.JsonPath.stringAt("$")),
            },
            table: props.dynamodbTable,
            inputPath: sfn.JsonPath.stringAt("$.Data[0].VarCharValue")
      })


    const prepareNextParams = new sfn.Pass(this, "Prepare Next Query Params",{
      parameters: {
          "QueryExecutionId.$": "$.StartQueryParams.QueryExecutionId",
          "NextToken.$": "$.GetQueryResults.NextToken"
      },
      resultPath: sfn.JsonPath.stringAt("$.StartQueryParams")
    })

    const hasMoreResults = new sfn.Choice(this, "Has More Results?").when(
      sfn.Condition.isPresent("$.GetQueryResults.NextToken"),
      prepareNextParams.next(getQueryResultsJob)
    ).otherwise(new sfn.Succeed(this, "Done"))

    //Save_to_dynamodb
    const map = new sfn.Map(this, "Map State",{
        maxConcurrency: 1,
        inputPath: sfn.JsonPath.stringAt("$.GetQueryResults.ResultSet.Rows[1:]"),
        resultPath: sfn.JsonPath.DISCARD
    })
    map.iterator(sendToDdb)


    // Step function to orchestrate Athena query and retrieving the results
    const workflow = new sfn.StateMachine(this, "AthenaQuery", {
          stateMachineName: Aws.STACK_NAME + "_DetectSessions",
            definition: startQueryExecutionJob.next(getQueryResultsJob).next(map).next(hasMoreResults),
            timeout: Duration.minutes(60)
    })

    const triggerFrequency = props.configuration.sessionRevocation?.trigger_workflow_frequency || 0;
    if (triggerFrequency > 0){
        // Trigger Sfn to rotate the secrets every X minutes
        const rule = new events.Rule(this, 'RuleInvalidateSessions',{
          schedule: events.Schedule.rate(Duration.minutes(triggerFrequency)),
          description: 'Trigger StepFunction to detect sessions to invalidate',
          enabled: true
        });

        rule.addTarget(new targets.SfnStateMachine(workflow));
    }


    new CfnOutput(this, "SessionInvalidateName",{
      value: workflow.stateMachineName,
      exportName: Aws.STACK_NAME + 'StateMachineName',
      description: 'State machine used to detect sessions to invalidate'
    })




  }
}