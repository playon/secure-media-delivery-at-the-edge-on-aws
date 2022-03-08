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
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  aws_lambda as lambda,
  aws_cloudfront as cloudfront,
  aws_logs as logs,
  aws_iam as iam,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_events as events,
  aws_events_targets as targets,
  //aws_lambda_nodejs as node
} from "aws-cdk-lib";

//import * as fs from 'fs';
//import * as path from 'path';

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Secrets } from "./secrets";

/**
 * The properties expected by the config construct.
 */
export interface IConfigProps {
  /**
   * Secret object
   */
  secrets: Secrets;

  /**
   * CloudFront function
   */
  checkTokenFunction: cloudfront.IFunction;

  configuration: IConfiguration;
}

export class RotateSecretsWorkflow extends Construct {
  public readonly workflowName: string;

  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    //jsonpath layer
    const jsonPathLayer = new lambda.LayerVersion(this, "JsonPathLayer", {
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_7],
      code: lambda.Code.fromAsset("lambda/layers/jsonpath"),
      description: "Layer with jsonpath lib",
    });

    const accountId = Stack.of(this).account;

    const generateNewSecret = new lambda.Function(this, "GenerateNewSecret", {
      functionName: Aws.STACK_NAME + "_GenerateNewSecret",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/generate_new_secret"),
      handler: "index.handler",
      environment: {
        TEMPORARY_KEY_NAME: props.secrets.temporarySecret.secretName,
        PRIMARY_KEY_NAME: props.secrets.primarySecret.secretName,
        CFF_NAME: props.checkTokenFunction.functionName,
        ACCOUNT_ID: accountId,
      },
      layers: [jsonPathLayer],
    });

    generateNewSecret.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudfront:List*"],
        resources: ["*"],
        //
      })
    );
    // Set Lambda Logs Retention and Removal Policy
    new logs.LogGroup(this, "GenerateNewSecretLogs", {
      logGroupName: "/aws/lambda/" + generateNewSecret.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    //Generate token
    const swapSecrets = new lambda.Function(this, "SwapSecrets", {
      functionName: Aws.STACK_NAME + "_SwapSecrets",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/swap_secrets"),
      handler: "index.lambda_handler",
      environment: {
        TEMPORARY_KEY_NAME: props.secrets.temporarySecret.secretName,
        PRIMARY_KEY_NAME: props.secrets.primarySecret.secretName,
        SECONDARY_KEY_NAME: props.secrets.secondarySecret.secretName,
      },
    });

    // Set Lambda Logs Retention and Removal Policy
    new logs.LogGroup(this, "KeyRotationLogs", {
      logGroupName: "/aws/lambda/" + swapSecrets.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    props.secrets.temporarySecret.grantWrite(generateNewSecret);
    props.secrets.primarySecret.grantRead(generateNewSecret);

    props.secrets.temporarySecret.grantRead(swapSecrets);
    props.secrets.temporarySecret.grantWrite(swapSecrets);
    props.secrets.primarySecret.grantWrite(swapSecrets);
    props.secrets.primarySecret.grantRead(swapSecrets);
    props.secrets.secondarySecret.grantWrite(swapSecrets);
    props.secrets.secondarySecret.grantRead(swapSecrets);

    generateNewSecret.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cloudfront:DescribeFunction",
          "cloudfront:UpdateFunction",
          "cloudfront:PublishFunction",
        ],
        resources: [props.checkTokenFunction.functionArn],
      })
    );

    const generateNewSecretJob = new tasks.LambdaInvoke(
      this,
      "Generate new secret & get Last Timestamp for each CF Distribution",
      {
        lambdaFunction: generateNewSecret,
        outputPath: "$",
        resultSelector: {
          "Output.$": "$.Payload",
        },
      }
    );

    const swapSecretsJob = new tasks.LambdaInvoke(this, "Swap secrets", {
      lambdaFunction: swapSecrets,
    });

    const getLastTimestamp = new tasks.CallAwsService(this, "Get Last Timestamp",{
            service: "cloudfront",
            action: "getDistribution",
            resultPath :"$.Output",
            resultSelector: {
              "Result.$": "$.Distribution.LastModifiedTime"
              },
            parameters: {
                "Id.$": "$.id"
            },
            iamResources: ['*']

        })

/*    const pass = new sfn.Pass(this, "Check Last Timestamp", {
      result: sfn.Result.fromObject({ hello: "world" }),
      resultPath: "$.subObject",
    });
*/
    //Save_to_dynamodb
    /*const wait = new sfn.Wait(this, 'Wait 1 minute', {
      time: sfn.WaitTime.duration(Duration.minutes(1)),
    });*/

    const map = new sfn.Map(this, "Map State", {
      maxConcurrency: 1,
      inputPath: sfn.JsonPath.stringAt("$.Output.distributions"),
      resultPath: sfn.JsonPath.DISCARD,
    });

    /*const updatePropagated = new sfn.Choice(this, "Update propagated?").when(
      sfn.Condition.isPresent("$.GetQueryResults.NextToken"),
      wait.next(map)
    ).otherwise(new sfn.Succeed(this, "Done"))
  */

    map.iterator(getLastTimestamp.next(new sfn.Pass(this, "Pass")));

    const log_group = new logs.LogGroup(this, "RotateSecretSFLogGroup");

    // Step function to orchestrate generating a new secret
    const workflow = new sfn.StateMachine(this, "RotateSecret", {
      stateMachineName: Aws.STACK_NAME + "_RotateSecret",
      definition: generateNewSecretJob.next(map).next(swapSecretsJob),
      timeout: Duration.minutes(60),
      logs: {
        destination: log_group,
        level: sfn.LogLevel.ALL,
      },
    });

    const triggerFrequency =
      props.configuration.core?.rotate_secrets_frequency || 0;
    if (triggerFrequency > 0) {
      // Trigger Sfn to rotate the secrets every X minutes
      const rule = new events.Rule(this, "RuleRotateSecrets", {
        schedule: events.Schedule.rate(Duration.minutes(triggerFrequency)),
        description: "Trigger StepFunction to rotate secrets",
        enabled: true,
      });

      rule.addTarget(new targets.SfnStateMachine(workflow));
    }

    this.workflowName = workflow.stateMachineName;

    new CfnOutput(this, "SFRotateSecrets", {
      value: workflow.stateMachineName,
      exportName: Aws.STACK_NAME + "SFRotateSecrets",
      description: "The name of the Step Function to rotate secrets",
    });
  }
}
