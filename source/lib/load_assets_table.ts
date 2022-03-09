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
import * as fs from "fs";
import { IConfiguration } from "../helpers/validators/configuration";

export interface IConfigProps {
    table : ITable;
    configuration: IConfiguration;
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
          Item: this.generateItem(props.configuration),
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of("initDBData"),
      },
      onUpdate: {
        service: "DynamoDB",
        action: "putItem",
        parameters: {
          TableName: props.table.tableName,
          Item: this.generateItem(props.configuration),
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of("initDBData"),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [props.table.tableArn],
      }),
    });


  }

  private generateItem = (configuration: IConfiguration) => {

    if(configuration.api)
      console.log("api");

    //TODO to get this from the wizard
    const hostName = configuration.demo?.hostname!;
    const urlPath = configuration.demo?.url_path!;
    const ttl = configuration.demo?.ttl!;

    var fileContent = fs.readFileSync('resources/mock/assets.json').toString()
    fileContent = fileContent.replace('HOST_NAME', hostName)
    fileContent = fileContent.replace('URL_PATH', urlPath)
    fileContent = fileContent.replace('TTL', ttl)

    const item = JSON.parse(fileContent);
    return item;

    };


}
