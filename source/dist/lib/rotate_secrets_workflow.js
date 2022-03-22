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
exports.RotateSecretsWorkflow = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_stepfunctions_1 = require("aws-cdk-lib/aws-stepfunctions");
//import * as fs from 'fs';
//import * as path from 'path';
const constructs_1 = require("constructs");
const init_secrets_1 = require("./init_secrets");
class RotateSecretsWorkflow extends constructs_1.Construct {
    constructor(scope, id, props) {
        var _a;
        super(scope, id);
        //jsonpath layer
        const jsonPathLayer = new aws_cdk_lib_1.aws_lambda.LayerVersion(this, "JsonPathLayer", {
            compatibleRuntimes: [aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7],
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/layers/jsonpath"),
            description: "Layer with jsonpath lib",
        });
        const accountId = aws_cdk_lib_1.Stack.of(this).account;
        const generateSecretUpdateCff = new aws_cdk_lib_1.aws_lambda.Function(this, "GenerateSecretUpdateCff", {
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + "_GenerateSecretUpdateCff",
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/generate_secret_update_cff"),
            timeout: aws_cdk_lib_1.Duration.seconds(300),
            handler: "index.handler",
            environment: {
                TEMPORARY_KEY_NAME: props.secrets.temporarySecret.secretName,
                PRIMARY_KEY_NAME: props.secrets.primarySecret.secretName,
                SECONDARY_KEY_NAME: props.secrets.secondarySecret.secretName,
                CFF_NAME: props.checkTokenFunction.functionName,
            }
        });
        generateSecretUpdateCff.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: [
                "cloudfront:DescribeFunction",
                "cloudfront:UpdateFunction",
                "cloudfront:PublishFunction",
            ],
            resources: [props.checkTokenFunction.functionArn],
        }));
        // Set Lambda Logs Retention and Removal Policy
        new aws_cdk_lib_1.aws_logs.LogGroup(this, "GenerateNewSecretLogs", {
            logGroupName: "/aws/lambda/" + generateSecretUpdateCff.functionName,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH,
        });
        const getLastModifiedTime = new aws_cdk_lib_1.aws_lambda.Function(this, "GetLastModifiedTime", {
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + "_GetLastModifiedTime",
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/get_last_modified_time"),
            handler: "index.handler",
            environment: {
                MAX_ITERATIONS: "5"
            }
        });
        getLastModifiedTime.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["cloudfront:Get*"],
            resources: ["*"],
        }));
        // Set Lambda Logs Retention and Removal Policy
        new aws_cdk_lib_1.aws_logs.LogGroup(this, "LastModifiedTimeLogs", {
            logGroupName: "/aws/lambda/" + getLastModifiedTime.functionName,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH,
        });
        const getDistributionsForCff = new aws_cdk_lib_1.aws_lambda.Function(this, "getDistributionsList", {
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + "_GetDistributionsForCff",
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/get_distributions_for_cff"),
            handler: "index.handler",
            timeout: aws_cdk_lib_1.Duration.seconds(300),
            environment: {
                CFF_NAME: props.checkTokenFunction.functionName,
                ACCOUNT_ID: accountId,
            },
            layers: [jsonPathLayer],
        });
        getDistributionsForCff.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: ["cloudfront:List*"],
            resources: ["*"],
        }));
        // Set Lambda Logs Retention and Removal Policy
        new aws_cdk_lib_1.aws_logs.LogGroup(this, "updateCFFLogs", {
            logGroupName: "/aws/lambda/" + getDistributionsForCff.functionName,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH,
        });
        new init_secrets_1.InitSecrets(this, "Init", {
            functionArn: generateSecretUpdateCff.functionArn,
            functionName: generateSecretUpdateCff.functionName
        });
        //Generate token
        const swapSecrets = new aws_cdk_lib_1.aws_lambda.Function(this, "SwapSecrets", {
            functionName: aws_cdk_lib_1.Aws.STACK_NAME + "_SwapSecrets",
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_7,
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset("lambda/swap_secrets"),
            handler: "index.lambda_handler",
            environment: {
                TEMPORARY_KEY_NAME: props.secrets.temporarySecret.secretName,
                PRIMARY_KEY_NAME: props.secrets.primarySecret.secretName,
                SECONDARY_KEY_NAME: props.secrets.secondarySecret.secretName,
            },
        });
        // Set Lambda Logs Retention and Removal Policy
        new aws_cdk_lib_1.aws_logs.LogGroup(this, "KeyRotationLogs", {
            logGroupName: "/aws/lambda/" + swapSecrets.functionName,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH,
        });
        //permissions for Secrets Manager
        //
        //generateSecretUpdateCff
        props.secrets.temporarySecret.grantWrite(generateSecretUpdateCff);
        props.secrets.primarySecret.grantWrite(generateSecretUpdateCff);
        props.secrets.secondarySecret.grantWrite(generateSecretUpdateCff);
        props.secrets.primarySecret.grantRead(generateSecretUpdateCff);
        //swapSecrets
        props.secrets.temporarySecret.grantRead(swapSecrets);
        props.secrets.temporarySecret.grantWrite(swapSecrets);
        props.secrets.primarySecret.grantWrite(swapSecrets);
        props.secrets.primarySecret.grantRead(swapSecrets);
        props.secrets.secondarySecret.grantWrite(swapSecrets);
        props.secrets.secondarySecret.grantRead(swapSecrets);
        const generateNewSecretJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "Get distributions for CloudFront Function", {
            lambdaFunction: getDistributionsForCff,
            outputPath: "$",
            resultSelector: {
                "Output.$": "$.Payload",
            },
        });
        const updateCloudFrontFunctionJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "Generate secrets & update CloudFront Function", {
            lambdaFunction: generateSecretUpdateCff,
            resultPath: aws_stepfunctions_1.JsonPath.DISCARD,
            resultSelector: {
                "Output.$": "$.Payload",
            },
        });
        const getLastModifiedTimeJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "Get Last Modified Time", {
            lambdaFunction: getLastModifiedTime,
            outputPath: "$.Output",
            resultSelector: {
                "Output.$": "$.Payload",
            },
        });
        const swapSecretsJob = new aws_cdk_lib_1.aws_stepfunctions_tasks.LambdaInvoke(this, "Swap secrets", {
            lambdaFunction: swapSecrets,
        });
        const wait = new aws_cdk_lib_1.aws_stepfunctions.Wait(this, 'Wait 1 minute', {
            time: aws_cdk_lib_1.aws_stepfunctions.WaitTime.duration(aws_cdk_lib_1.Duration.minutes(1)),
        });
        const map = new aws_cdk_lib_1.aws_stepfunctions.Map(this, "Map State", {
            maxConcurrency: 1,
            inputPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.stringAt("$.Output.distributions"),
            resultPath: aws_cdk_lib_1.aws_stepfunctions.JsonPath.DISCARD,
        });
        const checkConditions = new aws_cdk_lib_1.aws_stepfunctions.Choice(this, "Keep waiting?")
            .when(aws_cdk_lib_1.aws_stepfunctions.Condition.booleanEquals("$.continue", false), new aws_cdk_lib_1.aws_stepfunctions.Fail(this, "Fail propagating"))
            .otherwise(wait.next(getLastModifiedTimeJob));
        const updatePropagated = new aws_cdk_lib_1.aws_stepfunctions.Choice(this, "Update propagated?")
            .when(aws_cdk_lib_1.aws_stepfunctions.Condition.booleanEquals("$.propagated", false), checkConditions)
            .otherwise(new aws_cdk_lib_1.aws_stepfunctions.Succeed(this, "Propagation OK"));
        map.iterator(getLastModifiedTimeJob.next(updatePropagated));
        // Step function to orchestrate generating a new secret
        const workflow = new aws_cdk_lib_1.aws_stepfunctions.StateMachine(this, "Rotate", {
            stateMachineName: aws_cdk_lib_1.Aws.STACK_NAME + "_RotateSecret",
            definition: generateNewSecretJob.next(updateCloudFrontFunctionJob).next(map).next(swapSecretsJob),
            timeout: aws_cdk_lib_1.Duration.minutes(60),
        });
        const triggerFrequency = ((_a = props.configuration.main) === null || _a === void 0 ? void 0 : _a.rotate_secrets_frequency) || 0;
        if (triggerFrequency > 0) {
            // Trigger Sfn to rotate the secrets every X minutes
            const rule = new aws_cdk_lib_1.aws_events.Rule(this, "Rule1", {
                schedule: aws_cdk_lib_1.aws_events.Schedule.rate(aws_cdk_lib_1.Duration.minutes(triggerFrequency)),
                description: "Trigger StepFunction to rotate secrets",
                enabled: true,
            });
            rule.addTarget(new aws_cdk_lib_1.aws_events_targets.SfnStateMachine(workflow));
        }
        this.workflowArn = workflow.stateMachineArn;
        new aws_cdk_lib_1.CfnOutput(this, "SFRotateSecrets", {
            value: workflow.stateMachineName,
            exportName: aws_cdk_lib_1.Aws.STACK_NAME + "SFRotateSecrets",
            description: "The name of the Step Function to rotate secrets",
        });
    }
}
exports.RotateSecretsWorkflow = RotateSecretsWorkflow;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm90YXRlX3NlY3JldHNfd29ya2Zsb3cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvcm90YXRlX3NlY3JldHNfd29ya2Zsb3cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7OztHQVdHOzs7QUFFSCw2Q0FlcUI7QUFDckIscUVBQXlEO0FBRXpELDJCQUEyQjtBQUMzQiwrQkFBK0I7QUFFL0IsMkNBQXVDO0FBRXZDLGlEQUE2QztBQVk3QyxNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBSWxELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBbUI7O1FBQzNELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0JBQWdCO1FBQ2hCLE1BQU0sYUFBYSxHQUFHLElBQUksd0JBQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuRSxrQkFBa0IsRUFBRSxDQUFDLHdCQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztZQUMvQyxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLHdCQUF3QixDQUFDO1lBQ3JELFdBQVcsRUFBRSx5QkFBeUI7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxTQUFTLEdBQUcsbUJBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO1FBRXpDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSx3QkFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDbkYsWUFBWSxFQUFFLGlCQUFHLENBQUMsVUFBVSxHQUFHLDBCQUEwQjtZQUN6RCxPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsVUFBVTtZQUNsQyxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxDQUFDO1lBQ2hFLE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxH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LENBQUMsRUFBRSxDQUFDO1NBSzlCLENBQUMsQ0FBQztRQUVILE1BQU0sZ0JBQWdCLEdBQ3BCLE9BQUEsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLDBDQUFFLHdCQUF3QixLQUFJLENBQUMsQ0FBQztRQUMxRCxJQUFJLGdCQUFnQixHQUFHLENBQUMsRUFBRTtZQUN4QixvREFBb0Q7WUFDcEQsTUFBTSxJQUFJLEdBQUcsSUFBSSx3QkFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO2dCQUMxQyxRQUFRLEVBQUUsd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLHNCQUFRLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQ2xFLFdBQVcsRUFBRSx3Q0FBd0M7Z0JBQ3JELE9BQU8sRUFBRSxJQUFJO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGdDQUFPLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDdkQ7UUFFRCxJQUFJLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyxlQUFlLENBQUM7UUFFNUMsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNyQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQjtZQUNoQyxVQUFVLEVBQUUsaUJBQUcsQ0FBQyxVQUFVLEdBQUcsaUJBQWlCO1lBQzlDLFdBQVcsRUFBRSxpREFBaUQ7U0FDL0QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBclBELHNEQXFQQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpLiBZb3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlXG4gKiAgd2l0aCB0aGUgTGljZW5zZS4gQSBjb3B5IG9mIHRoZSBMaWNlbnNlIGlzIGxvY2F0ZWQgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBvciBpbiB0aGUgJ2xpY2Vuc2UnIGZpbGUgYWNjb21wYW55aW5nIHRoaXMgZmlsZS4gVGhpcyBmaWxlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICdBUyBJUycgQkFTSVMsIFdJVEhPVVQgV0FSUkFOVElFU1xuICogIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGV4cHJlc3Mgb3IgaW1wbGllZC4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zXG4gKiAgYW5kIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCB7XG4gIEF3cyxcbiAgQ2ZuT3V0cHV0LFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgU3RhY2ssXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfY2xvdWRmcm9udCBhcyBjbG91ZGZyb250LFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX3N0ZXBmdW5jdGlvbnMgYXMgc2ZuLFxuICBhd3Nfc3RlcGZ1bmN0aW9uc190YXNrcyBhcyB0YXNrcyxcbiAgYXdzX2V2ZW50cyBhcyBldmVudHMsXG4gIGF3c19ldmVudHNfdGFyZ2V0cyBhcyB0YXJnZXRzLFxuXG59IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgSnNvblBhdGggfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXN0ZXBmdW5jdGlvbnNcIjtcblxuLy9pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG4vL2ltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gXCIuLi9oZWxwZXJzL3ZhbGlkYXRvcnMvY29uZmlndXJhdGlvblwiO1xuaW1wb3J0IHsgSW5pdFNlY3JldHMgfSBmcm9tIFwiLi9pbml0X3NlY3JldHNcIjtcbmltcG9ydCB7IFNlY3JldHMgfSBmcm9tIFwiLi9zZWNyZXRzXCI7XG5cbi8qKlxuICogVGhlIHByb3BlcnRpZXMgZXhwZWN0ZWQgYnkgdGhlIGNvbmZpZyBjb25zdHJ1Y3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ1Byb3BzIHtcbiAgc2VjcmV0czogU2VjcmV0cztcbiAgY2hlY2tUb2tlbkZ1bmN0aW9uOiBjbG91ZGZyb250LklGdW5jdGlvbjtcbiAgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBSb3RhdGVTZWNyZXRzV29ya2Zsb3cgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuXG4gIHB1YmxpYyByZWFkb25seSB3b3JrZmxvd0Fybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJQ29uZmlnUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy9qc29ucGF0aCBsYXllclxuICAgIGNvbnN0IGpzb25QYXRoTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCBcIkpzb25QYXRoTGF5ZXJcIiwge1xuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfN10sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEvbGF5ZXJzL2pzb25wYXRoXCIpLFxuICAgICAgZGVzY3JpcHRpb246IFwiTGF5ZXIgd2l0aCBqc29ucGF0aCBsaWJcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGFjY291bnRJZCA9IFN0YWNrLm9mKHRoaXMpLmFjY291bnQ7XG5cbiAgICBjb25zdCBnZW5lcmF0ZVNlY3JldFVwZGF0ZUNmZiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJHZW5lcmF0ZVNlY3JldFVwZGF0ZUNmZlwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IEF3cy5TVEFDS19OQU1FICsgXCJfR2VuZXJhdGVTZWNyZXRVcGRhdGVDZmZcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzcsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGEvZ2VuZXJhdGVfc2VjcmV0X3VwZGF0ZV9jZmZcIiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRFTVBPUkFSWV9LRVlfTkFNRTogcHJvcHMuc2VjcmV0cy50ZW1wb3JhcnlTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgUFJJTUFSWV9LRVlfTkFNRTogcHJvcHMuc2VjcmV0cy5wcmltYXJ5U2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIFNFQ09OREFSWV9LRVlfTkFNRTogcHJvcHMuc2VjcmV0cy5zZWNvbmRhcnlTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgQ0ZGX05BTUU6IHByb3BzLmNoZWNrVG9rZW5GdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG5cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGdlbmVyYXRlU2VjcmV0VXBkYXRlQ2ZmLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJjbG91ZGZyb250OkRlc2NyaWJlRnVuY3Rpb25cIixcbiAgICAgICAgICBcImNsb3VkZnJvbnQ6VXBkYXRlRnVuY3Rpb25cIixcbiAgICAgICAgICBcImNsb3VkZnJvbnQ6UHVibGlzaEZ1bmN0aW9uXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLmNoZWNrVG9rZW5GdW5jdGlvbi5mdW5jdGlvbkFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTZXQgTGFtYmRhIExvZ3MgUmV0ZW50aW9uIGFuZCBSZW1vdmFsIFBvbGljeVxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIFwiR2VuZXJhdGVOZXdTZWNyZXRMb2dzXCIsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogXCIvYXdzL2xhbWJkYS9cIiArIGdlbmVyYXRlU2VjcmV0VXBkYXRlQ2ZmLmZ1bmN0aW9uTmFtZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGdldExhc3RNb2RpZmllZFRpbWUgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiR2V0TGFzdE1vZGlmaWVkVGltZVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IEF3cy5TVEFDS19OQU1FICsgXCJfR2V0TGFzdE1vZGlmaWVkVGltZVwiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS9nZXRfbGFzdF9tb2RpZmllZF90aW1lXCIpLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNQVhfSVRFUkFUSU9OUzogXCI1XCJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGdldExhc3RNb2RpZmllZFRpbWUuYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImNsb3VkZnJvbnQ6R2V0KlwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICAvL1xuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU2V0IExhbWJkYSBMb2dzIFJldGVudGlvbiBhbmQgUmVtb3ZhbCBQb2xpY3lcbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCBcIkxhc3RNb2RpZmllZFRpbWVMb2dzXCIsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogXCIvYXdzL2xhbWJkYS9cIiArIGdldExhc3RNb2RpZmllZFRpbWUuZnVuY3Rpb25OYW1lLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgY29uc3QgZ2V0RGlzdHJpYnV0aW9uc0ZvckNmZiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXREaXN0cmlidXRpb25zTGlzdFwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IEF3cy5TVEFDS19OQU1FICsgXCJfR2V0RGlzdHJpYnV0aW9uc0ZvckNmZlwiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS9nZXRfZGlzdHJpYnV0aW9uc19mb3JfY2ZmXCIpLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBDRkZfTkFNRTogcHJvcHMuY2hlY2tUb2tlbkZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgQUNDT1VOVF9JRDogYWNjb3VudElkLFxuICAgICAgfSxcbiAgICAgIGxheWVyczogW2pzb25QYXRoTGF5ZXJdLFxuICAgIH0pO1xuXG5cbiAgICBnZXREaXN0cmlidXRpb25zRm9yQ2ZmLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZGZyb250Okxpc3QqXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICAgIC8vXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTZXQgTGFtYmRhIExvZ3MgUmV0ZW50aW9uIGFuZCBSZW1vdmFsIFBvbGljeVxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIFwidXBkYXRlQ0ZGTG9nc1wiLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IFwiL2F3cy9sYW1iZGEvXCIgKyBnZXREaXN0cmlidXRpb25zRm9yQ2ZmLmZ1bmN0aW9uTmFtZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuXG4gICAgbmV3IEluaXRTZWNyZXRzKHRoaXMsIFwiSW5pdFwiLCB7XG4gICAgICBmdW5jdGlvbkFybjogZ2VuZXJhdGVTZWNyZXRVcGRhdGVDZmYuZnVuY3Rpb25Bcm4sXG4gICAgICBmdW5jdGlvbk5hbWU6IGdlbmVyYXRlU2VjcmV0VXBkYXRlQ2ZmLmZ1bmN0aW9uTmFtZVxuICAgIH0pO1xuXG4gICAgLy9HZW5lcmF0ZSB0b2tlblxuICAgIGNvbnN0IHN3YXBTZWNyZXRzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlN3YXBTZWNyZXRzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogQXdzLlNUQUNLX05BTUUgKyBcIl9Td2FwU2VjcmV0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYS9zd2FwX3NlY3JldHNcIiksXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBURU1QT1JBUllfS0VZX05BTUU6IHByb3BzLnNlY3JldHMudGVtcG9yYXJ5U2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIFBSSU1BUllfS0VZX05BTUU6IHByb3BzLnNlY3JldHMucHJpbWFyeVNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICBTRUNPTkRBUllfS0VZX05BTUU6IHByb3BzLnNlY3JldHMuc2Vjb25kYXJ5U2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU2V0IExhbWJkYSBMb2dzIFJldGVudGlvbiBhbmQgUmVtb3ZhbCBQb2xpY3lcbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCBcIktleVJvdGF0aW9uTG9nc1wiLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IFwiL2F3cy9sYW1iZGEvXCIgKyBzd2FwU2VjcmV0cy5mdW5jdGlvbk5hbWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvL3Blcm1pc3Npb25zIGZvciBTZWNyZXRzIE1hbmFnZXJcbiAgICAvL1xuICAgIC8vZ2VuZXJhdGVTZWNyZXRVcGRhdGVDZmZcbiAgICBwcm9wcy5zZWNyZXRzLnRlbXBvcmFyeVNlY3JldC5ncmFudFdyaXRlKGdlbmVyYXRlU2VjcmV0VXBkYXRlQ2ZmKTtcbiAgICBwcm9wcy5zZWNyZXRzLnByaW1hcnlTZWNyZXQuZ3JhbnRXcml0ZShnZW5lcmF0ZVNlY3JldFVwZGF0ZUNmZik7XG4gICAgcHJvcHMuc2VjcmV0cy5zZWNvbmRhcnlTZWNyZXQuZ3JhbnRXcml0ZShnZW5lcmF0ZVNlY3JldFVwZGF0ZUNmZik7XG4gICAgcHJvcHMuc2VjcmV0cy5wcmltYXJ5U2VjcmV0LmdyYW50UmVhZChnZW5lcmF0ZVNlY3JldFVwZGF0ZUNmZik7XG5cblxuICAgIC8vc3dhcFNlY3JldHNcbiAgICBwcm9wcy5zZWNyZXRzLnRlbXBvcmFyeVNlY3JldC5ncmFudFJlYWQoc3dhcFNlY3JldHMpO1xuICAgIHByb3BzLnNlY3JldHMudGVtcG9yYXJ5U2VjcmV0LmdyYW50V3JpdGUoc3dhcFNlY3JldHMpO1xuXG4gICAgcHJvcHMuc2VjcmV0cy5wcmltYXJ5U2VjcmV0LmdyYW50V3JpdGUoc3dhcFNlY3JldHMpO1xuICAgIHByb3BzLnNlY3JldHMucHJpbWFyeVNlY3JldC5ncmFudFJlYWQoc3dhcFNlY3JldHMpO1xuXG4gICAgcHJvcHMuc2VjcmV0cy5zZWNvbmRhcnlTZWNyZXQuZ3JhbnRXcml0ZShzd2FwU2VjcmV0cyk7XG4gICAgcHJvcHMuc2VjcmV0cy5zZWNvbmRhcnlTZWNyZXQuZ3JhbnRSZWFkKHN3YXBTZWNyZXRzKTtcblxuXG4gICAgY29uc3QgZ2VuZXJhdGVOZXdTZWNyZXRKb2IgPSBuZXcgdGFza3MuTGFtYmRhSW52b2tlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiR2V0IGRpc3RyaWJ1dGlvbnMgZm9yIENsb3VkRnJvbnQgRnVuY3Rpb25cIixcbiAgICAgIHtcbiAgICAgICAgbGFtYmRhRnVuY3Rpb246IGdldERpc3RyaWJ1dGlvbnNGb3JDZmYsXG4gICAgICAgIG91dHB1dFBhdGg6IFwiJFwiLFxuICAgICAgICByZXN1bHRTZWxlY3Rvcjoge1xuICAgICAgICAgIFwiT3V0cHV0LiRcIjogXCIkLlBheWxvYWRcIixcbiAgICAgICAgfSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc3QgdXBkYXRlQ2xvdWRGcm9udEZ1bmN0aW9uSm9iID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkdlbmVyYXRlIHNlY3JldHMgJiB1cGRhdGUgQ2xvdWRGcm9udCBGdW5jdGlvblwiLFxuICAgICAge1xuICAgICAgICBsYW1iZGFGdW5jdGlvbjogZ2VuZXJhdGVTZWNyZXRVcGRhdGVDZmYsXG4gICAgICAgIHJlc3VsdFBhdGg6IEpzb25QYXRoLkRJU0NBUkQsXG4gICAgICAgIHJlc3VsdFNlbGVjdG9yOiB7XG4gICAgICAgICAgXCJPdXRwdXQuJFwiOiBcIiQuUGF5bG9hZFwiLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBnZXRMYXN0TW9kaWZpZWRUaW1lSm9iID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkdldCBMYXN0IE1vZGlmaWVkIFRpbWVcIixcbiAgICAgIHtcbiAgICAgICAgbGFtYmRhRnVuY3Rpb246IGdldExhc3RNb2RpZmllZFRpbWUsXG4gICAgICAgIG91dHB1dFBhdGg6IFwiJC5PdXRwdXRcIixcbiAgICAgICAgcmVzdWx0U2VsZWN0b3I6IHtcbiAgICAgICAgICBcIk91dHB1dC4kXCI6IFwiJC5QYXlsb2FkXCIsXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcblxuICAgIGNvbnN0IHN3YXBTZWNyZXRzSm9iID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCBcIlN3YXAgc2VjcmV0c1wiLCB7XG4gICAgICBsYW1iZGFGdW5jdGlvbjogc3dhcFNlY3JldHMsXG4gICAgfSk7XG5cbiAgICBjb25zdCB3YWl0ID0gbmV3IHNmbi5XYWl0KHRoaXMsICdXYWl0IDEgbWludXRlJywge1xuICAgICAgdGltZTogc2ZuLldhaXRUaW1lLmR1cmF0aW9uKER1cmF0aW9uLm1pbnV0ZXMoMSkpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFwID0gbmV3IHNmbi5NYXAodGhpcywgXCJNYXAgU3RhdGVcIiwge1xuICAgICAgbWF4Q29uY3VycmVuY3k6IDEsXG4gICAgICBpbnB1dFBhdGg6IHNmbi5Kc29uUGF0aC5zdHJpbmdBdChcIiQuT3V0cHV0LmRpc3RyaWJ1dGlvbnNcIiksXG4gICAgICByZXN1bHRQYXRoOiBzZm4uSnNvblBhdGguRElTQ0FSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNoZWNrQ29uZGl0aW9ucyA9IG5ldyBzZm4uQ2hvaWNlKHRoaXMsIFwiS2VlcCB3YWl0aW5nP1wiKVxuICAgIC53aGVuKHNmbi5Db25kaXRpb24uYm9vbGVhbkVxdWFscyhcIiQuY29udGludWVcIiwgZmFsc2UpLCBuZXcgc2ZuLkZhaWwodGhpcywgXCJGYWlsIHByb3BhZ2F0aW5nXCIpKVxuICAgIC5vdGhlcndpc2Uod2FpdC5uZXh0KGdldExhc3RNb2RpZmllZFRpbWVKb2IpKVxuXG4gICAgY29uc3QgdXBkYXRlUHJvcGFnYXRlZCA9IG5ldyBzZm4uQ2hvaWNlKHRoaXMsIFwiVXBkYXRlIHByb3BhZ2F0ZWQ/XCIpXG4gICAgLndoZW4oc2ZuLkNvbmRpdGlvbi5ib29sZWFuRXF1YWxzKFwiJC5wcm9wYWdhdGVkXCIsIGZhbHNlKSwgY2hlY2tDb25kaXRpb25zKVxuICAgIC5vdGhlcndpc2UobmV3IHNmbi5TdWNjZWVkKHRoaXMsIFwiUHJvcGFnYXRpb24gT0tcIikpXG5cblxuICAgIG1hcC5pdGVyYXRvcihnZXRMYXN0TW9kaWZpZWRUaW1lSm9iLm5leHQodXBkYXRlUHJvcGFnYXRlZCkpO1xuICAgIC8vIFN0ZXAgZnVuY3Rpb24gdG8gb3JjaGVzdHJhdGUgZ2VuZXJhdGluZyBhIG5ldyBzZWNyZXRcblxuICAgIGNvbnN0IHdvcmtmbG93ID0gbmV3IHNmbi5TdGF0ZU1hY2hpbmUodGhpcywgXCJSb3RhdGVcIiwge1xuICAgICAgc3RhdGVNYWNoaW5lTmFtZTogQXdzLlNUQUNLX05BTUUgKyBcIl9Sb3RhdGVTZWNyZXRcIixcbiAgICAgIGRlZmluaXRpb246IGdlbmVyYXRlTmV3U2VjcmV0Sm9iLm5leHQodXBkYXRlQ2xvdWRGcm9udEZ1bmN0aW9uSm9iKS5uZXh0KG1hcCkubmV4dChzd2FwU2VjcmV0c0pvYiksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgIC8vbG9nczoge1xuICAgICAgLy8gIGRlc3RpbmF0aW9uOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCBcIlNGTG9nR3JvdXBcIiksXG4gICAgICAvLyAgbGV2ZWw6IHNmbi5Mb2dMZXZlbC5BTEwsXG4gICAgICAvL30sXG4gICAgfSk7XG5cbiAgICBjb25zdCB0cmlnZ2VyRnJlcXVlbmN5ID1cbiAgICAgIHByb3BzLmNvbmZpZ3VyYXRpb24ubWFpbj8ucm90YXRlX3NlY3JldHNfZnJlcXVlbmN5IHx8IDA7XG4gICAgaWYgKHRyaWdnZXJGcmVxdWVuY3kgPiAwKSB7XG4gICAgICAvLyBUcmlnZ2VyIFNmbiB0byByb3RhdGUgdGhlIHNlY3JldHMgZXZlcnkgWCBtaW51dGVzXG4gICAgICBjb25zdCBydWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsIFwiUnVsZTFcIiwge1xuICAgICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoRHVyYXRpb24ubWludXRlcyh0cmlnZ2VyRnJlcXVlbmN5KSksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRyaWdnZXIgU3RlcEZ1bmN0aW9uIHRvIHJvdGF0ZSBzZWNyZXRzXCIsXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgcnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHdvcmtmbG93KSk7XG4gICAgfVxuXG4gICAgdGhpcy53b3JrZmxvd0FybiA9IHdvcmtmbG93LnN0YXRlTWFjaGluZUFybjtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJTRlJvdGF0ZVNlY3JldHNcIiwge1xuICAgICAgdmFsdWU6IHdvcmtmbG93LnN0YXRlTWFjaGluZU5hbWUsXG4gICAgICBleHBvcnROYW1lOiBBd3MuU1RBQ0tfTkFNRSArIFwiU0ZSb3RhdGVTZWNyZXRzXCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJUaGUgbmFtZSBvZiB0aGUgU3RlcCBGdW5jdGlvbiB0byByb3RhdGUgc2VjcmV0c1wiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=