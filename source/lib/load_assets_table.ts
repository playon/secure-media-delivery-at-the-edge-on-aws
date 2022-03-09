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
    custom_resources
} from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";


import { Construct } from "constructs";

export interface IConfigProps {
    table : ITable;
 }

export class LoadAssetsTable extends Construct {
  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    new custom_resources.AwsCustomResource(this, "initDBResource", {
      onCreate: {
        service: "DynamoDB",
        action: "putItem",
        parameters: {
          TableName: props.table.tableName,
          Item: this.generateItem(),
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of("initDBData"),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [props.table.tableArn],
      }),
    });


  }

  private generateItem = () => {
    return {
        "id":{
           "S":"1"
        },
        "url_path":{
           "S":"/v1/out/videoasset/manifest/index.m3u8"
        },
        "endpoint_hostname":{
           "S":"d12345678.cloudfront.net"
        },
        "token_policy":{
           "M":{
              "headers":{
                 "L":[
                    {
                       "S":"user-agent"
                    },
                    {
                       "S":"referer"
                    }
                 ]
              },
              "exc":{
                 "L":[
                    {
                       "S":"/ads/"
                    }
                 ]
              },
              "nbf":{
                 "S":"1645000000"
              },
              "session_auto_generate":{
                 "N":"12"
              },
              "cty_fallback":{
                 "BOOL":true
              },
              "paths":{
                 "L":[
                    {
                       "S":"/v1/out/videoasset/manifest/"
                    },
                    {
                       "S":"/v1/out/videoasset/segments/"
                    }
                 ]
              },
              "ip":{
                 "BOOL":true
              },
              "cty":{
                 "BOOL":false
              },
              "co_fallback":{
                 "BOOL":true
              },
              "co":{
                 "BOOL":true
              },
              "exp":{
                 "S":"+60m"
              }
           }
        }
     }

    };


}
