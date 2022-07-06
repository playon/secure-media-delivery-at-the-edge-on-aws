const mockSecretData = {
  ARN: 'x',
  Name: 'my_secret',
  SecretString: '{"20220704_abcdef":"azerty"}',
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