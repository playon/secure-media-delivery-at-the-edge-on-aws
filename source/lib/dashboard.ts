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
  aws_cloudwatch as cloudwatch
} from 'aws-cdk-lib';
import { Dashboard } from 'aws-cdk-lib/aws-cloudwatch';

import { Construct } from 'constructs';

/**
 * The properties expected by the config construct.
 */
 export interface IConfigProps {

   cfFunctionName : string;
   rotateSecretsWorkflowArn : string;


}

export class CWDashboard extends Construct {


  public readonly dashboard: Dashboard;
  private readonly EXECUTION_SUCCEEDED = "ExecutionsSucceeded";
  private readonly EXECUTION_SUCCEEDED_LABEL = "Success";
  private readonly EXECUTION_FAILED = "ExecutionsFailed";
  private readonly EXECUTION_FAILED_LABEL = "Failure";


  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.dashboard = new cloudwatch.Dashboard(this, "MonitoringDashboard", {
      dashboardName: "Secure-Media-Stream-Delivery",
    });
  }

  buildCoreDashboard(props: IConfigProps){

    const checkTokenWidget = new cloudwatch.LogQueryWidget({
      logGroupNames: ["/aws/cloudfront/function/"+props.cfFunctionName],
      view: cloudwatch.LogQueryVisualizationType.PIE,
      title: "Verify JWT token",
      width: 9,
      height: 8,
      queryLines: [
          "fields @timestamp, @message",
          "filter @message like /X_JWT_CHECK/",
          'parse "* * *" as a,b,result',
          "stats count(*) as RESULT by result as total",
      ]
    })

    const computeUsageMetric = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "FunctionComputeUtilization",
      period: Duration.minutes(5),
      dimensionsMap: { "FunctionName": props.cfFunctionName, "Region": "Global" },
      label: "Compute usage",
      statistic: "avg"
    })

    const nbTokensCheckedMetric = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "FunctionInvocations",
      period: Duration.minutes(5),
      dimensionsMap: { "FunctionName": props.cfFunctionName, "Region": "Global" },
      statistic: "sum"
    })

    const invocationsMetric = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "FunctionInvocations",
      period: Duration.minutes(5),
      dimensionsMap: { "FunctionName": props.cfFunctionName, "Region": "Global" },
      label: "Compute usage",
      statistic: "sum"
    })

    const computeUsageWidget = new cloudwatch.GraphWidget({
      title: "Check JWT Token Function - Compute Utilization (Avg)",
      height: 12,
      width: 24,
      setPeriodToTimeRange: true,
      left: [
          computeUsageMetric
      ]
    })

    const rotateSecretsWidget = new cloudwatch.GraphWidget({
      title: "Rotate Secrets",
      view: cloudwatch.GraphWidgetView.PIE,
      width: 9,
      height: 8,
      setPeriodToTimeRange: true,
      left: [
          this.sumSfnMetricFails(props.rotateSecretsWorkflowArn),
          this.sumSfnMetricSucceeded(props.rotateSecretsWorkflowArn),
      ]
    })

    const invocationsWidget = new cloudwatch.GraphWidget({
      title: "Check JWT Token Function - Invocations (Sum)",
      height: 12,
      width: 24,
      stacked: true,
      setPeriodToTimeRange: true,
      left: [
          invocationsMetric
      ]
    })

    const invocationsNbWidget = new cloudwatch.SingleValueWidget({
      title: "Tokens checked",
      height: 8,
      width: 6,
      setPeriodToTimeRange: true,
      metrics: [
          nbTokensCheckedMetric
      ]
    })

    this.dashboard.addWidgets(
      checkTokenWidget,
      rotateSecretsWidget,
      invocationsNbWidget,
      computeUsageWidget,
      invocationsWidget
    )


  }

  sumSfnMetricSucceeded(resourceArn: string) {
    return this.sumSfnMetric(resourceArn, this.EXECUTION_SUCCEEDED, this.EXECUTION_SUCCEEDED_LABEL)
  }

  sumSfnMetricFails(resourceArn: string) {
    return this.sumSfnMetric(resourceArn, this.EXECUTION_FAILED, this.EXECUTION_FAILED_LABEL)
  }

  sumSfnMetric(resourceArn: string, metricName: string, label: string) {

    return new cloudwatch.Metric({
      namespace: "AWS/States",
      metricName: metricName,
      period: Duration.minutes(5),
      dimensionsMap: { "StateMachineArn": resourceArn},
      label: label,
      statistic: "sum"
    })

  }


}