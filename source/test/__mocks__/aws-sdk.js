const mockSecretData = {
  ARN: 'x',
  Name: 'my_secret',
  SecretString: '{"secret1_key_to_replace":"secret1_value_to_replace"}',
}  

class AWS {
  
  static SecretsManager = class {
    
    getSecretValue = jest.fn(secretId =>{
      return {
        promise: function () {
          return mockSecretData;
        }
      };
    }
    )

    putSecretValue = jest.fn(secretId =>{
      return {
        promise: function () {
          return "";
        }
      };
    }
    )
  }

  static DynamoDB = class {
    
    static DocumentClient = class {
      get = jest.fn().mockImplementation(() => ({ promise:  function () {
        return {
          "Item": {
              "url_path": "/out/v1/abcd/index.m3u8",
              "id": "1",
              "endpoint_hostname": "https://aaaaaa.cloudfront.net",
              "token_policy": {
                  "headers": [
                      "user-agent"
                  ],
                  "exc": [
                      "/ads/"
                  ],
                  "nbf": "1645000000",
                  "session_auto_generate": 12,
                  "cty_fallback": true,
                  "paths": [
                      "/out/v1/abcd/"
                  ],
                  "ip": false,
                  "cty": false,
                  "co_fallback": true,
                  "co": false,
                  "exp": "+3h",
                  "ssn": true
              }
          }
      };
      } }));
    }

    putItem = jest.fn().mockImplementation(() => ({ promise:  function () {
      return "";
    } }));

    query = jest.fn(param =>{
      return {
        promise: function () {
          return {
            "session_id": {
              "S": "sessionid1"
            },
            "ip_penalty": {
              "N": "123332"
            },
            "ip_rate": {
              "N": "4567854"
            },
            "last_updated": {
              "N": "1658409174"
            },
            "reason": {
              "S": "COMPROMISED"
            },
            "referer_penalty": {
              "N": "456544"
            },
            "score": {
              "N": "1234561"
            },
            "ttl": {
              "N": "1659000558"
            },
            "type": {
              "S": "AUTO"
            },
            "ua_penalty": {
              "N": "1111222"
            }
          }
        }
      };
    }
    )

  }

  static IAM = class {
    
    createPolicy = jest.fn(param =>{
      return {
        promise: function () {
          
        }
      };
    }
    )

    attachRolePolicy = jest.fn(param =>{
      return {
        promise: function () {
          
        }
      };
    }
    )
  }

  static Lambda = class {
    
    updateFunctionConfiguration = jest.fn(param =>{
      return {
        promise: function () {
          
        }
      };
    }
    )

   
  }

  static WAFV2 = class {
    
    getRuleGroup = jest.fn(param =>{
      return {
        promise: function () {
          
        }
      };
    }
    )

    updateRuleGroup = jest.fn(param =>{
      return {
        promise: function () {
          
        }
      };
    }
    )

   
  }


  


  
        
}


module.exports = AWS