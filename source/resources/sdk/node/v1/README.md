# AWS Secure Media Delivery Node.js SDK

Node.js SDK for the Secure Media Delivery at the Edge on AWS Solution.

## Installation

```bash
npm install aws-secure-media-delivery
```

## Quick Start

```javascript
const awsSMD = require("aws-secure-media-delivery");

// Initialize secret manager
const secret = new awsSMD.Secret('MyStack', 300);
secret.initSMClient();

// Create token generator
const token = new awsSMD.Token(secret);

// Define viewer attributes
const viewerAttributes = {
    "ip": "192.168.1.1",
    "co": "US",
    "headers": {
        "user-agent": "Mozilla/5.0...",
        "referer": "https://example.com"
    }
};

// Define token policy
const tokenPolicy = {
    "ip": true,
    "co": true,
    "headers": ["user-agent", "referer"],
    "paths": ["/video/"],
    "exp": "+2h"
};

// Generate signed URL
const playbackUrl = "https://example.cloudfront.net/video/stream.m3u8";
const signedUrl = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
console.log("Signed URL:", signedUrl);
```

## Features

- **Promise-based**: All async operations return Promises
- **AWS SDK v3**: Uses the latest AWS SDK for JavaScript v3
- **JWT Support**: Industry-standard JWT token generation
- **IP Validation**: IPv4 and IPv6 address validation
- **Session Management**: Built-in session tracking and revocation
- **Custom Secrets**: Support for custom secret retrieval functions

## Classes

### Secret
Manages cryptographic secrets for token signing.

```javascript
// Native AWS Secrets Manager retrieval
const secret = new awsSMD.Secret('MyStack', 300);
secret.initSMClient();

// Custom secret retrieval
const secret = new awsSMD.Secret('MyStack', 300, 'custom', customRetriever, ['arg1']);
```

### Token
Generates JWT tokens with various security policies.

```javascript
const token = new awsSMD.Token(secret, defaultPolicy);
const signedUrl = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
```

### Session
Manages session revocation and tracking.

```javascript
// Initialize session management
awsSMD.Session.initialize("MyRevocationTable");

// Create and revoke session
const session = new awsSMD.Session("session123");
const success = await session.revoke(86400, "COMPROMISED");
```

## API Reference

### Secret Class

#### Constructor
```javascript
new Secret(stackName, ttl, retrieveMode = 'native', retrieveFunction = null, retrieveFunctionArgs = [])
```

**Parameters:**
- `stackName` (string): CloudFormation stack name
- `ttl` (number): Time-to-live for cached secrets in seconds
- `retrieveMode` (string): 'native' for AWS Secrets Manager or 'custom' for custom function
- `retrieveFunction` (function): Custom function to retrieve secrets
- `retrieveFunctionArgs` (array): Arguments for custom retrieve function

#### Methods

##### `initSMClient(params = {})`
Initialize AWS Secrets Manager client.

##### `async retrieveKeys(keyAlias = 'all')`
Retrieve cryptographic keys.

##### `getKeyValue(keyAlias)`
Get the value of a specific key.

##### `getKeyUUID(keyAlias)`
Get the UUID of a specific key.

##### `static setDEBUG(val = true)`
Enable or disable debug logging.

##### `static validateKeys(obj)`
Validate the format of retrieved keys.

### Token Class

#### Constructor
```javascript
new Token(secret, defaultTokenPolicy = null)
```

#### Methods

##### `async generate(viewerAttributes, playbackUrl = null, tokenPolicy = null, secretAlias = 'primary')`
Generate a secure JWT token.

**Parameters:**
- `viewerAttributes` (object): Viewer's attributes (IP, location, headers, etc.)
- `playbackUrl` (string): Original playback URL to be secured
- `tokenPolicy` (object): Token generation policy
- `secretAlias` (string): Which secret to use ('primary' or 'secondary')

**Returns:** Promise resolving to signed playback URL or token string

##### `static setDEBUG(val = true)`
Enable or disable debug logging.

### Session Class

