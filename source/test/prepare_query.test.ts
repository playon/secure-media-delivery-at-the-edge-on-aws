const sybmitQuery = require('../lambda/prepare_query/index.js');

jest.mock("aws-sdk")

describe('process.env', () => {
  const env = process.env

  beforeEach(() => {
      jest.resetModules()
      process.env = {  
        ip_penalty: '1',
        referer_penalty: '2',
        ua_penalty: '2',
        ip_rate: '2',
        uri_column_name: 'uri',
        referer_column_name: 'referer_column_name',
        ua_column_name: 'ua_column_name',
        request_ip_column: 'request_ip_column',
        status_column_name: 'status_column_name',
        response_bytes_column_name: 'response_bytes_column_name',
        date_column_name: 'date_column_name',
        time_column_name: 'time_column_name',
        db_name: 'env.db_name',
        table_name: 'table_name',
        min_sessions_number : '10',
        min_session_duration: '1',
        score_threshold: '2.2',
        partitioned: '1',
        lookback_period: '10'
       };
  })

  afterEach(() => {
      process.env = env
  })

  test('Submit query - result OK', async () => {

    var result = await sybmitQuery.handler({});
    expect(result).toHaveLength;
      

  });


})

