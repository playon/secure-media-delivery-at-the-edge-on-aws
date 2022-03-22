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
exports.Secrets = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
class Secrets extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        const primarySecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, "Primary", {
            secretName: aws_cdk_lib_1.Aws.STACK_NAME + "_PrimarySecret",
            description: "Primary secret for Secure Media Stream Delivery",
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ "MY_PRIMARY_KEY": "" }),
                generateStringKey: "MY_PRIMARY_KEY"
            }
        });
        const secondarySecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, "Secondary", {
            secretName: aws_cdk_lib_1.Aws.STACK_NAME + "_SecondarySecret",
            description: "Secondary secret for Secure Media Stream Delivery",
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ "MY_SECONDARY_KEY": "" }),
                generateStringKey: "MY_SECONDARY_KEY"
            }
        });
        const temporarySecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, "Temporary", {
            secretName: aws_cdk_lib_1.Aws.STACK_NAME + "_TemporarySecret",
            description: "Temporary secret for Secure Media Stream Delivery",
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ "MY_TEMPORARY_KEY": "" }),
                generateStringKey: "MY_TEMPORARY_KEY"
            }
        });
        this.primarySecret = primarySecret;
        this.secondarySecret = secondarySecret;
        this.temporarySecret = temporarySecret;
        new aws_cdk_lib_1.CfnOutput(this, "PrimarySecret", {
            value: primarySecret.secretName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'PrimarySecret',
            description: 'The name of the PrimarySecret'
        });
        new aws_cdk_lib_1.CfnOutput(this, "SecondarySecret", {
            value: secondarySecret.secretName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'SecondarySecret',
            description: 'The name of the SecondarySecret'
        });
    }
}
exports.Secrets = Secrets;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9zZWNyZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7R0FXRzs7O0FBRUgsNkNBSXFCO0FBQ3JCLDJDQUF1QztBQUd2QyxNQUFhLE9BQVEsU0FBUSxzQkFBUztJQU1wQyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sYUFBYSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUMvRCxVQUFVLEVBQUUsaUJBQUcsQ0FBQyxVQUFVLEdBQUcsZ0JBQWdCO1lBQzdDLFdBQVcsRUFBRSxpREFBaUQ7WUFDOUQsb0JBQW9CLEVBQUU7Z0JBQ3BCLG9CQUFvQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLEVBQUUsQ0FBQztnQkFDOUQsaUJBQWlCLEVBQUUsZ0JBQWdCO2FBQ3BDO1NBQ0YsQ0FBQyxDQUFBO1FBRUYsTUFBTSxlQUFlLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO1lBQ25FLFVBQVUsRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxrQkFBa0I7WUFDL0MsV0FBVyxFQUFFLG1EQUFtRDtZQUNoRSxvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsRUFBRSxDQUFDO2dCQUNoRSxpQkFBaUIsRUFBRSxrQkFBa0I7YUFDdEM7U0FDRixDQUFDLENBQUE7UUFFRixNQUFNLGVBQWUsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkUsVUFBVSxFQUFFLGlCQUFHLENBQUMsVUFBVSxHQUFHLGtCQUFrQjtZQUMvQyxXQUFXLEVBQUUsbURBQW1EO1lBQ2hFLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ2hFLGlCQUFpQixFQUFFLGtCQUFrQjthQUN0QztTQUNGLENBQUMsQ0FBQTtRQUtGLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBRXZDLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxhQUFhLENBQUMsVUFBVTtZQUMvQixVQUFVLEVBQUUsaUJBQUcsQ0FBQyxVQUFVLEdBQUcsZUFBZTtZQUM1QyxXQUFXLEVBQUUsK0JBQStCO1NBQzdDLENBQUMsQ0FBQTtRQUVGLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDckMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxVQUFVO1lBQ2pDLFVBQVUsRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxpQkFBaUI7WUFDOUMsV0FBVyxFQUFFLGlDQUFpQztTQUMvQyxDQUFDLENBQUE7SUFLSixDQUFDO0NBQ0Y7QUEzREQsMEJBMkRDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiAgQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIikuIFlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2VcbiAqICB3aXRoIHRoZSBMaWNlbnNlLiBBIGNvcHkgb2YgdGhlIExpY2Vuc2UgaXMgbG9jYXRlZCBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogIG9yIGluIHRoZSAnbGljZW5zZScgZmlsZSBhY2NvbXBhbnlpbmcgdGhpcyBmaWxlLiBUaGlzIGZpbGUgaXMgZGlzdHJpYnV0ZWQgb24gYW4gJ0FTIElTJyBCQVNJUywgV0lUSE9VVCBXQVJSQU5USUVTXG4gKiAgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZXhwcmVzcyBvciBpbXBsaWVkLiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnNcbiAqICBhbmQgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0IHtcbiAgQXdzLFxuICBDZm5PdXRwdXQsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlclxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuXG5leHBvcnQgY2xhc3MgU2VjcmV0cyBleHRlbmRzIENvbnN0cnVjdCB7XG5cbiAgcHVibGljIHJlYWRvbmx5IHByaW1hcnlTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG4gIHB1YmxpYyByZWFkb25seSBzZWNvbmRhcnlTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG4gIHB1YmxpYyByZWFkb25seSB0ZW1wb3JhcnlTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBwcmltYXJ5U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCBcIlByaW1hcnlcIiwge1xuICAgICAgc2VjcmV0TmFtZTogQXdzLlNUQUNLX05BTUUgKyBcIl9QcmltYXJ5U2VjcmV0XCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJQcmltYXJ5IHNlY3JldCBmb3IgU2VjdXJlIE1lZGlhIFN0cmVhbSBEZWxpdmVyeVwiLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXCJNWV9QUklNQVJZX0tFWVwiOiBcIlwiIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogXCJNWV9QUklNQVJZX0tFWVwiXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IHNlY29uZGFyeVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgXCJTZWNvbmRhcnlcIiwge1xuICAgICAgc2VjcmV0TmFtZTogQXdzLlNUQUNLX05BTUUgKyBcIl9TZWNvbmRhcnlTZWNyZXRcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNlY29uZGFyeSBzZWNyZXQgZm9yIFNlY3VyZSBNZWRpYSBTdHJlYW0gRGVsaXZlcnlcIixcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IFwiTVlfU0VDT05EQVJZX0tFWVwiOiBcIlwiIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogXCJNWV9TRUNPTkRBUllfS0VZXCJcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3QgdGVtcG9yYXJ5U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCBcIlRlbXBvcmFyeVwiLCB7XG4gICAgICBzZWNyZXROYW1lOiBBd3MuU1RBQ0tfTkFNRSArIFwiX1RlbXBvcmFyeVNlY3JldFwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiVGVtcG9yYXJ5IHNlY3JldCBmb3IgU2VjdXJlIE1lZGlhIFN0cmVhbSBEZWxpdmVyeVwiLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXCJNWV9URU1QT1JBUllfS0VZXCI6IFwiXCIgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiBcIk1ZX1RFTVBPUkFSWV9LRVlcIlxuICAgICAgfVxuICAgIH0pXG5cblxuXG5cbiAgICB0aGlzLnByaW1hcnlTZWNyZXQgPSBwcmltYXJ5U2VjcmV0O1xuICAgIHRoaXMuc2Vjb25kYXJ5U2VjcmV0ID0gc2Vjb25kYXJ5U2VjcmV0O1xuICAgIHRoaXMudGVtcG9yYXJ5U2VjcmV0ID0gdGVtcG9yYXJ5U2VjcmV0O1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlByaW1hcnlTZWNyZXRcIiwge1xuICAgICAgdmFsdWU6IHByaW1hcnlTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IEF3cy5TVEFDS19OQU1FICsgJ1ByaW1hcnlTZWNyZXQnLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgbmFtZSBvZiB0aGUgUHJpbWFyeVNlY3JldCdcbiAgICB9KVxuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlNlY29uZGFyeVNlY3JldFwiLCB7XG4gICAgICB2YWx1ZTogc2Vjb25kYXJ5U2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICBleHBvcnROYW1lOiBBd3MuU1RBQ0tfTkFNRSArICdTZWNvbmRhcnlTZWNyZXQnLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgbmFtZSBvZiB0aGUgU2Vjb25kYXJ5U2VjcmV0J1xuICAgIH0pXG5cblxuXG5cbiAgfVxufSJdfQ==