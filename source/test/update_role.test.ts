const updateRole = require('../lambda/update_role/index.js');

jest.mock("aws-sdk")

describe('process.env', () => {
  const env = process.env

  beforeEach(() => {
      jest.resetModules()
      process.env = {  
        ROLE_ARN: "arn:aws:iam::xxxxxx:role/MyRoleName",
        API_ARN: "myApiArn",
        STACK_NAME: "MyStackName",
        ACCOUNT_ID: "MyAccountId"
       };
  })

  afterEach(() => {
      process.env = env
  })

  test('update role - result 200', async () => {

    var result = await updateRole.handler({
    });
    expect(result).toEqual("OK");

  });



})

