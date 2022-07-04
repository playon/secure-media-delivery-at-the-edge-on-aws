import { Template } from 'aws-cdk-lib/assertions';
import { CrLoadAssetsTable } from '../lib/custom_resources/cr_load_assets_table';
import { IConfiguration } from '../helpers/validators/configuration';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';
import { CrLoadSqlParams } from '../lib/custom_resources/cr_load_athena_config_table';
import { CRUpdateLERole } from '../lib/custom_resources/cr_update_le_role';

test('Secrets Created', () => {
  const stack = new Stack();
  // WHEN

  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
  });
  new CRUpdateLERole(stack, 'Secrets', {
    sig4LambdaVersionParamName: "sig4LambdaVersionParamName",
    sig4LambdaRoleArn: "sig4LambdaRoleArn",
    apiArn: "apiArn"
    
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("Custom::AWS", 2);
  template.resourceCountIs("AWS::Lambda::Function", 2);

});
