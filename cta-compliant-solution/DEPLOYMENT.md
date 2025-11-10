# CTA-5007-B Compliant Solution Deployment Guide

## Prerequisites

### 1. CloudFront Functions CWT Preview Access
This solution requires CloudFront Functions CWT support (currently in preview).

**Request Preview Access:**
- Contact AWS Support or your AWS account team
- Provide CloudFront distribution IDs for testing
- Allow 3 business days for preview enablement

### 2. Required AWS Services
- CloudFront with Functions support
- CloudFront KeyValueStore
- AWS Lambda
- API Gateway
- Secrets Manager
- AWS CDK v2.170.0+

## Deployment Steps

### 1. Install Dependencies
```bash
cd cta-compliant-solution/source
npm install
```

### 2. Configure AWS Credentials
```bash
aws configure
# or use AWS SSO, IAM roles, etc.
```

### 3. Bootstrap CDK (if first time)
```bash
npx cdk bootstrap
```

### 4. Deploy the Stack
```bash
npx cdk deploy CTASecureMediaDelivery
```

### 5. Configure CloudFront KeyValueStore
After deployment, you need to populate the KeyValueStore with signing keys:

```bash
# Get the signing key from Secrets Manager
aws secretsmanager get-secret-value --secret-id <SECRET_ARN>

# Add key to CloudFront KeyValueStore (via AWS Console or CLI)
# Key: "key:default"
# Value: <signing_key_from_secret>
```

## Configuration

### Token Generation API
The deployed API Gateway endpoint accepts POST requests:

```bash
curl -X POST https://<api-id>.execute-api.<region>.amazonaws.com/prod/token/generate \
  -H "Content-Type: application/json" \
  -d '{
    "tokenPolicy": {
      "paths": ["/video/"],
      "exp": "+2h",
      "co": true,
      "placement": "path"
    },
    "viewerAttributes": {
      "ip": "192.168.1.100",
      "co": "US"
    },
    "playbackUrl": "https://example.cloudfront.net/video/stream.m3u8"
  }'
```

### CloudFront Distribution
Update your CloudFront distribution to:
1. Use the deployed CTA validator function
2. Configure KeyValueStore association
3. Set appropriate cache behaviors

## Testing

### 1. Generate Test Token
```javascript
const generator = new CTATokenGenerator('https://your-api-endpoint');

const result = await generator.generateToken({
  paths: ['/test/'],
  exp: '+1h',
  placement: 'query'
}, {
  ip: '192.168.1.1',
  co: 'US'
}, 'https://your-distribution.cloudfront.net/test/video.m3u8');

console.log('Signed URL:', result.signedUrl);
```

### 2. Test Token Validation
Access the signed URL through your CloudFront distribution. Check CloudFront logs for validation results.

## Monitoring

### CloudWatch Logs
- Lambda function logs: `/aws/lambda/CTATokenGenerator`
- CloudFront Function logs: Available in CloudWatch

### Metrics to Monitor
- Token generation success/failure rates
- Token validation success/failure rates
- Geographic restriction violations
- Token expiration patterns

## Troubleshooting

### Common Issues

1. **"Key configuration error"**
   - Ensure KeyValueStore is populated with signing key
   - Verify key format matches expected structure

2. **"CWT validation failed"**
   - Check token format (must be valid base64url)
   - Verify signing key consistency
   - Ensure CloudFront Functions CWT preview is enabled

3. **"Geographic restriction violated"**
   - Verify CloudFront viewer-country headers are enabled
   - Check country code format (lowercase ISO 3166-1)

### Debug Mode
Enable debug logging in CloudFront Function by modifying the `logDebug` function.

## Security Considerations

1. **Key Rotation**: Implement regular rotation of signing keys
2. **Token Expiration**: Use appropriate expiration times for your use case
3. **Geographic Validation**: Ensure country detection is reliable
4. **Replay Protection**: Use session IDs for sensitive content

## CTA-5007-B Compliance

This solution implements:
- ✅ CBOR Web Token (CWT) format per RFC 8392
- ✅ CTA-5007-B standardized claims (catu, catnip, catgeoiso3166)
- ✅ COSE MAC0 structure with HMAC-SHA256
- ✅ Multiple token placement options
- ✅ Proper claim validation at edge
