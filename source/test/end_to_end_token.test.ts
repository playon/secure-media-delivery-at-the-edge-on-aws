const aws = require("aws-sdk") // we still need to require this
const awsSMD = require('../resources/sdk/node/v1/aws-secure-media-delivery.js');
const cff = require("../lambda/generate_secret_update_cff/index.js");

jest.mock("aws-sdk") // jest will automatically find the mock





describe("Check token generation", () => {

  test("Check valid token ", async () => {

    awsSMD.Token.setDEBUG(true);
    awsSMD.Secret.setDEBUG(true);

    let secret = new awsSMD.Secret('test', 4);
    secret.initSMClient();
    let token = new awsSMD.Token(secret);

    const myIp = "MY_IP";
    const myReferer =  'https://mycloudfrontdomainname.cloudfront.net';
    const myUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:91.0) Gecko/20100101 Firefox/91.0';


    var viewer_attributes = {
      "ip": myIp,
      "co": "FRANCE",
      "reg": "ILE DE FRANCE",
      "cty": "PARIS",
      "headers": {
        'cloudfront-viewer-address': '54.240.197.233:31830',
        'cloudfront-viewer-country': 'IE',
        'content-length': '0',
        'host': 'un25b5wnf5.execute-api.eu-west-1.amazonaws.com',
        'referer': myReferer,
        'user-agent': myUserAgent,
        'via': '1.1 f9e2b62bbab7f16f69e97695da81e608.cloudfront.net (CloudFront)',
      }
    };
    var token_policy =
    {
      "co": false,
      "co_fallback": true,
      "cty": false,
      "cty_fallback": true,
      "exc": [
        "/ads/"
      ],
      "exp": "+3h",
      "headers": [
        "user-agent"
      ],
      "ip": false,
      "nbf": "1645000000",
      "paths": [
        "/out/v1/00c6ff982d404e2f940b48495b243b3c/"
      ],
      "session_auto_generate": 12,
      "ssn": true
    };

    const cloudfrontDomainName = "https://videoassetcloudfrontdomainname.com";
    const mediaUrl = "/out/v1/abcds/index.m3u";
    const res = await token.generate(viewer_attributes, `${cloudfrontDomainName}${mediaUrl}`, token_policy);
    var start = cloudfrontDomainName.length + 1;
    var end = res.indexOf(mediaUrl);
    const myToken = res.substring(start, end);

    res.startsWith(cloudfrontDomainName)
    expect(res.startsWith(cloudfrontDomainName)).toBeTruthy();
    expect(res.endsWith(mediaUrl)).toBeTruthy();
    var cffEvent = {
      "version": "1.0",
      "viewer": {
        "ip": myIp
      },
      "request": {
        "method": "GET",
        "uri": "/" + myToken + "/out/v1/00c6ff982d404e2f940b48495b243b3c/index.m3u8",
        "headers": {
          "host": {
            "value": "dklf7fsi4gpzd.cloudfront.net"
          },
          "user-agent": {
            "value": myUserAgent
          },
          "referer": {
            "value": myReferer
          },
          "origin": {
            "value": "https://d26xf765ycwwd4.cloudfront.net"
          }
        }
      }
    };

    var result = cff.handler(cffEvent);
    expect(result.method).toBe("GET");

  }, 70000);



});







