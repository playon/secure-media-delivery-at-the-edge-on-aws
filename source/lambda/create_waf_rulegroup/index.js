var AWS = require('aws-sdk');
const ssm = new AWS.SSM();
const wafv2 = AWS.WAFV2({apiVersion: '2019-07-29'});

const WCU = process.env.WCU;
const STACK_NAME = process.env.STACK_NAME;
const RULE_NAME = process.env.STARULE_NAMECK_NAME;



exports.handler = async (event, context) => {

    console.log("Event=" + JSON.stringify(event));
    try {
        // Creates WAF Rule Group
        var params = {
            Capacity: parseInt(WCU),
            Name: RULE_NAME,
            Scope: 'CLOUDFRONT',
            visibilityConfig: {
                CloudWatchMetricsEnabled: false,
                MetricName: "metricName",
                SampledRequestsEnabled: false,
            },
            Description: "Revoked sessions",
            Rules: [],
        };

        let result = await wafv2.createRuleGroup(params).promise();
        console.log(result);
        //saveSecret(RULE_NAME, result.);
    } catch (error) {
        console.error(error);
        throw Error('Creating WAF Rule group failed.');
    }

}

const saveSecret = (paramName, paramValue) => {
    console.log('Saving to SSM...');

    const  params = {
      Name: paramName,
      Value: paramValue,
      Type: 'String',
      Overwrite: true
    };

    ssm.putParameter(params, (err, data) => {
      if (err) {
        console.log(err, err.stack);
      }
    });

  };
