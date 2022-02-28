#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { getOpts } from '../helpers/opts';

import 'source-map-support/register';
import { CoreStack } from '../lib/core_stack';
import { SessionRevocationStack } from '../lib/session_revocation_stack';

const app = new cdk.App();
// The stack environment.
const cdkEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  };


(async () => {
    // The stack configuration.
    const config = await getOpts();

    new CoreStack(app, 'CoreStack', config);
    new SessionRevocationStack(app, 'SessionRevocationStack', cdkEnv);
})();