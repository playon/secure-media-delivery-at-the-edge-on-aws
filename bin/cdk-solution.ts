#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import 'source-map-support/register';
import { CoreStack } from '../lib/core-stack';

const app = new cdk.App();
new CoreStack(app, 'CoreStack');
