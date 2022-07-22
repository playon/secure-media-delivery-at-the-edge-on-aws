import { Template } from 'aws-cdk-lib/assertions';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';
import { CRUpdateLERole } from '../lib/custom_resources/cr_update_le_role';

test('Update Lambda Edge role', () => {
  const stack = new Stack();
  // WHEN

  new CRUpdateLERole(stack, 'Secrets', {
    sig4LambdaVersionParamName: "sig4LambdaVersionParamName",
    sig4LambdaRoleArn: "sig4LambdaRoleArn",
    apiArn: "apiArn"
    
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("Custom::AWS", 2);
  template.resourceCountIs("AWS::Lambda::Function", 2);
  template.resourceCountIs("AWS::IAM::Policy", 3);


});
