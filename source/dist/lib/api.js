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
//import * as fs from 'fs';
//import * as path from 'path';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Api = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const apigwv2 = require("@aws-cdk/aws-apigatewayv2-alpha");
const aws_apigatewayv2_integrations_alpha_1 = require("@aws-cdk/aws-apigatewayv2-integrations-alpha");
const constructs_1 = require("constructs");
const load_assets_table_1 = require("./load_assets_table");
class Api extends constructs_1.Construct {
    constructor(scope, id, configuration, secrets, dashboard) {
        var _a, _b, _c, _d;
        super(scope, id);
        console.log(configuration.api);
        var runtime;
        if (((_a = configuration.api) === null || _a === void 0 ? void 0 : _a.language) == 'nodejs') {
            runtime = aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_14_X;
        }
        else {
            runtime = aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7;
        }
        const cloudfrontTokenLayer = new aws_cdk_lib_1.aws_lambda.LayerVersion(this, 'RotateSecretLayer', {
            compatibleRuntimes: [
                runtime
            ],
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset('lambda/layers/aws_secure_media_delivery_' + ((_b = configuration.api) === null || _b === void 0 ? void 0 : _b.language)),
            description: 'Layer used by generate new secret lambda',
        });
        const hostingBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'HostingBucket');
        const demoAssetsTable = new aws_cdk_lib_1.aws_dynamodb.Table(this, "DemoTable", {
            tableName: aws_cdk_lib_1.Aws.STACK_NAME + "_videoassets",
            billingMode: aws_cdk_lib_1.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: { name: "id", type: aws_cdk_lib_1.aws_dynamodb.AttributeType.STRING },
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        new load_assets_table_1.LoadAssetsTable(this, "AssetsTable", {
            table: demoAssetsTable,
            configuration: configuration
        });
        const folder = configuration.demo ? "demo_website" : "empty_demo_website";
        new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, 'DeployWebsite', {
            sources: [aws_cdk_lib_1.aws_s3_deployment.Source.asset('resources/' + folder)],
            destinationBucket: hostingBucket,
        });
        const generateToken = new aws_cdk_lib_1.aws_lambda.Function(this, 'GenerateToken', {
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + '_GenerateToken',
            runtime: runtime,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset('lambda/generate_token/nodejs'),
            handler: 'index.handler',
            environment: {
                STACK_NAME: aws_cdk_lib_1.Aws.STACK_NAME,
                TABLE_NAME: demoAssetsTable.tableName,
                USERNAME: (_c = configuration.demo) === null || _c === void 0 ? void 0 : _c.username,
                PASSWORD: (_d = configuration.demo) === null || _d === void 0 ? void 0 : _d.password
            },
            layers: [cloudfrontTokenLayer],
        });
        demoAssetsTable.grantReadData(generateToken);
        secrets.primarySecret.grantRead(generateToken);
        secrets.secondarySecret.grantRead(generateToken);
        const httpApi = new apigwv2.HttpApi(this, 'HttpApi');
        httpApi.addRoutes({
            path: '/tokengenerate',
            methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_alpha_1.HttpLambdaIntegration('GenerateTokenIntegration', generateToken)
        });
        const region = aws_cdk_lib_1.Stack.of(this).region;
        // Creates a distribution from an S3 bucket.
        const myOriginRequestPolicy = new aws_cdk_lib_1.aws_cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
            originRequestPolicyName: aws_cdk_lib_1.Aws.STACK_NAME + 'CMS',
            comment: 'A default policy',
            headerBehavior: aws_cdk_lib_1.aws_cloudfront.OriginRequestHeaderBehavior.allowList('CloudFront-Viewer-Address', 'CloudFront-Viewer-Country', 'CloudFront-Viewer-City', 'Referer', 'User-Agent'),
            queryStringBehavior: aws_cdk_lib_1.aws_cloudfront.OriginRequestQueryStringBehavior.all(),
        });
        const distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, 'Distribution', {
            comment: aws_cdk_lib_1.Aws.STACK_NAME + " - Demo website Secure Media Delivery",
            defaultRootObject: "index_hls.html",
            defaultBehavior: {
                origin: new aws_cdk_lib_1.aws_cloudfront_origins.S3Origin(hostingBucket),
                cachePolicy: aws_cdk_lib_1.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
                allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            },
            additionalBehaviors: {
                '/tokengenerate': {
                    origin: new aws_cdk_lib_1.aws_cloudfront_origins.HttpOrigin(`${httpApi.apiId}.execute-api.${region}.amazonaws.com`, {}),
                    viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: aws_cdk_lib_1.aws_cloudfront.CachePolicy.CACHING_DISABLED,
                    originRequestPolicy: myOriginRequestPolicy,
                    responseHeadersPolicy: aws_cdk_lib_1.aws_cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
                    allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_ALL,
                },
            },
        });
        new aws_cdk_lib_1.CfnOutput(this, "DistributionDomainName", {
            value: 'https://' + distribution.domainName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'DomainName',
            description: 'Demo Website'
        });
        dashboard.buildApiDashboard({
            lambdaFunctionName: generateToken.functionName,
            region: region
        });
        new aws_cdk_lib_1.CfnOutput(this, "ApiEndpoint", {
            value: `${httpApi.apiId}.execute-api.${region}.amazonaws.com`,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'ApiEndpoint',
            description: 'Endpoint'
        });
        new aws_cdk_lib_1.CfnOutput(this, "HostingBucketName", {
            value: hostingBucket.bucketName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + 'HostingBucket',
            description: 'Hosting bucket name'
        });
    }
}
exports.Api = Api;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2FwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCwyQkFBMkI7QUFDM0IsK0JBQStCOzs7QUFFL0IsNkNBYXFCO0FBRXJCLDJEQUEyRDtBQUMzRCxzR0FBcUY7QUFDckYsMkNBQXVDO0FBR3ZDLDJEQUFzRDtBQUd0RCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQUVoQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLGFBQTZCLEVBQUUsT0FBZ0IsRUFBRSxTQUFzQjs7UUFDL0csS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUU5QixJQUFJLE9BQXVCLENBQUM7UUFFNUIsSUFBRyxPQUFBLGFBQWEsQ0FBQyxHQUFHLDBDQUFFLFFBQVEsS0FBRSxRQUFRLEVBQUM7WUFDdkMsT0FBTyxHQUFHLHdCQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQTtTQUNyQzthQUFJO1lBQ0gsT0FBTyxHQUFHLHdCQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQTtTQUNwQztRQUNELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDOUUsa0JBQWtCLEVBQUU7Z0JBQ2xCLE9BQU87YUFDUjtZQUNELElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsMENBQTBDLFVBQUMsYUFBYSxDQUFDLEdBQUcsMENBQUUsUUFBUSxDQUFBLENBQUM7WUFDbkcsV0FBVyxFQUFFLDBDQUEwQztTQUN4RCxDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxJQUFJLG9CQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUUzRCxNQUFN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UUFFRixTQUFTLENBQUMsaUJBQWlCLENBQUM7WUFDeEIsa0JBQWtCLEVBQUUsYUFBYSxDQUFDLFlBQVk7WUFDOUMsTUFBTSxFQUFFLE1BQU07U0FDakIsQ0FBQyxDQUFBO1FBRUYsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUM7WUFDaEMsS0FBSyxFQUFFLEdBQUcsT0FBTyxDQUFDLEtBQUssZ0JBQWdCLE1BQU0sZ0JBQWdCO1lBQzdELFVBQVUsRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxhQUFhO1lBQzFDLFdBQVcsRUFBRSxVQUFVO1NBQ3hCLENBQUMsQ0FBQTtRQUVGLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUM7WUFDdEMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxVQUFVO1lBQy9CLFVBQVUsRUFBRSxpQkFBRyxDQUFDLFVBQVUsR0FBRyxlQUFlO1lBQzVDLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztDQUNGO0FBbklELGtCQW1JQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpLiBZb3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlXG4gKiAgd2l0aCB0aGUgTGljZW5zZS4gQSBjb3B5IG9mIHRoZSBMaWNlbnNlIGlzIGxvY2F0ZWQgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBvciBpbiB0aGUgJ2xpY2Vuc2UnIGZpbGUgYWNjb21wYW55aW5nIHRoaXMgZmlsZS4gVGhpcyBmaWxlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICdBUyBJUycgQkFTSVMsIFdJVEhPVVQgV0FSUkFOVElFU1xuICogIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGV4cHJlc3Mgb3IgaW1wbGllZC4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zXG4gKiAgYW5kIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG4vL2ltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbi8vaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuaW1wb3J0IHtcbiAgQXdzLFxuICBDZm5PdXRwdXQsXG4gIFN0YWNrLFxuICBSZW1vdmFsUG9saWN5LFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX3MzX2RlcGxveW1lbnQgYXMgczNkZXBsb3ksXG4gIGF3c19keW5hbW9kYiBhcyBkZGIsXG4gIGF3c19jbG91ZGZyb250IGFzIGNsb3VkZnJvbnQsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2Nsb3VkZnJvbnRfb3JpZ2lucyBhcyBvcmlnaW5zLFxuXG5cbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgKiBhcyBhcGlnd3YyIGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9jb25maWd1cmF0aW9uJztcbmltcG9ydCB7IFNlY3JldHMgfSBmcm9tICcuL3NlY3JldHMnO1xuaW1wb3J0IHsgTG9hZEFzc2V0c1RhYmxlIH0gZnJvbSAnLi9sb2FkX2Fzc2V0c190YWJsZSc7XG5pbXBvcnQgeyBDV0Rhc2hib2FyZCB9IGZyb20gJy4vZGFzaGJvYXJkJztcblxuZXhwb3J0IGNsYXNzIEFwaSBleHRlbmRzIENvbnN0cnVjdCB7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb24sIHNlY3JldHM6IFNlY3JldHMsIGRhc2hib2FyZDogQ1dEYXNoYm9hcmQpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIGNvbnNvbGUubG9nKGNvbmZpZ3VyYXRpb24uYXBpKVxuXG4gICAgdmFyIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lO1xuXG4gICAgaWYoY29uZmlndXJhdGlvbi5hcGk/Lmxhbmd1YWdlPT0nbm9kZWpzJyl7XG4gICAgICBydW50aW1lID0gbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1hcbiAgICB9ZWxzZXtcbiAgICAgIHJ1bnRpbWUgPSBsYW1iZGEuUnVudGltZS5QWVRIT05fM183XG4gICAgfVxuICAgIGNvbnN0IGNsb3VkZnJvbnRUb2tlbkxheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1JvdGF0ZVNlY3JldExheWVyJywge1xuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbXG4gICAgICAgIHJ1bnRpbWVcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9sYXllcnMvYXdzX3NlY3VyZV9tZWRpYV9kZWxpdmVyeV8nK2NvbmZpZ3VyYXRpb24uYXBpPy5sYW5ndWFnZSksXG4gICAgICBkZXNjcmlwdGlvbjogJ0xheWVyIHVzZWQgYnkgZ2VuZXJhdGUgbmV3IHNlY3JldCBsYW1iZGEnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaG9zdGluZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0hvc3RpbmdCdWNrZXQnKTtcblxuICAgIGNvbnN0IGRlbW9Bc3NldHNUYWJsZSA9IG5ldyBkZGIuVGFibGUodGhpcywgXCJEZW1vVGFibGVcIix7XG4gICAgICB0YWJsZU5hbWUgOiBBd3MuU1RBQ0tfTkFNRSArIFwiX3ZpZGVvYXNzZXRzXCIsXG4gICAgICBiaWxsaW5nTW9kZTogZGRiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBhcnRpdGlvbktleToge25hbWU6IFwiaWRcIiwgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pXG5cbiAgICBuZXcgTG9hZEFzc2V0c1RhYmxlKHRoaXMsIFwiQXNzZXRzVGFibGVcIiwge1xuICAgICAgdGFibGU6IGRlbW9Bc3NldHNUYWJsZSxcbiAgICAgIGNvbmZpZ3VyYXRpb246IGNvbmZpZ3VyYXRpb25cbiAgICB9KTtcblxuICAgIGNvbnN0IGZvbGRlciA9IGNvbmZpZ3VyYXRpb24uZGVtbyA/IFwiZGVtb193ZWJzaXRlXCIgOiBcImVtcHR5X2RlbW9fd2Vic2l0ZVwiO1xuXG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVdlYnNpdGUnLCB7XG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KCdyZXNvdXJjZXMvJyArIGZvbGRlcildLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGhvc3RpbmdCdWNrZXQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBnZW5lcmF0ZVRva2VuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2VuZXJhdGVUb2tlbicse1xuICAgICAgZnVuY3Rpb25OYW1lOiBBd3MuU1RBQ0tfTkFNRSArICdfR2VuZXJhdGVUb2tlbicsXG4gICAgICBydW50aW1lOiBydW50aW1lLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2VuZXJhdGVfdG9rZW4vbm9kZWpzJyksXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgIFNUQUNLX05BTUU6IEF3cy5TVEFDS19OQU1FLFxuICAgICAgICAgICAgVEFCTEVfTkFNRTogZGVtb0Fzc2V0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAgIFVTRVJOQU1FOiBjb25maWd1cmF0aW9uLmRlbW8/LnVzZXJuYW1lISxcbiAgICAgICAgICAgIFBBU1NXT1JEOiBjb25maWd1cmF0aW9uLmRlbW8/LnBhc3N3b3JkIVxuICAgICAgfSxcbiAgICAgIGxheWVyczogW2Nsb3VkZnJvbnRUb2tlbkxheWVyXSxcbiAgICB9KVxuXG5cblxuICAgIGRlbW9Bc3NldHNUYWJsZS5ncmFudFJlYWREYXRhKGdlbmVyYXRlVG9rZW4pO1xuXG5cblxuICAgIHNlY3JldHMucHJpbWFyeVNlY3JldC5ncmFudFJlYWQoZ2VuZXJhdGVUb2tlbilcbiAgICBzZWNyZXRzLnNlY29uZGFyeVNlY3JldC5ncmFudFJlYWQoZ2VuZXJhdGVUb2tlbilcblxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgYXBpZ3d2Mi5IdHRwQXBpKHRoaXMsICdIdHRwQXBpJyk7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiAnL3Rva2VuZ2VuZXJhdGUnLFxuICAgICAgbWV0aG9kczogWyBhcGlnd3YyLkh0dHBNZXRob2QuR0VULCBhcGlnd3YyLkh0dHBNZXRob2QuUE9TVCBdLFxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0dlbmVyYXRlVG9rZW5JbnRlZ3JhdGlvbicsIGdlbmVyYXRlVG9rZW4pXG4gICAgfSk7XG5cblxuICAgIGNvbnN0IHJlZ2lvbiA9IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcbiAgICAvLyBDcmVhdGVzIGEgZGlzdHJpYnV0aW9uIGZyb20gYW4gUzMgYnVja2V0LlxuXG5cblxuICAgIGNvbnN0IG15T3JpZ2luUmVxdWVzdFBvbGljeSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpblJlcXVlc3RQb2xpY3kodGhpcywgJ09yaWdpblJlcXVlc3RQb2xpY3knLCB7XG4gICAgICBvcmlnaW5SZXF1ZXN0UG9saWN5TmFtZTogQXdzLlNUQUNLX05BTUUgKyAnQ01TJyxcbiAgICAgIGNvbW1lbnQ6ICdBIGRlZmF1bHQgcG9saWN5JyxcbiAgICAgIGhlYWRlckJlaGF2aW9yOiBjbG91ZGZyb250Lk9yaWdpblJlcXVlc3RIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoJ0Nsb3VkRnJvbnQtVmlld2VyLUFkZHJlc3MnLCAnQ2xvdWRGcm9udC1WaWV3ZXItQ291bnRyeScsICdDbG91ZEZyb250LVZpZXdlci1DaXR5JywgJ1JlZmVyZXInLCAnVXNlci1BZ2VudCcpLFxuICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UXVlcnlTdHJpbmdCZWhhdmlvci5hbGwoKSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgY29tbWVudCA6IEF3cy5TVEFDS19OQU1FICsgXCIgLSBEZW1vIHdlYnNpdGUgU2VjdXJlIE1lZGlhIERlbGl2ZXJ5XCIsXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleF9obHMuaHRtbFwiLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oaG9zdGluZ0J1Y2tldCksXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVELFxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRCxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvdG9rZW5nZW5lcmF0ZSc6IHtcblxuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuSHR0cE9yaWdpbihgJHtodHRwQXBpLmFwaUlkfS5leGVjdXRlLWFwaS4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbWAsIHtcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxuICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IG15T3JpZ2luUmVxdWVzdFBvbGljeSxcbiAgICAgICAgICByZXNwb25zZUhlYWRlcnNQb2xpY3k6IGNsb3VkZnJvbnQuUmVzcG9uc2VIZWFkZXJzUG9saWN5LkNPUlNfQUxMT1dfQUxMX09SSUdJTlNfV0lUSF9QUkVGTElHSFQsXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJEaXN0cmlidXRpb25Eb21haW5OYW1lXCIse1xuICAgICAgdmFsdWU6ICdodHRwczovLycgKyBkaXN0cmlidXRpb24uZG9tYWluTmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IEF3cy5TVEFDS19OQU1FICsgJ0RvbWFpbk5hbWUnLFxuICAgICAgZGVzY3JpcHRpb246ICdEZW1vIFdlYnNpdGUnXG4gICAgfSlcblxuICAgIGRhc2hib2FyZC5idWlsZEFwaURhc2hib2FyZCh7XG4gICAgICAgIGxhbWJkYUZ1bmN0aW9uTmFtZTogZ2VuZXJhdGVUb2tlbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgIHJlZ2lvbjogcmVnaW9uXG4gICAgfSlcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJBcGlFbmRwb2ludFwiLHtcbiAgICAgIHZhbHVlOiBgJHtodHRwQXBpLmFwaUlkfS5leGVjdXRlLWFwaS4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbWAsXG4gICAgICBleHBvcnROYW1lOiBBd3MuU1RBQ0tfTkFNRSArICdBcGlFbmRwb2ludCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VuZHBvaW50J1xuICAgIH0pXG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiSG9zdGluZ0J1Y2tldE5hbWVcIix7XG4gICAgICB2YWx1ZTogaG9zdGluZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZXhwb3J0TmFtZTogQXdzLlNUQUNLX05BTUUgKyAnSG9zdGluZ0J1Y2tldCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0hvc3RpbmcgYnVja2V0IG5hbWUnXG4gICAgfSlcbiAgfVxufSJdfQ==