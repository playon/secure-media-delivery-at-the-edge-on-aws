import { Template } from 'aws-cdk-lib/assertions';
import { 
  aws_dynamodb as dynamodb,
  aws_s3 as s3,
  Stack
} from "aws-cdk-lib";
import { AutoRevokeSessionsWorkflow } from '../lib/autorevocation/auto_revocation_workflow';
import { IConfiguration } from '../helpers/validators/configuration';


test('Auto revocation session', () => {
  const stack = new Stack();
  // WHEN
  
  const myTable = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
  });

  new AutoRevokeSessionsWorkflow(
    stack,
    "GetSessions",
    {
      bucket: new s3.Bucket(stack, "SqlQuery"),
      dynamodbTable: myTable,
      configuration: {} as IConfiguration
    }
  );

  // THEN

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::Lambda::Function", 2);
  template.resourceCountIs("AWS::Logs::LogGroup", 3);
  template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);


});
