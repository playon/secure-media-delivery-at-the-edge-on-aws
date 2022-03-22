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
import { aws_cloudfront as cloudfront } from "aws-cdk-lib";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Secrets } from "./secrets";
/**
 * The properties expected by the config construct.
 */
export interface IConfigProps {
    secrets: Secrets;
    checkTokenFunction: cloudfront.IFunction;
    configuration: IConfiguration;
}
export declare class RotateSecretsWorkflow extends Construct {
    readonly workflowArn: string;
    constructor(scope: Construct, id: string, props: IConfigProps);
}
