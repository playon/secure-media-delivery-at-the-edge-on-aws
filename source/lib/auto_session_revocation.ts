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
  Stack,
  RemovalPolicy,
  CfnOutput,
  Aws,
  aws_dynamodb as ddb,

} from 'aws-cdk-lib';


import { Construct } from 'constructs';
import { IConfiguration } from '../helpers/validators/configuration';
import { GetSessionsWorkflow } from './get_sessions_workflow';

export class AutoSessionRevocationStack extends Stack {

  constructor(scope: Construct, id: string, configuration: IConfiguration) {
    super(scope, id);



    //TODO use input parameter for the following values
    const cloudFrontAccessLogsBucketName = configuration.sessionRevocation?.s3_logs_bucket_name || "undefined";

    const athenaDatabaseName = "secure_media_athena_database"
    const athenaTableName = 'secure_media_athena_table'

    const accountId = Stack.of(this).account

    const ddbTable = new ddb.Table(this, "CompromisedSessions",{
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name: "sessionid", type: ddb.AttributeType.STRING},
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY
    })


    new GetSessionsWorkflow(this, 'GetSessions',{
      accountId: accountId,
      athenaDatabaseName: athenaDatabaseName,
      athenaTableName: athenaTableName,
      logsBucketName: cloudFrontAccessLogsBucketName,
      dynamodbTable: ddbTable,
      configuration: configuration

    })

    new CfnOutput(this, "TableName",{
      value: ddbTable.tableName,
      exportName: Aws.STACK_NAME + 'TableName',
      description: 'DynamoDB table name used to keep sessions to be invalidated'
    })



  }
}