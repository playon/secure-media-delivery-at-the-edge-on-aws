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
exports.SecureMediaStreamingStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const api_1 = require("./api");
const dashboard_1 = require("./dashboard");
const rotate_secrets_workflow_1 = require("./rotate_secrets_workflow");
const secrets_1 = require("./secrets");
class SecureMediaStreamingStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, configuration, props) {
        super(scope, id, props);
        //if(configuration.sessionRevocation){
        //}
        // Create the Cloudfront Function used to check the JWT token
        const checkToken = new aws_cdk_lib_1.aws_cloudfront.Function(this, 'Function', {
            code: aws_cdk_lib_1.aws_cloudfront.FunctionCode.fromFile({ filePath: "lambda/generate_secret_update_cff/index.js" }),
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + '_checkJWTToken',
            comment: 'CloudFront Function used to check a JWT, part of Core Secure Media Stream Delivery'
        });
        const secrets = new secrets_1.Secrets(this, 'Secrets');
        const rotateSecretsWorkflow = new rotate_secrets_workflow_1.RotateSecretsWorkflow(this, 'RotateSecrets', {
            secrets: secrets,
            checkTokenFunction: checkToken,
            configuration: configuration
        });
        const dashboard = new dashboard_1.CWDashboard(this, 'CoreDashboard');
        dashboard.buildCoreDashboard({
            cfFunctionName: checkToken.functionName,
            rotateSecretsWorkflowArn: rotateSecretsWorkflow.workflowArn
        });
        if (configuration.api) {
            new api_1.Api(this, 'Api', configuration, secrets, dashboard);
        }
    }
}
exports.SecureMediaStreamingStack = SecureMediaStreamingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlX21lZGlhX3N0cmVhbV9zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9zZWN1cmVfbWVkaWFfc3RyZWFtX3N0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7R0FXRzs7O0FBRUgsNkNBS3FCO0FBS3JCLCtCQUE0QjtBQUM1QiwyQ0FBMEM7QUFDMUMsdUVBQWtFO0FBQ2xFLHVDQUFvQztBQUVwQyxNQUFhLHlCQUEwQixTQUFRLG1CQUFLO0lBQ2xELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsYUFBNkIsRUFBRSxLQUFrQjtRQUN6RixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixzQ0FBc0M7UUFDdEMsR0FBRztRQUVILDZEQUE2RDtRQUM3RCxNQUFNLFVBQVUsR0FBRyxJQUFJLDRCQUFVLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDM0QsSUFBSSxFQUFFLDRCQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSw0Q0FBNEMsRUFBRSxDQUFDO1lBQ2xHLFlBQVksRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxnQkFBZ0I7WUFDL0MsT0FBTyxFQUFFLG9GQUFvRjtTQUM5RixDQUFDLENBQUE7UUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLGlCQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFBO1FBRTVDLE1BQU0scUJBQXFCLEdBQUcsSUFBSSwrQ0FBcUIsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzdFLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLGtCQUFrQixFQUFFLFVBQVU7WUFDOUIsYUFBYSxFQUFFLGFBQWE7U0FDN0IsQ0FBRSxDQUFBO1FBRUgsTUFBTSxTQUFTLEdBQUcsSUFBSSx1QkFBVyxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQTtRQUN4RCxTQUFTLENBQUMsa0JBQWtCLENBQUM7WUFDM0IsY0FBYyxFQUFFLFVBQVUsQ0FBQyxZQUFZO1lBQ3ZDLHdCQUF3QixFQUFFLHFCQUFxQixDQUFDLFdBQVc7U0FDNUQsQ0FDQSxDQUFBO1FBRUQsSUFBRyxhQUFhLENBQUMsR0FBRyxFQUFDO1lBQ25CLElBQUksU0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQTtTQUN4RDtJQUdELENBQUM7Q0FFSjtBQXBDRCw4REFvQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqICBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKS4gWW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZVxuICogIHdpdGggdGhlIExpY2Vuc2UuIEEgY29weSBvZiB0aGUgTGljZW5zZSBpcyBsb2NhdGVkIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgb3IgaW4gdGhlICdsaWNlbnNlJyBmaWxlIGFjY29tcGFueWluZyB0aGlzIGZpbGUuIFRoaXMgZmlsZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAnQVMgSVMnIEJBU0lTLCBXSVRIT1VUIFdBUlJBTlRJRVNcbiAqICBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9uc1xuICogIGFuZCBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQge1xuICBTdGFjayxcbiAgU3RhY2tQcm9wcyxcbiAgQXdzLFxuICBhd3NfY2xvdWRmcm9udCBhcyBjbG91ZGZyb250XG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vaGVscGVycy92YWxpZGF0b3JzL2NvbmZpZ3VyYXRpb24nO1xuaW1wb3J0IHsgQXBpIH0gZnJvbSAnLi9hcGknO1xuaW1wb3J0IHsgQ1dEYXNoYm9hcmQgfSBmcm9tICcuL2Rhc2hib2FyZCc7XG5pbXBvcnQgeyBSb3RhdGVTZWNyZXRzV29ya2Zsb3cgfSBmcm9tICcuL3JvdGF0ZV9zZWNyZXRzX3dvcmtmbG93JztcbmltcG9ydCB7IFNlY3JldHMgfSBmcm9tICcuL3NlY3JldHMnO1xuXG5leHBvcnQgY2xhc3MgU2VjdXJlTWVkaWFTdHJlYW1pbmdTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb24sIHByb3BzPzogU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy9pZihjb25maWd1cmF0aW9uLnNlc3Npb25SZXZvY2F0aW9uKXtcbiAgICAvL31cblxuICAgIC8vIENyZWF0ZSB0aGUgQ2xvdWRmcm9udCBGdW5jdGlvbiB1c2VkIHRvIGNoZWNrIHRoZSBKV1QgdG9rZW5cbiAgICBjb25zdCBjaGVja1Rva2VuID0gbmV3IGNsb3VkZnJvbnQuRnVuY3Rpb24odGhpcywgJ0Z1bmN0aW9uJywge1xuICAgICAgY29kZTogY2xvdWRmcm9udC5GdW5jdGlvbkNvZGUuZnJvbUZpbGUoeyBmaWxlUGF0aDogXCJsYW1iZGEvZ2VuZXJhdGVfc2VjcmV0X3VwZGF0ZV9jZmYvaW5kZXguanNcIiB9KSxcbiAgICAgIGZ1bmN0aW9uTmFtZTogQXdzLlNUQUNLX05BTUUgKyAnX2NoZWNrSldUVG9rZW4nLFxuICAgICAgY29tbWVudDogJ0Nsb3VkRnJvbnQgRnVuY3Rpb24gdXNlZCB0byBjaGVjayBhIEpXVCwgcGFydCBvZiBDb3JlIFNlY3VyZSBNZWRpYSBTdHJlYW0gRGVsaXZlcnknXG4gICAgfSlcblxuICAgIGNvbnN0IHNlY3JldHMgPSBuZXcgU2VjcmV0cyh0aGlzLCAnU2VjcmV0cycpXG5cbiAgICBjb25zdCByb3RhdGVTZWNyZXRzV29ya2Zsb3cgPSBuZXcgUm90YXRlU2VjcmV0c1dvcmtmbG93KHRoaXMsICdSb3RhdGVTZWNyZXRzJywge1xuICAgICAgc2VjcmV0czogc2VjcmV0cyxcbiAgICAgIGNoZWNrVG9rZW5GdW5jdGlvbjogY2hlY2tUb2tlbixcbiAgICAgIGNvbmZpZ3VyYXRpb246IGNvbmZpZ3VyYXRpb25cbiAgICB9IClcblxuICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBDV0Rhc2hib2FyZCh0aGlzLCAnQ29yZURhc2hib2FyZCcpXG4gICAgZGFzaGJvYXJkLmJ1aWxkQ29yZURhc2hib2FyZCh7XG4gICAgICBjZkZ1bmN0aW9uTmFtZTogY2hlY2tUb2tlbi5mdW5jdGlvbk5hbWUsXG4gICAgICByb3RhdGVTZWNyZXRzV29ya2Zsb3dBcm46IHJvdGF0ZVNlY3JldHNXb3JrZmxvdy53b3JrZmxvd0FyblxuICAgIH1cbiAgICApXG5cbiAgICBpZihjb25maWd1cmF0aW9uLmFwaSl7XG4gICAgICBuZXcgQXBpKHRoaXMsICdBcGknLCBjb25maWd1cmF0aW9uLCBzZWNyZXRzLCBkYXNoYm9hcmQpXG4gICAgfVxuXG5cbiAgICB9XG5cbn0iXX0=