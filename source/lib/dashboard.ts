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
   rotateSecretsWorkflowName : string;


}

export class CWDashboard extends Construct {


  public readonly dashboard: Dashboard;



  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.dashboard = new cloudwatch.Dashboard(this, "MonitoringDashboard", {
      dashboardName: "SecureMediaStreamCoreModule",
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

    const rotateSecretsMetricFails = new cloudwatch.Metric({
      namespace: "AWS/States",
      metricName: "ExecutionsFailed",
      period: Duration.minutes(5),
      dimensionsMap: { "StateMachineArn": props.rotateSecretsWorkflowName},
      label: "Failure",
      statistic: "sum"
    })

    const rotateSecretsMetricSucceeded = new cloudwatch.Metric({
      namespace: "AWS/States",
      metricName: "ExecutionsSucceeded",
      period: Duration.minutes(5),
      dimensionsMap: { "StateMachineArn": props.rotateSecretsWorkflowName},
      label: "Success",
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
      //view: cloudwatch.LogQueryVisualizationType.PIE,
      width: 9,
      height: 8,
      setPeriodToTimeRange: true,
      left: [
          rotateSecretsMetricFails,
          rotateSecretsMetricSucceeded
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


}