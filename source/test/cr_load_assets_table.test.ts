import { Template } from 'aws-cdk-lib/assertions';
import { CrLoadAssetsTable } from '../lib/custom_resources/cr_load_assets_table';
import { IConfiguration } from '../helpers/validators/configuration';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';

test('Load assets', () => {
  const stack = new Stack();
  // WHEN

  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
  });
  new CrLoadAssetsTable(stack, 'LoadAssetsTable', {
    table: myTable,
    configuration:  {} as IConfiguration
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("Custom::AWS", 1);
});
