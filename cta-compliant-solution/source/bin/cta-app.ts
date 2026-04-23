#!/usr/bin/env node

import { App } from "aws-cdk-lib";
import { CTASecureMediaStack } from "../lib/cta-secure-media-stack";
import { AutoRevocationStack } from "../lib/auto-revocation-stack";
import * as fs from 'fs';
import * as path from 'path';

const app = new App();

// Load configuration
const configPath = path.resolve(__dirname, '..', '..', 'cta.config.json');
let config: any = {
  main: {
    stackName: 'CTASecureMedia',
    region: 'us-east-1',
    enableAutoRevocation: false,
    enableDemo: true
  }
};

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const solutionId = "SO0195-CTA";
const solutionName = "CTA-5007-B Compliant Secure Media Delivery";
const solutionVersion = "v1.0.0";

// Main stack
const mainStack = new CTASecureMediaStack(app, config.main.stackName, {
  description: `${solutionName} - ${solutionVersion}`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.main.region,
  },
  config: config,
});

// Auto-revocation stack (conditional)
if (config.main.enableAutoRevocation) {
  new AutoRevocationStack(app, `${config.main.stackName}AutoRevocation`, {
    description: `${solutionName} - Auto Revocation - ${solutionVersion}`,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: config.main.region,
    },
    kvStore: mainStack.kvStore,
    logStream: mainStack.logStream,
    demoBucket: mainStack.demoBucket,
    config: config,
  });
}
