const update_rulegroup = require('../lambda/update_rulegroup/index.js');

jest.mock("aws-sdk")

describe('process.env', () => {
  const env = process.env

  beforeEach(() => {
      jest.resetModules()
      process.env = {  
         SUBMIT_QUERY_FUNCTION: "myFunction"
       };
  })

  afterEach(() => {
      process.env = env
  })



  test('Update rule group - result OK', async () => {

    var result = await update_rulegroup.handler({});

    expect(result.statusCode).toEqual(200);
  


 });





})

