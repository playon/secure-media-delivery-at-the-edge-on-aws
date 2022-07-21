const update_rulegroup = require('../lambda/update_rulegroup/index.js');

jest.mock("aws-sdk")

describe('process.env', () => {
  const env = process.env

  beforeEach(() => {
      jest.resetModules()
      process.env = {  
        RULE_ID: "ruleId",
        RULE_NAME: "ruleName",
        RETENTION: "10",
        TABLE_NAME: "myTableName",
        MAX_SESSIONS: "50",
        GSI_INDEX_NAME: "MyGsiIndex",
    };
  })

  afterEach(() => {
      process.env = env
  })



  test('Update rule group - Auto Session - result OK', async () => {

    var result = await update_rulegroup.handler({});

    expect(result.statusCode).toEqual(200);
  


 });





})

