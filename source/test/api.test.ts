import { Template } from 'aws-cdk-lib/assertions';
import { CrLoadAssetsTable } from '../lib/custom_resources/cr_load_assets_table';
import { IConfiguration } from '../helpers/validators/configuration';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';
import { CrLoadSqlParams } from '../lib/custom_resources/cr_load_athena_config_table';
import { CRUpdateLERole } from '../lib/custom_resources/cr_update_le_role';
import { Api } from '../lib/api/api';
import { Secrets } from '../lib/main/secrets';
import { CWDashboard } from '../lib/main/dashboard';
import { GetInputParameters } from '../lib/cfn/check_input_parameters';

test('Create Api', () => {
  const stack = new Stack();
  // WHEN

  const secrets = new Secrets(stack, "Secrets");
  const dashboard = new CWDashboard(stack, "CoreDashboard");
  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
  });
  const parameters = new GetInputParameters(stack, "InputParameters", {} as IConfiguration,);


  new Api(stack, 'Api', {
    configuration: {} as IConfiguration,
    secrets: secrets,
    dashboard: dashboard,
    sessionsTable: myTable,
    sig4LambdaVersionParamName: "sig4LambdaVersionParamName",
    sig4LambdaRoleArn: "sig4LambdaRoleArn",
    parameters: parameters
    
  })
  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::Lambda::LayerVersion", 2);
  template.resourceCountIs("AWS::DynamoDB::Table", 2);
  template.resourceCountIs("Custom::AWS", 3);
  template.resourceCountIs("AWS::Lambda::Function",5);
  template.resourceCountIs("AWS::Logs::LogGroup", 2);


  

});
