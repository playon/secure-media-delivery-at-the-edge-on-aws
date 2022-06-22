var AWS = require('aws-sdk');
const ssm = new AWS.SSM();
const wafv2 = new AWS.WAFV2({ region: 'us-east-1' });

const WCU = process.env.WCU;
const RULE_NAME = process.env.RULE_NAME;



exports.handler = async (event, context) => {

  console.log("Event=" + JSON.stringify(event));
  try {
    // Creates WAF Rule Group
    var params = {
      Capacity: parseInt(WCU),
      Name: RULE_NAME + '13',
      Scope: 'CLOUDFRONT',
      VisibilityConfig: {
        CloudWatchMetricsEnabled: false,
        MetricName: "metricName",
        SampledRequestsEnabled: false,
      },
      Description: "Revoked sessions",
      Rules: [],
    };

    let result = await wafv2.createRuleGroup(params).promise();
    console.log(result);
    var resp = await saveToSSM(RULE_NAME, result.Summary.Id)
    console.log(resp);
  } catch (error) {
    console.error(error);
    throw Error('Creating WAF Rule group failed.');
  }

}

async function saveToSSM(paramName, paramValue) {
  console.log('Saving to SSM...');

  const params = {
    Name: paramName,
    Value: paramValue,
    Type: 'String',
    Overwrite: true
  };
  var request = await ssm.putParameter(params).promise();
  return request.Parameter;
}



