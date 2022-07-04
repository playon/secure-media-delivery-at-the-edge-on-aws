import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { Secrets } from '../lib/main/secrets';
import { CWDashboard } from '../lib/main/dashboard';

test('Create CW dashboard', () => {
  const stack = new cdk.Stack();
  // WHEN
  new CWDashboard(stack, 'Dashboard')
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
});
