"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CWDashboard = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
class CWDashboard extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        this.EXECUTION_SUCCEEDED = "ExecutionsSucceeded";
        this.EXECUTION_SUCCEEDED_LABEL = "Success";
        this.EXECUTION_FAILED = "ExecutionsFailed";
        this.EXECUTION_FAILED_LABEL = "Failure";
        this.dashboard = new aws_cdk_lib_1.aws_cloudwatch.Dashboard(this, "MonitoringDashboard", {
            dashboardName: aws_cdk_lib_1.Aws.STACK_NAME + +"-Secure-Media-Stream-Delivery",
        });
    }
    buildCoreDashboard(props) {
        const checkTokenWidget = new aws_cdk_lib_1.aws_cloudwatch.LogQueryWidget({
            logGroupNames: ["/aws/cloudfront/function/" + props.cfFunctionName],
            view: aws_cdk_lib_1.aws_cloudwatch.LogQueryVisualizationType.PIE,
            title: "Verify JWT token",
            width: 9,
            height: 6,
            queryLines: [
                "fields @timestamp, @message",
                "filter @message like /X_JWT_CHECK/",
                'parse "* * *" as a,b,result',
                "stats count(*) as RESULT by result as total",
            ]
        });
        const cffComputeUsageMetric = new aws_cdk_lib_1.aws_cloudwatch.Metric({
            namespace: "AWS/CloudFront",
            metricName: "FunctionComputeUtilization",
            period: aws_cdk_lib_1.Duration.minutes(5),
            dimensionsMap: { "FunctionName": props.cfFunctionName, "Region": "Global" },
            label: "Compute usage",
            statistic: "avg"
        });
        const cffInvocationsMetric = new aws_cdk_lib_1.aws_cloudwatch.Metric({
            namespace: "AWS/CloudFront",
            metricName: "FunctionInvocations",
            period: aws_cdk_lib_1.Duration.minutes(5),
            dimensionsMap: { "FunctionName": props.cfFunctionName, "Region": "Global" },
            label: "Invocations",
            statistic: "sum"
        });
        const computeUsageWidget = new aws_cdk_lib_1.aws_cloudwatch.GraphWidget({
            title: "Check JWT Token - Compute Utilization (Avg)",
            height: 6,
            width: 24,
            setPeriodToTimeRange: true,
            left: [
                cffComputeUsageMetric
            ]
        });
        const rotateSecretsWidget = new aws_cdk_lib_1.aws_cloudwatch.GraphWidget({
            title: "Rotate Secrets",
            view: aws_cdk_lib_1.aws_cloudwatch.GraphWidgetView.PIE,
            width: 9,
            height: 6,
            setPeriodToTimeRange: true,
            left: [
                this.sumSfnMetricFails(props.rotateSecretsWorkflowArn),
                this.sumSfnMetricSucceeded(props.rotateSecretsWorkflowArn),
            ]
        });
        const invocationsWidget = new aws_cdk_lib_1.aws_cloudwatch.GraphWidget({
            title: "Check JWT Token - Invocations (Sum)",
            height: 6,
            width: 24,
            stacked: true,
            setPeriodToTimeRange: true,
            left: [
                cffInvocationsMetric
            ]
        });
        const invocationsNbWidget = new aws_cdk_lib_1.aws_cloudwatch.SingleValueWidget({
            title: "Tokens checked",
            height: 6,
            width: 6,
            setPeriodToTimeRange: true,
            metrics: [
                cffInvocationsMetric
            ]
        });
        this.dashboard.addWidgets(checkTokenWidget, rotateSecretsWidget, invocationsNbWidget, computeUsageWidget, invocationsWidget);
    }
    buildApiDashboard(props) {
        const tokensGeneratedMetric = new aws_cdk_lib_1.aws_cloudwatch.Metric({
            namespace: "AWS/Lambda",
            metricName: "Invocations",
            period: aws_cdk_lib_1.Duration.minutes(5),
            dimensionsMap: { "FunctionName": props.lambdaFunctionName }
        });
        const invocationsNbWidget = new aws_cdk_lib_1.aws_cloudwatch.SingleValueWidget({
            title: "Nb of tokens generated",
            height: 6,
            width: 6,
            setPeriodToTimeRange: true,
            metrics: [
                tokensGeneratedMetric
            ]
        });
        const invocationsWidget = new aws_cdk_lib_1.aws_cloudwatch.GraphWidget({
            title: "Tokens generated",
            height: 6,
            width: 18,
            region: props.region,
            setPeriodToTimeRange: true,
            left: [
                tokensGeneratedMetric
            ]
        });
        this.dashboard.addWidgets(invocationsNbWidget, invocationsWidget);
    }
    sumSfnMetricSucceeded(resourceArn) {
        return this.sumSfnMetric(resourceArn, this.EXECUTION_SUCCEEDED, this.EXECUTION_SUCCEEDED_LABEL);
    }
    sumSfnMetricFails(resourceArn) {
        return this.sumSfnMetric(resourceArn, this.EXECUTION_FAILED, this.EXECUTION_FAILED_LABEL);
    }
    sumSfnMetric(resourceArn, metricName, label) {
        return new aws_cdk_lib_1.aws_cloudwatch.Metric({
            namespace: "AWS/States",
            metricName: metricName,
            period: aws_cdk_lib_1.Duration.minutes(5),
            dimensionsMap: { "StateMachineArn": resourceArn },
            label: label,
            statistic: "sum"
        });
    }
}
exports.CWDashboard = CWDashboard;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFzaGJvYXJkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2Rhc2hib2FyZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDZDQUlxQjtBQUdyQiwyQ0FBdUM7QUFnQnZDLE1BQWEsV0FBWSxTQUFRLHNCQUFTO0lBVXhDLFlBQVksS0FBZ0IsRUFBRSxFQUFVO1FBQ3RDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFQRix3QkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztRQUM1Qyw4QkFBeUIsR0FBRyxTQUFTLENBQUM7UUFDdEMscUJBQWdCLEdBQUcsa0JBQWtCLENBQUM7UUFDdEMsMkJBQXNCLEdBQUcsU0FBUyxDQUFDO1FBTWxELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSw0QkFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDckUsYUFBYSxFQUFFLGlCQUFHLENBQUMsVUFBVSxHQUFJLENBQUUsK0JBQStCO1NBQ25FLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxLQUF1QjtRQUV4QyxNQUFNLGdCQUFnQixHQUFHLElBQUksNEJBQVUsQ0FBQyxjQUFjLENBQUM7WUFDckQsYUFBYSxFQUFFLENBQUMsMkJBQTJCLEdBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQztZQUNqRSxJQUFJLEVBQUUsNEJBQVUsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHO1lBQzlDLEtBQUssRUFBRSxrQkFBa0I7WUFDekIsS0FBSyxFQUFFLENBQUM7WUFDUixNQUFNLEVBQUUsQ0FBQztZQUNULFVBQVUsRUFBRTtnQkFDUiw2QkFBNkI7Z0JBQzdCLG9DQUFvQztnQkFDcEMsNkJBQTZCO2dCQUM3Qiw2Q0FBNkM7YUFDaEQ7U0FDRixDQUFDLENBQUE7UUFFRixNQUFNLHFCQUFxQixHQUFHLElBQUksNEJBQVUsQ0FBQyxNQUFNLENBQUM7WUFDbEQsU0FB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QUFDLENBQUE7SUFFSixDQUFDO0NBR0Y7QUFuS0Qsa0NBbUtDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiAgQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIikuIFlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2VcbiAqICB3aXRoIHRoZSBMaWNlbnNlLiBBIGNvcHkgb2YgdGhlIExpY2Vuc2UgaXMgbG9jYXRlZCBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogIG9yIGluIHRoZSAnbGljZW5zZScgZmlsZSBhY2NvbXBhbnlpbmcgdGhpcyBmaWxlLiBUaGlzIGZpbGUgaXMgZGlzdHJpYnV0ZWQgb24gYW4gJ0FTIElTJyBCQVNJUywgV0lUSE9VVCBXQVJSQU5USUVTXG4gKiAgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZXhwcmVzcyBvciBpbXBsaWVkLiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnNcbiAqICBhbmQgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0IHtcbiAgRHVyYXRpb24sXG4gIEF3cyxcbiAgYXdzX2Nsb3Vkd2F0Y2ggYXMgY2xvdWR3YXRjaFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBEYXNoYm9hcmQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vKipcbiAqIFRoZSBwcm9wZXJ0aWVzIGV4cGVjdGVkIGJ5IHRoZSBjb25maWcgY29uc3RydWN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb3JlQ29uZmlnUHJvcHMge1xuICAgY2ZGdW5jdGlvbk5hbWUgOiBzdHJpbmc7XG4gICByb3RhdGVTZWNyZXRzV29ya2Zsb3dBcm4gOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFwaUNvbmZpZ1Byb3BzIHtcbiAgbGFtYmRhRnVuY3Rpb25OYW1lIDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcblxufVxuXG5leHBvcnQgY2xhc3MgQ1dEYXNoYm9hcmQgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuXG5cbiAgcHVibGljIHJlYWRvbmx5IGRhc2hib2FyZDogRGFzaGJvYXJkO1xuICBwcml2YXRlIHJlYWRvbmx5IEVYRUNVVElPTl9TVUNDRUVERUQgPSBcIkV4ZWN1dGlvbnNTdWNjZWVkZWRcIjtcbiAgcHJpdmF0ZSByZWFkb25seSBFWEVDVVRJT05fU1VDQ0VFREVEX0xBQkVMID0gXCJTdWNjZXNzXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgRVhFQ1VUSU9OX0ZBSUxFRCA9IFwiRXhlY3V0aW9uc0ZhaWxlZFwiO1xuICBwcml2YXRlIHJlYWRvbmx5IEVYRUNVVElPTl9GQUlMRURfTEFCRUwgPSBcIkZhaWx1cmVcIjtcblxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgdGhpcy5kYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgXCJNb25pdG9yaW5nRGFzaGJvYXJkXCIsIHtcbiAgICAgIGRhc2hib2FyZE5hbWU6IEF3cy5TVEFDS19OQU1FICsgICsgXCItU2VjdXJlLU1lZGlhLVN0cmVhbS1EZWxpdmVyeVwiLFxuICAgIH0pO1xuICB9XG5cbiAgYnVpbGRDb3JlRGFzaGJvYXJkKHByb3BzOiBJQ29yZUNvbmZpZ1Byb3BzKXtcblxuICAgIGNvbnN0IGNoZWNrVG9rZW5XaWRnZXQgPSBuZXcgY2xvdWR3YXRjaC5Mb2dRdWVyeVdpZGdldCh7XG4gICAgICBsb2dHcm91cE5hbWVzOiBbXCIvYXdzL2Nsb3VkZnJvbnQvZnVuY3Rpb24vXCIrcHJvcHMuY2ZGdW5jdGlvbk5hbWVdLFxuICAgICAgdmlldzogY2xvdWR3YXRjaC5Mb2dRdWVyeVZpc3VhbGl6YXRpb25UeXBlLlBJRSxcbiAgICAgIHRpdGxlOiBcIlZlcmlmeSBKV1QgdG9rZW5cIixcbiAgICAgIHdpZHRoOiA5LFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgcXVlcnlMaW5lczogW1xuICAgICAgICAgIFwiZmllbGRzIEB0aW1lc3RhbXAsIEBtZXNzYWdlXCIsXG4gICAgICAgICAgXCJmaWx0ZXIgQG1lc3NhZ2UgbGlrZSAvWF9KV1RfQ0hFQ0svXCIsXG4gICAgICAgICAgJ3BhcnNlIFwiKiAqICpcIiBhcyBhLGIscmVzdWx0JyxcbiAgICAgICAgICBcInN0YXRzIGNvdW50KCopIGFzIFJFU1VMVCBieSByZXN1bHQgYXMgdG90YWxcIixcbiAgICAgIF1cbiAgICB9KVxuXG4gICAgY29uc3QgY2ZmQ29tcHV0ZVVzYWdlTWV0cmljID0gbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgIG5hbWVzcGFjZTogXCJBV1MvQ2xvdWRGcm9udFwiLFxuICAgICAgbWV0cmljTmFtZTogXCJGdW5jdGlvbkNvbXB1dGVVdGlsaXphdGlvblwiLFxuICAgICAgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgZGltZW5zaW9uc01hcDogeyBcIkZ1bmN0aW9uTmFtZVwiOiBwcm9wcy5jZkZ1bmN0aW9uTmFtZSwgXCJSZWdpb25cIjogXCJHbG9iYWxcIiB9LFxuICAgICAgbGFiZWw6IFwiQ29tcHV0ZSB1c2FnZVwiLFxuICAgICAgc3RhdGlzdGljOiBcImF2Z1wiXG4gICAgfSlcblxuICAgIGNvbnN0IGNmZkludm9jYXRpb25zTWV0cmljID0gbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgIG5hbWVzcGFjZTogXCJBV1MvQ2xvdWRGcm9udFwiLFxuICAgICAgbWV0cmljTmFtZTogXCJGdW5jdGlvbkludm9jYXRpb25zXCIsXG4gICAgICBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBkaW1lbnNpb25zTWFwOiB7IFwiRnVuY3Rpb25OYW1lXCI6IHByb3BzLmNmRnVuY3Rpb25OYW1lLCBcIlJlZ2lvblwiOiBcIkdsb2JhbFwiIH0sXG4gICAgICBsYWJlbDogXCJJbnZvY2F0aW9uc1wiLFxuICAgICAgc3RhdGlzdGljOiBcInN1bVwiXG4gICAgfSlcblxuICAgIGNvbnN0IGNvbXB1dGVVc2FnZVdpZGdldCA9IG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgIHRpdGxlOiBcIkNoZWNrIEpXVCBUb2tlbiAtIENvbXB1dGUgVXRpbGl6YXRpb24gKEF2ZylcIixcbiAgICAgIGhlaWdodDogNixcbiAgICAgIHdpZHRoOiAyNCxcbiAgICAgIHNldFBlcmlvZFRvVGltZVJhbmdlOiB0cnVlLFxuICAgICAgbGVmdDogW1xuICAgICAgICAgIGNmZkNvbXB1dGVVc2FnZU1ldHJpY1xuICAgICAgXVxuICAgIH0pXG5cbiAgICBjb25zdCByb3RhdGVTZWNyZXRzV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgdGl0bGU6IFwiUm90YXRlIFNlY3JldHNcIixcbiAgICAgIHZpZXc6IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXRWaWV3LlBJRSxcbiAgICAgIHdpZHRoOiA5LFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgc2V0UGVyaW9kVG9UaW1lUmFuZ2U6IHRydWUsXG4gICAgICBsZWZ0OiBbXG4gICAgICAgICAgdGhpcy5zdW1TZm5NZXRyaWNGYWlscyhwcm9wcy5yb3RhdGVTZWNyZXRzV29ya2Zsb3dBcm4pLFxuICAgICAgICAgIHRoaXMuc3VtU2ZuTWV0cmljU3VjY2VlZGVkKHByb3BzLnJvdGF0ZVNlY3JldHNXb3JrZmxvd0FybiksXG4gICAgICBdXG4gICAgfSlcblxuICAgIGNvbnN0IGludm9jYXRpb25zV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgdGl0bGU6IFwiQ2hlY2sgSldUIFRva2VuIC0gSW52b2NhdGlvbnMgKFN1bSlcIixcbiAgICAgIGhlaWdodDogNixcbiAgICAgIHdpZHRoOiAyNCxcbiAgICAgIHN0YWNrZWQ6IHRydWUsXG4gICAgICBzZXRQZXJpb2RUb1RpbWVSYW5nZTogdHJ1ZSxcbiAgICAgIGxlZnQ6IFtcbiAgICAgICAgICBjZmZJbnZvY2F0aW9uc01ldHJpY1xuICAgICAgXVxuICAgIH0pXG5cbiAgICBjb25zdCBpbnZvY2F0aW9uc05iV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guU2luZ2xlVmFsdWVXaWRnZXQoe1xuICAgICAgdGl0bGU6IFwiVG9rZW5zIGNoZWNrZWRcIixcbiAgICAgIGhlaWdodDogNixcbiAgICAgIHdpZHRoOiA2LFxuICAgICAgc2V0UGVyaW9kVG9UaW1lUmFuZ2U6IHRydWUsXG4gICAgICBtZXRyaWNzOiBbXG4gICAgICAgIGNmZkludm9jYXRpb25zTWV0cmljXG4gICAgICBdXG4gICAgfSlcblxuICAgIHRoaXMuZGFzaGJvYXJkLmFkZFdpZGdldHMoXG4gICAgICBjaGVja1Rva2VuV2lkZ2V0LFxuICAgICAgcm90YXRlU2VjcmV0c1dpZGdldCxcbiAgICAgIGludm9jYXRpb25zTmJXaWRnZXQsXG4gICAgICBjb21wdXRlVXNhZ2VXaWRnZXQsXG4gICAgICBpbnZvY2F0aW9uc1dpZGdldFxuICAgIClcblxuXG4gIH1cblxuICBidWlsZEFwaURhc2hib2FyZChwcm9wczogSUFwaUNvbmZpZ1Byb3BzKXtcblxuICAgIGNvbnN0IHRva2Vuc0dlbmVyYXRlZE1ldHJpYyA9IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICBuYW1lc3BhY2U6IFwiQVdTL0xhbWJkYVwiLFxuICAgICAgbWV0cmljTmFtZTogXCJJbnZvY2F0aW9uc1wiLFxuICAgICAgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgZGltZW5zaW9uc01hcDogeyBcIkZ1bmN0aW9uTmFtZVwiOiBwcm9wcy5sYW1iZGFGdW5jdGlvbk5hbWUgfVxuICAgIH0pXG5cbiAgICBjb25zdCBpbnZvY2F0aW9uc05iV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guU2luZ2xlVmFsdWVXaWRnZXQoe1xuICAgICAgdGl0bGU6IFwiTmIgb2YgdG9rZW5zIGdlbmVyYXRlZFwiLFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgd2lkdGg6IDYsXG4gICAgICBzZXRQZXJpb2RUb1RpbWVSYW5nZTogdHJ1ZSxcbiAgICAgIG1ldHJpY3M6IFtcbiAgICAgICAgdG9rZW5zR2VuZXJhdGVkTWV0cmljXG4gICAgICBdXG4gICAgfSlcblxuICAgIGNvbnN0IGludm9jYXRpb25zV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgdGl0bGU6IFwiVG9rZW5zIGdlbmVyYXRlZFwiLFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgd2lkdGg6IDE4LFxuICAgICAgcmVnaW9uOiBwcm9wcy5yZWdpb24sXG4gICAgICBzZXRQZXJpb2RUb1RpbWVSYW5nZTogdHJ1ZSxcbiAgICAgIGxlZnQ6IFtcbiAgICAgICAgdG9rZW5zR2VuZXJhdGVkTWV0cmljXG4gICAgICBdXG4gICAgfSlcblxuICAgIHRoaXMuZGFzaGJvYXJkLmFkZFdpZGdldHMoaW52b2NhdGlvbnNOYldpZGdldCwgaW52b2NhdGlvbnNXaWRnZXQpXG5cblxuICB9XG5cbiAgc3VtU2ZuTWV0cmljU3VjY2VlZGVkKHJlc291cmNlQXJuOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5zdW1TZm5NZXRyaWMocmVzb3VyY2VBcm4sIHRoaXMuRVhFQ1VUSU9OX1NVQ0NFRURFRCwgdGhpcy5FWEVDVVRJT05fU1VDQ0VFREVEX0xBQkVMKVxuICB9XG5cbiAgc3VtU2ZuTWV0cmljRmFpbHMocmVzb3VyY2VBcm46IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnN1bVNmbk1ldHJpYyhyZXNvdXJjZUFybiwgdGhpcy5FWEVDVVRJT05fRkFJTEVELCB0aGlzLkVYRUNVVElPTl9GQUlMRURfTEFCRUwpXG4gIH1cblxuICBzdW1TZm5NZXRyaWMocmVzb3VyY2VBcm46IHN0cmluZywgbWV0cmljTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG5cbiAgICByZXR1cm4gbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgIG5hbWVzcGFjZTogXCJBV1MvU3RhdGVzXCIsXG4gICAgICBtZXRyaWNOYW1lOiBtZXRyaWNOYW1lLFxuICAgICAgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgZGltZW5zaW9uc01hcDogeyBcIlN0YXRlTWFjaGluZUFyblwiOiByZXNvdXJjZUFybn0sXG4gICAgICBsYWJlbDogbGFiZWwsXG4gICAgICBzdGF0aXN0aWM6IFwic3VtXCJcbiAgICB9KVxuXG4gIH1cblxuXG59Il19