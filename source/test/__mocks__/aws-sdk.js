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
  }
}

module.exports = AWS