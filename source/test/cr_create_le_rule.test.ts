import { Template } from 'aws-cdk-lib/assertions';
import { CrLoadAssetsTable } from '../lib/custom_resources/cr_load_assets_table';
import { IConfiguration } from '../helpers/validators/configuration';
import {  aws_dynamodb as dynamodb, Stack
} from 'aws-cdk-lib';
import { CrLoadSqlParams } from '../lib/custom_resources/cr_load_athena_config_table';
import { CRUpdateLERole } from '../lib/custom_resources/cr_update_le_role';
import { CRCreateLEWafRule } from '../lib/custom_resources/cr_create_le_rule';

test('Secrets Created', () => {
  const stack = new Stack();
  // WHEN

  new CRCreateLEWafRule(stack, 'Secrets', {
    WCU: 1,
    LAMBDA_EDGE_VERSION_SSM_PARAM: "LAMBDA_EDGE_VERSION_SSM_PARAM",
    WAF_RULE_NAME_SSM_PARAM: "WAF_RULE_NAME_SSM_PARAM",
    WAF_RULE_ID_SSM_PARAM: "WAF_RULE_ID_SSM_PARAM",
    DEPLOY_LE: true
    
  })
  // THEN

  const template = Template.fromStack(stack);
  //template.resourceCountIs("Custom::AWS", 2);
  template.resourceCountIs("AWS::Lambda::Function", 2);

});
