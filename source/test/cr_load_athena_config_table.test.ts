import { Template } from 'aws-cdk-lib/assertions';
import { CrLoadAssetsTable } from '../lib/custom_resources/cr_load_assets_table';
import { IConfiguration } from '../helpers/validators/configuration';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';
import { CrLoadSqlParams } from '../lib/custom_resources/cr_load_athena_config_table';

test('Load athena config', () => {
  const stack = new Stack();
  // WHEN

  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
  });
  new CrLoadSqlParams(stack, 'LoatAthenaConfig', {
    table: myTable,
    configuration:  {} as IConfiguration
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("Custom::AWS", 1);
});