#### Constructor
```javascript
new Session(id = null, autogenerate = false, suspicionScore = 0)
```

#### Methods

##### `async revoke(expiryPeriod = 86400, reason = 'COMPROMISED')`
Revoke the session by adding it to the revocation table.

##### `static initialize(tableName, params = {})`
Initialize session management with DynamoDB table.

##### `static setDEBUG(val = true)`
Enable or disable debug logging.

##### `static _autoGenerate(outputLength)`
Auto-generate a random session ID.

## Token Policy Reference

```javascript
const tokenPolicy = {
    // IP address validation
    "ip": true,                    // Validate viewer's IP address
    
    // Geolocation validation
    "co": true,                    // Validate country
    "co_fallback": true,           // Allow missing country header
    "reg": true,                   // Validate region
    "reg_fallback": false,         // Require region header
    "cty": true,                   // Validate city
    
    // Session management
    "ssn": true,                   // Include session ID
    "session_auto_generate": 16,   // Auto-generate 16-char session ID
    
    // Header validation
    "headers": ["user-agent", "referer"],  // Headers to validate
    
    // Query string validation
    "querystrings": ["quality", "lang"],   // Query params to validate
    
    // Path and exclusion rules
    "paths": ["/video/", "/live/"],        // Allowed paths
    "exc": ["/health", "/status"],         // Excluded paths
    
    // Expiration
    "exp": "+2h",                  // Expire in 2 hours
    // "exp": "+30m",              // Expire in 30 minutes
    // "exp": "1640995200",        // Absolute timestamp
    
    // Not before (optional)
    "nbf": "1640991600"            // Not valid before timestamp
};
```

## Viewer Attributes Reference

```javascript
const viewerAttributes = {
    // Required for IP validation
    "ip": "192.168.1.1",
    
    // Geolocation (from CloudFront headers)
    "co": "US",                           // Country code
    "reg": "CA",                          // Region/state
    "cty": "San Francisco",               // City
    
    // HTTP headers
    "headers": {
        "user-agent": "Mozilla/5.0...",
        "referer": "https://example.com",
        "custom-header": "value"
    },
    
    // Query string parameters
    "qs": {
        "quality": "1080p",
        "lang": "en",
        "custom-param": "value"
    },
    
    // Session ID (optional, auto-generated if not provided)
    "sessionId": "user-session-123"
};
```

## Error Handling

```javascript
try {
    const signedUrl = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
    console.log("Success:", signedUrl);
} catch (error) {
    console.error("Error generating token:", error.message);
}
```

## AWS Lambda Integration

```javascript
const awsSMD = require("aws-secure-media-delivery");

// Initialize outside handler for connection reuse
const secret = new awsSMD.Secret(process.env.STACK_NAME, 300);
secret.initSMClient();
const token = new awsSMD.Token(secret);

exports.handler = async (event, context) => {
    const headers = event.headers;
    const viewerIp = headers['cloudfront-viewer-address'].split(':')[0];
    
    const viewerAttributes = {
        "ip": viewerIp,
        "headers": headers
    };
    
    const tokenPolicy = {
        "ip": true,
        "headers": ["user-agent"],
        "paths": ["/video/"],
        "exp": "+2h"
    };
    
    const playbackUrl = await token.generate(viewerAttributes, null, tokenPolicy);
    
    return {
        "statusCode": 200,
        "body": JSON.stringify({"playback_url": playbackUrl})
    };
};
```

## Custom Secret Retrieval

```javascript
async function customSecretRetriever(stackName) {
    // Your custom logic to retrieve secrets
    // Could be from external API, database, file, etc.
    return {
        "primary": {
            "uuid": "custom-key-uuid",
            "value": "custom-secret-value"
        }
    };
}

const secret = new awsSMD.Secret(
    'MyStack',
    300,
    'custom',
    customSecretRetriever,
    ['MyStack']
);
```

## Examples

See the `examples/` directory for comprehensive usage examples.

## Requirements

- Node.js 14+
- AWS SDK for JavaScript v3
- jsonwebtoken
- base64url

## License

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
