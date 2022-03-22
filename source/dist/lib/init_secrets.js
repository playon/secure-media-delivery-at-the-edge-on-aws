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
exports.InitSecrets = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
class InitSecrets extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const role = new aws_cdk_lib_1.aws_iam.Role(this, "Role1", {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
        });
        role.addToPolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["lambda:InvokeFunction"],
            resources: [props.functionArn],
        }));
        new aws_cdk_lib_1.custom_resources.AwsCustomResource(this, "rotateSecrets", {
            onCreate: {
                service: "Lambda",
                action: "invoke",
                parameters: {
                    FunctionName: props.functionName,
                    Payload: `{"initialize": true}`,
                },
                physicalResourceId: aws_cdk_lib_1.custom_resources.PhysicalResourceId.of("myResource1"),
            },
            onUpdate: {
                service: "Lambda",
                action: "invoke",
                parameters: {
                    FunctionName: props.functionName,
                    Payload: `{"initialize": true}`,
                },
                physicalResourceId: aws_cdk_lib_1.custom_resources.PhysicalResourceId.of("myResource2"),
            },
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + '_InitSecretsSm',
            policy: aws_cdk_lib_1.custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [props.functionArn]
            }),
            role: role
        });
    }
}
exports.InitSecrets = InitSecrets;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5pdF9zZWNyZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2luaXRfc2VjcmV0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDZDQUlxQjtBQUVyQiwyQ0FBdUM7QUFPdkMsTUFBYSxXQUFZLFNBQVEsc0JBQVM7SUFFeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQjtRQUMzRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sSUFBSSxHQUFHLElBQUkscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUN2QyxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1NBQzVELENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxXQUFXLENBQ2QsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUscUJBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQztZQUNsQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO1NBQy9CLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSw4QkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzVELFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsUUFBUTtnQkFDakIsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLFVBQVUsRUFBRTtvQkFDVixZQUFZLEVBQUUsS0FBSyxDQUFDLFlBQVk7b0JBQ2hDLE9BQU8sRUFBRSxzQkFBc0I7aUJBQ2hDO2dCQUVELGtCQUFrQixFQUFFLDhCQUFnQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUM7YUFDMUU7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLFFBQVE7Z0JBQ2pCLE1BQU0sRUFBRSxRQUFRO2dCQUNoQixVQUFVLEVBQUU7b0JBQ1YsWUFBWSxFQUFFLEtBQUssQ0FBQyxZQUFZO29CQUNoQyxPQUFPLEVBQUUsc0JBQXNCO2lCQUNoQztnQkFFRCxrQkFBa0IsRUFBRSw4QkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDO2FBQzFFO1lBQ0QsWUFBWSxFQUFFLGlCQUFHLENBQUMsVUFBVSxHQUFHLGdCQUFnQjtZQUMvQyxNQUFNLEVBQUUsOEJBQWdCLENBQUMsdUJBQXVCLENBQUMsWUFBWSxDQUFDO2dCQUM1RCxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO2FBQy9CLENBQUM7WUFDRixJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FBQztJQUdMLENBQUM7Q0FFRjtBQS9DRCxrQ0ErQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqICBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKS4gWW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZVxuICogIHdpdGggdGhlIExpY2Vuc2UuIEEgY29weSBvZiB0aGUgTGljZW5zZSBpcyBsb2NhdGVkIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgb3IgaW4gdGhlICdsaWNlbnNlJyBmaWxlIGFjY29tcGFueWluZyB0aGlzIGZpbGUuIFRoaXMgZmlsZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAnQVMgSVMnIEJBU0lTLCBXSVRIT1VUIFdBUlJBTlRJRVNcbiAqICBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9uc1xuICogIGFuZCBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQge1xuICAgIEF3cyxcbiAgICBjdXN0b21fcmVzb3VyY2VzLFxuICAgIGF3c19pYW0gYXMgaWFtLFxufSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlnUHJvcHMge1xuICBmdW5jdGlvbkFybiA6IHN0cmluZztcbiAgZnVuY3Rpb25OYW1lOiBzdHJpbmc7XG4gfVxuXG5leHBvcnQgY2xhc3MgSW5pdFNlY3JldHMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJQ29uZmlnUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgcm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIlJvbGUxXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgfSk7XG4gICAgcm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLmZ1bmN0aW9uQXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIG5ldyBjdXN0b21fcmVzb3VyY2VzLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsIFwicm90YXRlU2VjcmV0c1wiLCB7XG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBzZXJ2aWNlOiBcIkxhbWJkYVwiLFxuICAgICAgICBhY3Rpb246IFwiaW52b2tlXCIsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IHByb3BzLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICBQYXlsb2FkOiBge1wiaW5pdGlhbGl6ZVwiOiB0cnVlfWAsXG4gICAgICAgIH0sXG5cbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjdXN0b21fcmVzb3VyY2VzLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihcIm15UmVzb3VyY2UxXCIpLFxuICAgICAgfSxcbiAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6IFwiTGFtYmRhXCIsXG4gICAgICAgIGFjdGlvbjogXCJpbnZva2VcIixcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogcHJvcHMuZnVuY3Rpb25OYW1lLFxuICAgICAgICAgIFBheWxvYWQ6IGB7XCJpbml0aWFsaXplXCI6IHRydWV9YCxcbiAgICAgICAgfSxcblxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGN1c3RvbV9yZXNvdXJjZXMuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKFwibXlSZXNvdXJjZTJcIiksXG4gICAgICB9LFxuICAgICAgZnVuY3Rpb25OYW1lOiBBd3MuU1RBQ0tfTkFNRSArICdfSW5pdFNlY3JldHNTbScsXG4gICAgICBwb2xpY3k6IGN1c3RvbV9yZXNvdXJjZXMuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuZnVuY3Rpb25Bcm5dXG4gICAgICB9KSxcbiAgICAgIHJvbGU6IHJvbGVcbiAgICB9KTtcblxuXG4gIH1cblxufVxuIl19