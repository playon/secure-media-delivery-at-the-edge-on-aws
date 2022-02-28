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
  aws_s3 as s3,
  aws_glue as glue,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface IConfigProps {

  logsBucketName: string,
  accountId:string,
  athenaDatabaseName: string,
  athenaTableName:string,

}

export class AthenaTable extends Construct {


  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);


    const accessLogsBucket = s3.Bucket.fromBucketName(this,'AccessLogsBucket',props.logsBucketName)

    //create an Athena database
    const myDatabase = new glue.CfnDatabase(this, "MyDatabase", {
        catalogId: props.accountId,
        databaseInput: {
            description: "Glue database " + props.athenaDatabaseName,
            name: props.athenaDatabaseName,
        }
      })

      const cloudfrontAthenaTable = new glue.CfnTable(this, "CfAaccessLogs", {
        catalogId: props.accountId,
        databaseName: props.athenaDatabaseName,
        tableInput: {
            name: props.athenaTableName,
            description: 'CloudFront access logs',
            tableType: 'EXTERNAL_TABLE',
            parameters:  {
                'skip.header.line.count': '2',
            },
            storageDescriptor: {
                location: "s3://"+accessLogsBucket.bucketName+"/",
                inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
                outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
                compressed: false,
                serdeInfo: {
                    serializationLibrary: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
                    parameters: {
                        'field.delim' : '	'
                    }
                  },
                columns: [
                    {name: 'date', type: 'date'},
                    {name: 'time', type: 'string'},
                    {name: 'location', type: 'string'},
                    {name: 'bytes', type: 'bigint'},
                    {name: 'request_ip', type: 'string'},
                    {name: 'method', type: 'string'},
                    {name: 'host', type: 'string'},
                    {name: 'uri', type: 'string'},
                    {name: 'status', type: 'string'},
                    {name: 'referer', type: 'string'},
                    {name: 'user_agent', type: 'string'},
                    {name: 'query_string', type: 'string'},
                    {name: 'cookie', type: 'string'},
                    {name: 'result_type', type: 'string'},
                    {name: 'request_id', type: 'string'},
                    {name: 'host_header', type: 'string'},
                    {name: 'request_protocol', type: 'string'},
                    {name: 'request_bytes', type: 'bigint'},
                    {name: 'time_taken', type: 'float'},
                    {name: 'xforwarded_for', type: 'string'},
                    {name: 'ssl_protocol', type: 'string'},
                    {name: 'ssl_cipher', type: 'string'},
                    {name: 'response_result_type', type: 'string'},
                    {name: 'http_version', type: 'string'},
                    {name: 'fle_status', type: 'string'},
                    {name: 'fle_encrypted_fields', type: 'int'},
                    {name: 'c_port', type: 'int'},
                    {name: 'time_to_first_byte', type: 'float'},
                    {name: 'x_edge_detailed_result_type', type: 'string'},
                    {name: 'sc_content_type', type: 'string'},
                    {name: 'sc_content_len', type: 'string'},
                    {name: 'sc_range_start', type: 'bigint'},
                    {name: 'sc_range_end', type: 'bigint'}
                ]
              },
          }
    })

    cloudfrontAthenaTable.node.addDependency(myDatabase)





  }
}