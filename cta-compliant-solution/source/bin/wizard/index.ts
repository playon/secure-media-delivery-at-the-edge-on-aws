#!/usr/bin/env node

import * as prompts from 'prompts';
import * as fs from 'fs';
import * as path from 'path';

interface CTAConfiguration {
  main: {
    stackName: string;
    region: string;
    enableAutoRevocation: boolean;
    revocationFrequency: string;
    enableDemo: boolean;
  };
  bedrock?: {
    model: string;
    region: string;
  };
}

const onCancel = () => {
  console.log('Deployment cancelled');
  process.exit(0);
};

const questions = [
  {
    type: 'text',
    name: 'stackName',
    message: 'Stack name for CTA deployment:',
    initial: 'CTASecureMedia',
    validate: (value: string) => value.length > 0 || 'Stack name required'
  },
  {
    type: 'select',
    name: 'region',
    message: 'AWS Region:',
    choices: [
      { title: 'us-east-1 (N. Virginia)', value: 'us-east-1' },
      { title: 'us-west-2 (Oregon)', value: 'us-west-2' },
      { title: 'eu-west-1 (Ireland)', value: 'eu-west-1' },
      { title: 'ap-southeast-1 (Singapore)', value: 'ap-southeast-1' }
    ],
    initial: 0
  },
  {
    type: 'confirm',
    name: 'enableDemo',
    message: 'Deploy demo website?',
    initial: true
  },
  {
    type: 'confirm',
    name: 'enableAutoRevocation',
    message: 'Enable AI-powered auto-revocation?',
    initial: true
  },
  {
    type: ((prev: any, values: any) => values.enableAutoRevocation ? 'select' : null) as any,
    name: 'revocationFrequency',
    message: 'Auto-revocation frequency:',
    choices: [
      { title: '5 minutes', value: '5m' },
      { title: '10 minutes', value: '10m' },
      { title: '30 minutes', value: '30m' },
      { title: '1 hour', value: '1h' }
    ],
    initial: 1
  },
  {
    type: ((prev: any, values: any) => values.enableAutoRevocation ? 'select' : null) as any,
    name: 'bedrockModel',
    message: 'Bedrock model for analysis:',
    choices: [
      { title: 'Nova Pro (recommended)', value: 'amazon.nova-pro-v1:0' },
      { title: 'Nova Lite (faster/cheaper)', value: 'amazon.nova-lite-v1:0' }
    ],
    initial: 0
  },
  {
    type: ((prev: any, values: any) => values.enableAutoRevocation ? 'select' : null) as any,
    name: 'bedrockRegion',
    message: 'Bedrock region:',
    choices: [
      { title: 'us-east-1', value: 'us-east-1' },
      { title: 'us-west-2', value: 'us-west-2' }
    ],
    initial: 0
  }
];

async function main() {
  console.log('🔐 CTA-5007-B Secure Media Delivery Setup\n');
  
  const answers = await prompts(questions as any, { onCancel });
  
  const config: CTAConfiguration = {
    main: {
      stackName: answers.stackName,
      region: answers.region,
      enableAutoRevocation: answers.enableAutoRevocation,
      revocationFrequency: answers.revocationFrequency || '10m',
      enableDemo: answers.enableDemo
    }
  };
  
  if (answers.enableAutoRevocation) {
    config.bedrock = {
      model: answers.bedrockModel,
      region: answers.bedrockRegion
    };
  }
  
  // Write configuration
  const configPath = path.resolve(__dirname, '..', '..', '..', 'cta.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log('\n✅ Configuration saved to cta.config.json');
  console.log('\n📋 Summary:');
  console.log(`   Stack: ${config.main.stackName}`);
  console.log(`   Region: ${config.main.region}`);
  console.log(`   Demo Site: ${config.main.enableDemo ? 'Yes' : 'No'}`);
  console.log(`   Auto-Revocation: ${config.main.enableAutoRevocation ? 'Yes' : 'No'}`);
  
  if (config.bedrock) {
    console.log(`   Bedrock Model: ${config.bedrock.model}`);
  }
  
  console.log('\n🚀 Ready to deploy! Run: npx cdk deploy');
}

main().catch(console.error);
