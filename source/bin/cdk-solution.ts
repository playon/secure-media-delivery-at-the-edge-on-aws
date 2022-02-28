#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import 'source-map-support/register';
import { CoreStack } from '../lib/core_stack';
import { SessionRevocationStack } from '../lib/session_revocation_stack';

const app = new cdk.App();

new CoreStack(app, 'CoreStack');
new SessionRevocationStack(app, 'SessionRevocationStack',{
        env: {
            region: process.env.CDK_DEFAULT_REGION,
            account: process.env.CDK_DEFAULT_ACCOUNT,
        }
    });
