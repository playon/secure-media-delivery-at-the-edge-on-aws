#!/usr/bin/env node
import  { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { getOpts } from "../helpers/opts";

import { SecureMediaStreamingStack, SecureMediaStreamStackProps } from "../lib/secure_media_stream_stack";
import { AutoSessionRevocationStack } from "../lib/auto_revocation_stack";
import { IConfiguration } from "../helpers/validators/configuration";

const app = new App();
const getProps = (config: IConfiguration): SecureMediaStreamStackProps => {

  const stackSynthesizer = config.main?.assets_bucket_name ?  new DefaultStackSynthesizer({  fileAssetsBucketName: config.main?.assets_bucket_name + "-${AWS::Region}"}) : new DefaultStackSynthesizer()
  const solutionId = 'SO0195';
  const solutionDisplayName = 'Secure Media Delivery at the Edge';
  const solutionVersion = '1.0.0';
  const description = `(${solutionId}) - ${solutionDisplayName}. Version ${solutionVersion}`;

  return {
    description,
    synthesizer: stackSynthesizer
    
  };
};

(async () => {
  // The stack configuration.
  const config = await getOpts();
 
  
  const coreStack = new SecureMediaStreamingStack(
    app,
    config.main?.stack_name!,
    config,
    getProps(config)
    
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
