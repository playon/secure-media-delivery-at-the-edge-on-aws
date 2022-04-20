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
  aws_wafv2 as wafv2,
  aws_ssm as ssm,
  StackProps,
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";

export class RuleGroupStack extends Stack {
  public readonly ruleGroupParamName: string;
  public readonly ruleGroupParamId: string;

  constructor(
    scope: Construct,
    id: string,
    config: IConfiguration,
    props: StackProps
  ) {
    super(scope, id, props);

    this.ruleGroupParamName = id + "_Name_RS";
    this.ruleGroupParamId = id + "_ID_RS";

    const cfnRuleGroup = new wafv2.CfnRuleGroup(this, "MyCfnRuleGroup", {
      capacity: config.main?.wcu!,
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: false,
        metricName: "metricName",
        sampledRequestsEnabled: false,
      },
      description: "Revoked sessions",
      name: this.ruleGroupParamName,
      rules: [],
    });

    new ssm.StringParameter(this, "RuleGroupId", {
      parameterName: this.ruleGroupParamId,
      description: "Rule Group Id",
      stringValue: cfnRuleGroup.attrId,
    });
  }
}
