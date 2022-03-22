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
import { aws_cloudwatch as cloudwatch } from 'aws-cdk-lib';
import { Dashboard } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
/**
 * The properties expected by the config construct.
 */
export interface ICoreConfigProps {
    cfFunctionName: string;
    rotateSecretsWorkflowArn: string;
}
export interface IApiConfigProps {
    lambdaFunctionName: string;
    region: string;
}
export declare class CWDashboard extends Construct {
    readonly dashboard: Dashboard;
    private readonly EXECUTION_SUCCEEDED;
    private readonly EXECUTION_SUCCEEDED_LABEL;
    private readonly EXECUTION_FAILED;
    private readonly EXECUTION_FAILED_LABEL;
    constructor(scope: Construct, id: string);
    buildCoreDashboard(props: ICoreConfigProps): void;
    buildApiDashboard(props: IApiConfigProps): void;
    sumSfnMetricSucceeded(resourceArn: string): cloudwatch.Metric;
    sumSfnMetricFails(resourceArn: string): cloudwatch.Metric;
    sumSfnMetric(resourceArn: string, metricName: string, label: string): cloudwatch.Metric;
}
