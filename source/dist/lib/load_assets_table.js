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
exports.LoadAssetsTable = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
const fs = require("fs");
class LoadAssetsTable extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.generateItems = (configuration) => {
            var _a, _b, _c, _d, _e, _f;
            var fileContent = fs.readFileSync('resources/mock/assets.json').toString();
            var returnItems = new Array();
            if (configuration.hls) {
                var hlsFileContent = fileContent.replace('HOST_NAME', (_a = configuration.hls) === null || _a === void 0 ? void 0 : _a.hostname);
                hlsFileContent = hlsFileContent.replace('URL_PATH', (_b = configuration.hls) === null || _b === void 0 ? void 0 : _b.url_path);
                hlsFileContent = hlsFileContent.replace('TTL', (_c = configuration.hls) === null || _c === void 0 ? void 0 : _c.ttl);
                returnItems.push(JSON.parse(hlsFileContent));
            }
            if (configuration.dash) {
                var dashFileContent = fileContent.replace('HOST_NAME', (_d = configuration.dash) === null || _d === void 0 ? void 0 : _d.hostname);
                dashFileContent = dashFileContent.replace('URL_PATH', (_e = configuration.dash) === null || _e === void 0 ? void 0 : _e.url_path);
                dashFileContent = dashFileContent.replace('TTL', (_f = configuration.dash) === null || _f === void 0 ? void 0 : _f.ttl);
                returnItems.push(JSON.parse(dashFileContent));
            }
            return returnItems;
        };
        const loadItem = {
            service: "DynamoDB",
            action: "batchWriteItem",
            parameters: {
                RequestItems: {
                    [props.table.tableName]: this.generateItems(props.configuration),
                },
            },
            physicalResourceId: aws_cdk_lib_1.custom_resources.PhysicalResourceId.of("initDBData"),
        };
        new aws_cdk_lib_1.custom_resources.AwsCustomResource(this, "initDBResource", {
            onCreate: loadItem,
            onUpdate: loadItem,
            policy: aws_cdk_lib_1.custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [props.table.tableArn],
            }),
        });
    }
}
exports.LoadAssetsTable = LoadAssetsTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZF9hc3NldHNfdGFibGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvbG9hZF9hc3NldHNfdGFibGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7OztHQVdHOzs7QUFFSCw2Q0FFcUI7QUFHckIsMkNBQXVDO0FBQ3ZDLHlCQUF5QjtBQVF6QixNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFFNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQjtRQUMzRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBd0JYLGtCQUFhLEdBQUcsQ0FBQyxhQUE2QixFQUFFLEVBQUU7O1lBR3hELElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQTtZQUMxRSxJQUFJLFdBQVcsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBRTlCLElBQUcsYUFBYSxDQUFDLEdBQUcsRUFBQztnQkFDbkIsSUFBSSxjQUFjLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsTUFBQSxhQUFhLENBQUMsR0FBRywwQ0FBRSxRQUFTLENBQUUsQ0FBQTtnQkFDcEYsY0FBYyxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLE1BQUEsYUFBYSxDQUFDLEdBQUcsMENBQUUsUUFBUyxDQUFDLENBQUE7Z0JBQ2pGLGNBQWMsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxNQUFBLGFBQWEsQ0FBQyxHQUFHLDBDQUFFLEdBQUksQ0FBQyxDQUFBO2dCQUN2RSxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzthQUM5QztZQUVELElBQUcsYUFBYSxDQUFDLElBQUksRUFBQztnQkFDcEIsSUFBSSxlQUFlLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsTUFBQSxhQUFhLENBQUMsSUFBSSwwQ0FBRSxRQUFTLENBQUUsQ0FBQTtnQkFDdEYsZUFBZSxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLE1BQUEsYUFBYSxDQUFDLElBQUksMENBQUUsUUFBUyxDQUFDLENBQUE7Z0JBQ3BGLGVBQWUsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxNQUFBLGFBQWEsQ0FBQyxJQUFJLDBDQUFFLEdBQUksQ0FBQyxDQUFBO2dCQUMxRSxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQzthQUUvQztZQUVELE9BQU8sV0FBVyxDQUFDO1FBRW5CLENBQUMsQ0FBQztRQTdDRixNQUFNLFFBQVEsR0FBRztZQUNmLE9BQU8sRUFBRSxVQUFVO1lBQ25CLE1BQU0sRUFBRSxnQkFBZ0I7WUFDeEIsVUFBVSxFQUFFO2dCQUNWLFlBQVksRUFBRTtvQkFDWixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDO2lCQUNqRTthQUNGO1lBQ0Qsa0JBQWtCLEVBQUUsOEJBQWdCLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQztTQUN6RSxDQUFBO1FBRUQsSUFBSSw4QkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDN0QsUUFBUSxFQUFFLFFBQVE7WUFDbEIsUUFBUSxFQUFFLFFBQVE7WUFDbEIsTUFBTSxFQUFFLDhCQUFnQixDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQztnQkFDNUQsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7YUFDbEMsQ0FBQztTQUNILENBQUMsQ0FBQztJQUdMLENBQUM7Q0E0QkY7QUFyREQsMENBcURDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiAgQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIikuIFlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2VcbiAqICB3aXRoIHRoZSBMaWNlbnNlLiBBIGNvcHkgb2YgdGhlIExpY2Vuc2UgaXMgbG9jYXRlZCBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogIG9yIGluIHRoZSAnbGljZW5zZScgZmlsZSBhY2NvbXBhbnlpbmcgdGhpcyBmaWxlLiBUaGlzIGZpbGUgaXMgZGlzdHJpYnV0ZWQgb24gYW4gJ0FTIElTJyBCQVNJUywgV0lUSE9VVCBXQVJSQU5USUVTXG4gKiAgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZXhwcmVzcyBvciBpbXBsaWVkLiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnNcbiAqICBhbmQgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0IHtcbiAgICBjdXN0b21fcmVzb3VyY2VzXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgSVRhYmxlIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gXCIuLi9oZWxwZXJzL3ZhbGlkYXRvcnMvY29uZmlndXJhdGlvblwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWdQcm9wcyB7XG4gICAgdGFibGUgOiBJVGFibGU7XG4gICAgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb247XG4gfVxuXG5leHBvcnQgY2xhc3MgTG9hZEFzc2V0c1RhYmxlIGV4dGVuZHMgQ29uc3RydWN0IHtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSUNvbmZpZ1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IGxvYWRJdGVtID0ge1xuICAgICAgc2VydmljZTogXCJEeW5hbW9EQlwiLFxuICAgICAgYWN0aW9uOiBcImJhdGNoV3JpdGVJdGVtXCIsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgIFJlcXVlc3RJdGVtczoge1xuICAgICAgICAgIFtwcm9wcy50YWJsZS50YWJsZU5hbWVdOiB0aGlzLmdlbmVyYXRlSXRlbXMocHJvcHMuY29uZmlndXJhdGlvbiksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjdXN0b21fcmVzb3VyY2VzLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihcImluaXREQkRhdGFcIiksXG4gICAgfVxuXG4gICAgbmV3IGN1c3RvbV9yZXNvdXJjZXMuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgXCJpbml0REJSZXNvdXJjZVwiLCB7XG4gICAgICBvbkNyZWF0ZTogbG9hZEl0ZW0sXG4gICAgICBvblVwZGF0ZTogbG9hZEl0ZW0sXG4gICAgICBwb2xpY3k6IGN1c3RvbV9yZXNvdXJjZXMuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudGFibGUudGFibGVBcm5dLFxuICAgICAgfSksXG4gICAgfSk7XG5cblxuICB9XG5cbiAgcHJpdmF0ZSBnZW5lcmF0ZUl0ZW1zID0gKGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uKSA9PiB7XG5cblxuICAgIHZhciBmaWxlQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYygncmVzb3VyY2VzL21vY2svYXNzZXRzLmpzb24nKS50b1N0cmluZygpXG4gICAgdmFyIHJldHVybkl0ZW1zID0gbmV3IEFycmF5KCk7XG5cbiAgICBpZihjb25maWd1cmF0aW9uLmhscyl7XG4gICAgICB2YXIgaGxzRmlsZUNvbnRlbnQgPSBmaWxlQ29udGVudC5yZXBsYWNlKCdIT1NUX05BTUUnLCBjb25maWd1cmF0aW9uLmhscz8uaG9zdG5hbWUhIClcbiAgICAgIGhsc0ZpbGVDb250ZW50ID0gaGxzRmlsZUNvbnRlbnQucmVwbGFjZSgnVVJMX1BBVEgnLCBjb25maWd1cmF0aW9uLmhscz8udXJsX3BhdGghKVxuICAgICAgaGxzRmlsZUNvbnRlbnQgPSBobHNGaWxlQ29udGVudC5yZXBsYWNlKCdUVEwnLCBjb25maWd1cmF0aW9uLmhscz8udHRsISlcbiAgICAgIHJldHVybkl0ZW1zLnB1c2goSlNPTi5wYXJzZShobHNGaWxlQ29udGVudCkpO1xuICAgIH1cblxuICAgIGlmKGNvbmZpZ3VyYXRpb24uZGFzaCl7XG4gICAgICB2YXIgZGFzaEZpbGVDb250ZW50ID0gZmlsZUNvbnRlbnQucmVwbGFjZSgnSE9TVF9OQU1FJywgY29uZmlndXJhdGlvbi5kYXNoPy5ob3N0bmFtZSEgKVxuICAgICAgZGFzaEZpbGVDb250ZW50ID0gZGFzaEZpbGVDb250ZW50LnJlcGxhY2UoJ1VSTF9QQVRIJywgY29uZmlndXJhdGlvbi5kYXNoPy51cmxfcGF0aCEpXG4gICAgICBkYXNoRmlsZUNvbnRlbnQgPSBkYXNoRmlsZUNvbnRlbnQucmVwbGFjZSgnVFRMJywgY29uZmlndXJhdGlvbi5kYXNoPy50dGwhKVxuICAgICAgcmV0dXJuSXRlbXMucHVzaChKU09OLnBhcnNlKGRhc2hGaWxlQ29udGVudCkpO1xuXG4gICAgfVxuXG4gICAgcmV0dXJuIHJldHVybkl0ZW1zO1xuXG4gICAgfTtcblxuXG59XG4iXX0=