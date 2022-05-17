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
  Stack,
  Aws,
  StackProps,
  aws_wafv2 as wafv2,
  aws_ssm as ssm,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_cloudtrail as cloudtrail,
  aws_s3 as s3
} from "aws-cdk-lib";
import { Trail } from "aws-cdk-lib/aws-cloudtrail";

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";

export class UsEast1Stack extends Stack {
  public readonly ruleGroup: string;
  public readonly sig4LambdaVersion: string;
  public readonly sig4LambdaArn: string;
  public readonly sig4LambdaRoleArn: string;

  constructor(
    scope: Construct,
    id: string,
    config: IConfiguration,
    props: StackProps
  ) {
    super(scope, id, props);

    const s3Logs = new s3.Bucket(this, "CloudTrailLogsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicPolicy: true,
        blockPublicAcls: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
       }),
    });
    const trail = new cloudtrail.Trail(this, 'CloudTrail', {
      bucket: s3Logs
    });

    this.ruleGroup = id + "_BlockSessions";

    const cfnRuleGroup = new wafv2.CfnRuleGroup(this, "RuleGroup", {
      capacity: config.main?.wcu!,
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: false,
        metricName: "metricName",
        sampledRequestsEnabled: false,
      },
      description: "Revoked sessions",
      name: this.ruleGroup,
      rules: [],
    });

    if (config.api && config.api?.demo) {
      const { managedPolicyArn } = iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      );

      const role = new iam.Role(this, "EdgeLambdaServiceRole", {
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal("lambda.amazonaws.com"),
          new iam.ServicePrincipal("edgelambda.amazonaws.com")
        ),
        managedPolicies: [
          {
            managedPolicyArn,
          },
        ],
      });

      const lambdaEdge = new lambda.Function(this, "LambdaEdge", {
        functionName: Aws.STACK_NAME + "_Sig4Signer",
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/sig4"),
        role: role,
      });

      const { functionArn } = lambdaEdge.currentVersion;

      this.sig4LambdaVersion = id + "_sig4lambdaVersion";
      this.sig4LambdaArn = id + "_sig4lambdaArn";
      this.sig4LambdaRoleArn = id + "_sig4lambdaRoleArn";

      new ssm.StringParameter(this, "Sig4LambdaVersion", {
        parameterName: this.sig4LambdaVersion,
        description: "Sig4 Lambda Version Arn",
        stringValue: functionArn,
      });

      new ssm.StringParameter(this, "Sig4LambdaArn", {
        parameterName: this.sig4LambdaArn,
        description: "Sig4 Lambda Arn",
        stringValue: lambdaEdge.functionArn,
      });

      new ssm.StringParameter(this, "Sig4LambdaRole", {
        parameterName: this.sig4LambdaRoleArn,
        description: "Sig4 Lambda Role arn",
        stringValue: role.roleArn,
      });
    }

    new ssm.StringParameter(this, "RuleGroupId", {
      parameterName: this.ruleGroup,
      description: "Rule Group ID",
      stringValue: cfnRuleGroup.attrId,
    });
  }
}
