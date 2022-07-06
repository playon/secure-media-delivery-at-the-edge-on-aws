const cff = require("../lambda/generate_secret_update_cff/index.js");

describe("Check token", () => {
    
  test('Malformed token event', () => {
     // arrange and act
     var cffEvent = {
      "version":"1.0",
      "viewer":{
         "ip":"MY_IP"
      },
      "request":{
         "method":"GET",
         "uri":"/MYSESSIONID.MY_JWT_TOKEN/out/v1/00c6ff982d404e2f940b48495b243b3c/index.m3u8",         
         "headers":{
            "host":{
               "value":"dklf7fsi4gpzd.cloudfront.net"
            },
            "user-agent":{
               "value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:91.0) Gecko/20100101 Firefox/91.0"
            },
            "referer":{
               "value":"https://d26xf765ycwwd4.cloudfront.net/"
            },
            "origin":{
               "value":"https://d26xf765ycwwd4.cloudfront.net"
            }
         }
      }
   };
     var result = cff.handler(cffEvent);
     expect(result.statusCode).toBe(401);
     expect(result.statusDescription).toBe("Unauthorized");
  });


  test('Malformed token headerSeg' , () => {
    // arrange and act
  var cffEvent = {
      "version": "1.0",
      "viewer": {
        "ip": "54.240.197.233"
      },
      "request": {
        "method": "GET",
        "uri": "/abcde.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c/out/v1/00c6ff982d404e2f940b48495b243b3c/index.m3u",
        "headers": {
          "host": {
            "value": "dklf7fsi4gpzd.cloudfront.net"
          },
          "user-agent": {
            "value": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:91.0) Gecko/20100101 Firefox/91.0'
          },
          "referer": {
            "value": 'https://mycloudfrontdomainname.cloudfront.net'
          },
          "origin": {
            "value": "https://d26xf765ycwwd4.cloudfront.net"
          }
        }
      }
    };  
    var result = cff.handler(cffEvent);
    expect(result.statusCode).toBe(401);
    expect(result.statusDescription).toBe("Unauthorized");
 });

});

