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
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
export interface IConfigProps {
    table: ITable;
    configuration: IConfiguration;
}
export declare class LoadAssetsTable extends Construct {
    constructor(scope: Construct, id: string, props: IConfigProps);
    private generateItems;
}
