#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { getOpts } from "../helpers/opts";

import "source-map-support/register";
import { SecureMediaStreamingStack } from "../lib/secure_media_stream_stack";
import { AutoSessionRevocationStack } from "../lib/auto_session_revocation";
import { RuleGroupStack } from "../lib/rule_group_stack";

const app = new cdk.App();

(async () => {
  // The stack configuration.
  const config = await getOpts();

  const account =
    app.node.tryGetContext("account") ||
    process.env.CDK_DEPLOY_ACCOUNT ||
    process.env.CDK_DEFAULT_ACCOUNT;
  const region =
    app.node.tryGetContext("region") ||
    process.env.CDK_DEPLOY_REGION ||
    process.env.CDK_DEFAULT_REGION;

  const ruleGroupStack = new RuleGroupStack(
    app,
    config.main?.stack_name! + "RuleGroup",
    config,
    {
      env: {
        account: account,
        region: "us-east-1",
      },
    }
  );

  console.log(account);
  console.log(region);

  const coreStack = new SecureMediaStreamingStack(
    app,
    config.main?.stack_name!,
    config,
    ruleGroupStack.ruleGroupParamName,
    ruleGroupStack.ruleGroupParamId,
    {
      env: {
        account: account,
        region: region,
      },
    }
  );
  coreStack.addDependency(ruleGroupStack);

  if (config.sessionRevocation) {
    new AutoSessionRevocationStack(
      app,
      config.main?.stack_name! + "AutoSessionRevocation",
      config,
      coreStack.sessionToRevoke,
      {
        env: {
          account: account,
          region: region,
        },
      }
    );
  }
})();
