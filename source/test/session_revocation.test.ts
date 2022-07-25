import { Template } from 'aws-cdk-lib/assertions';
import { 
  aws_dynamodb as dynamodb,
  Stack
} from "aws-cdk-lib";
import { SessionRevocation } from '../lib/main/session_revocation';


test('Session revocation', () => {
  const stack = new Stack();
  // WHEN
  
  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    stream: dynamodb.StreamViewType.KEYS_ONLY,
  });

  new SessionRevocation(stack, "SessionRevocation", {
    sessionToRevoke: myTable,
    gsi_index_name: "GSI_NAME",
    wcu: "1",
    retention: "10",
    ruleNameParamName: "WAF_RULE_NAME_SSM_PARAM",
    ruleIdParamName: "WAF_RULE_ID_SSM_PARAM",
  });

  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("Custom::AWS", 1);
  template.resourceCountIs("AWS::Lambda::Function", 2);
  template.resourceCountIs("AWS::Logs::LogGroup", 1);



});
