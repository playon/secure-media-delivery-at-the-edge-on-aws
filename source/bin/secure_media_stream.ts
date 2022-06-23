#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { getOpts } from "../helpers/opts";

import { SecureMediaStreamingStack } from "../lib/secure_media_stream_stack";
import { AutoSessionRevocationStack } from "../lib/auto_session_revocation";
import { UsEast1Stack } from "../lib/us_east_1_stack";
import { Aws, DefaultStackSynthesizer } from "aws-cdk-lib";

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

  //const myregion = Aws.REGION;

/*
  const usEast1Stack = new UsEast1Stack(
    app,
    config.main?.stack_name! + "UsEast1Stack",
    config,
    {
      env: {
        account: account,
        region: "us-east-1",
      }
    },

  );
*/
console.log(cdk.Fn.sub("my-bucket-${AWS::Region}"))

  const coreStack = new SecureMediaStreamingStack(
    app,
    config.main?.stack_name!,
    config,
    {
      env: {
        account: account,
        region: region,
      }

    }
  );
  //coreStack.addDependency(usEast1Stack);

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
        }
      }
    );
  }
})();
