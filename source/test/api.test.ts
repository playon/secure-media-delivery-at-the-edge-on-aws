import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { Secrets } from '../lib/secrets';

test('CloudFront distribution Created', () => {
  const stack = new cdk.Stack();
  // WHEN
  new Secrets(stack, 'Secrets')
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::SecretsManager::Secret", 3);
});
