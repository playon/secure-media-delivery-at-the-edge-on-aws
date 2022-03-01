#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { getOpts } from '../helpers/opts';

import 'source-map-support/register';
import { SecureMediaStreamingStack } from '../lib/secure_media_stream_stack';

const app = new cdk.App();
// The stack environment.
//const cdkEnv = {
//    account: process.env.CDK_DEFAULT_ACCOUNT,
//    region: process.env.CDK_DEFAULT_REGION
//  };

const stackName = app.node.tryGetContext('stackName') || 'SecureMediaStreamingStack';

(async () => {
    // The stack configuration.
    const config = await getOpts();

    new SecureMediaStreamingStack(app, stackName, config);
    //new SessionRevocationStack(app, 'SessionRevocationStack', cdkEnv);
})();