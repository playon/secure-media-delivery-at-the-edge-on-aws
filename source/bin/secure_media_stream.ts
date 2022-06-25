#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { getOpts } from "../helpers/opts";

import { SecureMediaStreamingStack } from "../lib/secure_media_stream_stack";
import { AutoSessionRevocationStack } from "../lib/auto_session_revocation";
import { DefaultStackSynthesizer } from "aws-cdk-lib";

const app = new cdk.App();

(async () => {
  // The stack configuration.
  const config = await getOpts();

  const stackSynthesizer = config.main?.assets_bucket_name ?  new DefaultStackSynthesizer({  fileAssetsBucketName: config.main?.assets_bucket_name + "-${AWS::Region}"}) : new DefaultStackSynthesizer()

  const coreStack = new SecureMediaStreamingStack(
    app,
    config.main?.stack_name!,
    config,
    {
      synthesizer: stackSynthesizer
    }
  );

  if (config.sessionRevocation) {
    new AutoSessionRevocationStack(
      app,
      config.main?.stack_name! + "AutoSessionRevocation",
      config,
      coreStack.sessionToRevoke
    );
  }
})();
