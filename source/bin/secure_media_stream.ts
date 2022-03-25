#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import Aws from 'aws-cdk-lib';
import { getOpts } from '../helpers/opts';

import 'source-map-support/register';
import { SecureMediaStreamingStack } from '../lib/secure_media_stream_stack';
import { AutoSessionRevocationStack } from '../lib/auto_session_revocation';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';

const app = new cdk.App();
// The stack environment.
//const cdkEnv = {
//    account: process.env.CDK_DEFAULT_ACCOUNT,
//    region: process.env.CDK_DEFAULT_REGION
//  };

(async () => {
    // The stack configuration.
    const config = await getOpts();

    new SecureMediaStreamingStack(app, config.main?.stack_name!, config, {
        synthesizer: new DefaultStackSynthesizer({
            fileAssetsBucketName: `my-assets-cdk-bucket`,
            bucketPrefix: 'cdknewstyle/latest/',
          })
        }
        );
    if(config.sessionRevocation){
        new AutoSessionRevocationStack(app, config.main?.stack_name! + 'AutoSessionRevocation', config);
    }


})();