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
exports.AthenaTable = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
class AthenaTable extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const accessLogsBucket = aws_cdk_lib_1.aws_s3.Bucket.fromBucketName(this, 'AccessLogsBucket', props.logsBucketName);
        //create an Athena database
        const myDatabase = new aws_cdk_lib_1.aws_glue.CfnDatabase(this, "MyDatabase", {
            catalogId: props.accountId,
            databaseInput: {
                description: "Glue database " + props.athenaDatabaseName,
                name: props.athenaDatabaseName,
            }
        });
        const cloudfrontAthenaTable = new aws_cdk_lib_1.aws_glue.CfnTable(this, "CfAaccessLogs", {
            catalogId: props.accountId,
            databaseName: props.athenaDatabaseName,
            tableInput: {
                name: props.athenaTableName,
                description: 'CloudFront access logs',
                tableType: 'EXTERNAL_TABLE',
                parameters: {
                    'skip.header.line.count': '2',
                },
                storageDescriptor: {
                    location: "s3://" + accessLogsBucket.bucketName + "/",
                    inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
                    outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
                    compressed: false,
                    serdeInfo: {
                        serializationLibrary: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
                        parameters: {
                            'field.delim': '	'
                        }
                    },
                    columns: [
                        { name: 'date', type: 'date' },
                        { name: 'time', type: 'string' },
                        { name: 'location', type: 'string' },
                        { name: 'bytes', type: 'bigint' },
                        { name: 'request_ip', type: 'string' },
                        { name: 'method', type: 'string' },
                        { name: 'host', type: 'string' },
                        { name: 'uri', type: 'string' },
                        { name: 'status', type: 'string' },
                        { name: 'referer', type: 'string' },
                        { name: 'user_agent', type: 'string' },
                        { name: 'query_string', type: 'string' },
                        { name: 'cookie', type: 'string' },
                        { name: 'result_type', type: 'string' },
                        { name: 'request_id', type: 'string' },
                        { name: 'host_header', type: 'string' },
                        { name: 'request_protocol', type: 'string' },
                        { name: 'request_bytes', type: 'bigint' },
                        { name: 'time_taken', type: 'float' },
                        { name: 'xforwarded_for', type: 'string' },
                        { name: 'ssl_protocol', type: 'string' },
                        { name: 'ssl_cipher', type: 'string' },
                        { name: 'response_result_type', type: 'string' },
                        { name: 'http_version', type: 'string' },
                        { name: 'fle_status', type: 'string' },
                        { name: 'fle_encrypted_fields', type: 'int' },
                        { name: 'c_port', type: 'int' },
                        { name: 'time_to_first_byte', type: 'float' },
                        { name: 'x_edge_detailed_result_type', type: 'string' },
                        { name: 'sc_content_type', type: 'string' },
                        { name: 'sc_content_len', type: 'string' },
                        { name: 'sc_range_start', type: 'bigint' },
                        { name: 'sc_range_end', type: 'bigint' }
                    ]
                },
            }
        });
        cloudfrontAthenaTable.node.addDependency(myDatabase);
    }
}
exports.AthenaTable = AthenaTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXRoZW5hX3RhYmxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2F0aGVuYV90YWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQUVILDZDQUdxQjtBQUNyQiwyQ0FBdUM7QUFXdkMsTUFBYSxXQUFZLFNBQVEsc0JBQVM7SUFHeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQjtRQUMzRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBR2pCLE1BQU0sZ0JBQWdCLEdBQUcsb0JBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksRUFBQyxrQkFBa0IsRUFBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUE7UUFFL0YsMkJBQTJCO1FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUksc0JBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN4RCxTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7WUFDMUIsYUFBYSxFQUFFO2dCQUNYLFdBQVcsRUFBRSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsa0JBQWtCO2dCQUN4RCxJQUFJLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjthQUNqQztTQUNGLENBQUMsQ0FBQTtRQUVGLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3JFLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztZQUMxQixZQUFZLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtZQUN0QyxVQUFVLEVBQUU7Z0JBQ1IsSUFBSSxFQUFFLEtBQUssQ0FBQyxlQUFlO2dCQUMzQixXQUFXLEVBQUUsd0JBQXdCO2dCQUNyQyxTQUFTLEVBQUUsZ0JBQWdCO2dCQUMzQixVQUFVLEVBQUc7b0JBQ1Qsd0JBQXdCLEVBQUUsR0FBRztpQkFDaEM7Z0JBQ0QsaUJBQWlCLEVBQUU7b0JBQ2YsUUFB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ekMsRUFBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBQzt3QkFDeEMsRUFBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBQzt3QkFDeEMsRUFBQyxJQUFJLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUM7cUJBQ3pDO2lCQUNGO2FBQ0o7U0FDTixDQUFDLENBQUE7UUFFRixxQkFBcUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFBO0lBRXRELENBQUM7Q0FDRjtBQWpGRCxrQ0FpRkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqICBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKS4gWW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZVxuICogIHdpdGggdGhlIExpY2Vuc2UuIEEgY29weSBvZiB0aGUgTGljZW5zZSBpcyBsb2NhdGVkIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgb3IgaW4gdGhlICdsaWNlbnNlJyBmaWxlIGFjY29tcGFueWluZyB0aGlzIGZpbGUuIFRoaXMgZmlsZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAnQVMgSVMnIEJBU0lTLCBXSVRIT1VUIFdBUlJBTlRJRVNcbiAqICBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9uc1xuICogIGFuZCBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQge1xuICBhd3NfczMgYXMgczMsXG4gIGF3c19nbHVlIGFzIGdsdWUsXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWdQcm9wcyB7XG5cbiAgbG9nc0J1Y2tldE5hbWU6IHN0cmluZyxcbiAgYWNjb3VudElkOnN0cmluZyxcbiAgYXRoZW5hRGF0YWJhc2VOYW1lOiBzdHJpbmcsXG4gIGF0aGVuYVRhYmxlTmFtZTpzdHJpbmcsXG5cbn1cblxuZXhwb3J0IGNsYXNzIEF0aGVuYVRhYmxlIGV4dGVuZHMgQ29uc3RydWN0IHtcblxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJQ29uZmlnUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG5cbiAgICBjb25zdCBhY2Nlc3NMb2dzQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXROYW1lKHRoaXMsJ0FjY2Vzc0xvZ3NCdWNrZXQnLHByb3BzLmxvZ3NCdWNrZXROYW1lKVxuXG4gICAgLy9jcmVhdGUgYW4gQXRoZW5hIGRhdGFiYXNlXG4gICAgY29uc3QgbXlEYXRhYmFzZSA9IG5ldyBnbHVlLkNmbkRhdGFiYXNlKHRoaXMsIFwiTXlEYXRhYmFzZVwiLCB7XG4gICAgICAgIGNhdGFsb2dJZDogcHJvcHMuYWNjb3VudElkLFxuICAgICAgICBkYXRhYmFzZUlucHV0OiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJHbHVlIGRhdGFiYXNlIFwiICsgcHJvcHMuYXRoZW5hRGF0YWJhc2VOYW1lLFxuICAgICAgICAgICAgbmFtZTogcHJvcHMuYXRoZW5hRGF0YWJhc2VOYW1lLFxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBjb25zdCBjbG91ZGZyb250QXRoZW5hVGFibGUgPSBuZXcgZ2x1ZS5DZm5UYWJsZSh0aGlzLCBcIkNmQWFjY2Vzc0xvZ3NcIiwge1xuICAgICAgICBjYXRhbG9nSWQ6IHByb3BzLmFjY291bnRJZCxcbiAgICAgICAgZGF0YWJhc2VOYW1lOiBwcm9wcy5hdGhlbmFEYXRhYmFzZU5hbWUsXG4gICAgICAgIHRhYmxlSW5wdXQ6IHtcbiAgICAgICAgICAgIG5hbWU6IHByb3BzLmF0aGVuYVRhYmxlTmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBhY2Nlc3MgbG9ncycsXG4gICAgICAgICAgICB0YWJsZVR5cGU6ICdFWFRFUk5BTF9UQUJMRScsXG4gICAgICAgICAgICBwYXJhbWV0ZXJzOiAge1xuICAgICAgICAgICAgICAgICdza2lwLmhlYWRlci5saW5lLmNvdW50JzogJzInLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0b3JhZ2VEZXNjcmlwdG9yOiB7XG4gICAgICAgICAgICAgICAgbG9jYXRpb246IFwiczM6Ly9cIithY2Nlc3NMb2dzQnVja2V0LmJ1Y2tldE5hbWUrXCIvXCIsXG4gICAgICAgICAgICAgICAgaW5wdXRGb3JtYXQ6ICdvcmcuYXBhY2hlLmhhZG9vcC5tYXByZWQuVGV4dElucHV0Rm9ybWF0JyxcbiAgICAgICAgICAgICAgICBvdXRwdXRGb3JtYXQ6ICdvcmcuYXBhY2hlLmhhZG9vcC5oaXZlLnFsLmlvLkhpdmVJZ25vcmVLZXlUZXh0T3V0cHV0Rm9ybWF0JyxcbiAgICAgICAgICAgICAgICBjb21wcmVzc2VkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBzZXJkZUluZm86IHtcbiAgICAgICAgICAgICAgICAgICAgc2VyaWFsaXphdGlvbkxpYnJhcnk6ICdvcmcuYXBhY2hlLmhhZG9vcC5oaXZlLnNlcmRlMi5sYXp5LkxhenlTaW1wbGVTZXJEZScsXG4gICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICdmaWVsZC5kZWxpbScgOiAnXHQnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgY29sdW1uczogW1xuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ2RhdGUnLCB0eXBlOiAnZGF0ZSd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3RpbWUnLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnbG9jYXRpb24nLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnYnl0ZXMnLCB0eXBlOiAnYmlnaW50J30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAncmVxdWVzdF9pcCcsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdtZXRob2QnLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnaG9zdCcsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICd1cmknLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnc3RhdHVzJywgdHlwZTogJ3N0cmluZyd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3JlZmVyZXInLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAndXNlcl9hZ2VudCcsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdxdWVyeV9zdHJpbmcnLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnY29va2llJywgdHlwZTogJ3N0cmluZyd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3Jlc3VsdF90eXBlJywgdHlwZTogJ3N0cmluZyd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3JlcXVlc3RfaWQnLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnaG9zdF9oZWFkZXInLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAncmVxdWVzdF9wcm90b2NvbCcsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdyZXF1ZXN0X2J5dGVzJywgdHlwZTogJ2JpZ2ludCd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3RpbWVfdGFrZW4nLCB0eXBlOiAnZmxvYXQnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICd4Zm9yd2FyZGVkX2ZvcicsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdzc2xfcHJvdG9jb2wnLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnc3NsX2NpcGhlcicsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdyZXNwb25zZV9yZXN1bHRfdHlwZScsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdodHRwX3ZlcnNpb24nLCB0eXBlOiAnc3RyaW5nJ30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAnZmxlX3N0YXR1cycsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdmbGVfZW5jcnlwdGVkX2ZpZWxkcycsIHR5cGU6ICdpbnQnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdjX3BvcnQnLCB0eXBlOiAnaW50J30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAndGltZV90b19maXJzdF9ieXRlJywgdHlwZTogJ2Zsb2F0J30sXG4gICAgICAgICAgICAgICAgICAgIHtuYW1lOiAneF9lZGdlX2RldGFpbGVkX3Jlc3VsdF90eXBlJywgdHlwZTogJ3N0cmluZyd9LFxuICAgICAgICAgICAgICAgICAgICB7bmFtZTogJ3NjX2NvbnRlbnRfdHlwZScsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdzY19jb250ZW50X2xlbicsIHR5cGU6ICdzdHJpbmcnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdzY19yYW5nZV9zdGFydCcsIHR5cGU6ICdiaWdpbnQnfSxcbiAgICAgICAgICAgICAgICAgICAge25hbWU6ICdzY19yYW5nZV9lbmQnLCB0eXBlOiAnYmlnaW50J31cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgfVxuICAgIH0pXG5cbiAgICBjbG91ZGZyb250QXRoZW5hVGFibGUubm9kZS5hZGREZXBlbmRlbmN5KG15RGF0YWJhc2UpXG5cbiAgfVxufSJdfQ==