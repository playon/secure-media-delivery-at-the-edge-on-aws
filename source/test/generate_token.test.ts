const { handler } = require('../lambda/generate_token/nodejs');
jest.mock("aws-sdk")


describe("Generate a token", () => {

    test('generate token 200', () => {
      // arrange and act
      var myEvent = {
        version: '2.0',
        routeKey: 'GET /tokengenerate',
        rawPath: '/tokengenerate',
        rawQueryString: 'id=1',
        headers: {
          authorization: 'AWS4-HMAC-SHA256 Credential=ASIA4T2JZHUEPDUT7YH4/20220708/eu-west-1/execute-api/aws4_request, SignedHeaders=host;x-amz-cf-id;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=5e5daea6b47e98ff3c3987c5de178837d2882f0ba8f21c7407cdd87ecba62370',
          'cloudfront-viewer-address': '52.94.36.25:29281',
          'cloudfront-viewer-country': 'GB',
          'content-length': '0',
          host: 'f2utpitubd.execute-api.eu-west-1.amazonaws.com',
          referer: 'https://d3pzxppvzp3dd9.cloudfront.net/',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:91.0) Gecko/20100101 Firefox/91.0',
        },
        queryStringParameters: { id: '1' },
      };

      var result = handler(myEvent)
  
      expect(result.playback_url).toHaveLength;

    });
});
