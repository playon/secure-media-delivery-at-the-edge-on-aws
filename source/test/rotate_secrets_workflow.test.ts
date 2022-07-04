import { Template } from 'aws-cdk-lib/assertions';
import {  Aws, aws_cloudfront as cloudfront, Stack,
} from 'aws-cdk-lib';
import { RotateSecretsWorkflow } from '../lib/main/rotate_secrets_workflow';
import { Secrets } from '../lib/main/secrets';
import { IConfiguration } from '../helpers/validators/configuration';

test('Secrets Created', () => {
  const stack = new Stack();
  // WHEN
  const secrets = new Secrets(stack, "Secrets");

  const checkToken = new cloudfront.Function(stack, "CheckJWTTokenFunction", {
    code: cloudfront.FunctionCode.fromFile({
      filePath: "lambda/generate_secret_update_cff/index.js",
    }),
    functionName: Aws.STACK_NAME + "_checkJWTToken",
    comment:
      "CloudFront Function used to check a JWT token",
  });

  new RotateSecretsWorkflow(stack, 'RotateSecrets',
  {
    secrets: secrets,
    checkTokenFunction: checkToken,
    configuration: {} as IConfiguration,
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
  template.resourceCountIs("AWS::Lambda::Function", 3);

});
