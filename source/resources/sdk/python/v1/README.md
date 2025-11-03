# AWS Secure Media Delivery Python SDK

Python SDK for the Secure Media Delivery at the Edge on AWS Solution.

> **⚠️ Development Status**: This Python SDK is currently under active development. While it provides full feature parity with the Node.js version, the **Node.js SDK is considered the most stable and production-ready** implementation at this time. Please use the Node.js SDK for production workloads until this Python version reaches stable release.

## Installation

```bash
pip install aws-secure-media-delivery
```

## Usage

### Basic Token Generation

```python
from aws_secure_media_delivery import Secret, Token

# Initialize secret manager
secret = Secret(stack_name="MyStack", ttl=300)
secret.init_sm_client()

# Create token generator
token = Token(secret)

# Define viewer attributes
viewer_attributes = {
    "ip": "192.168.1.1",
    "co": "US",
    "headers": {
        "user-agent": "Mozilla/5.0...",
        "referer": "https://example.com"
    }
}

# Define token policy
token_policy = {
    "ip": True,
    "co": True,
    "headers": ["user-agent", "referer"],
    "paths": ["/video/"],
    "exp": "+2h"
}

# Generate token
playback_url = "https://example.cloudfront.net/video/stream.m3u8"
signed_url = await token.generate(viewer_attributes, playback_url, token_policy)
print(signed_url)
```

### Session Management

```python
from aws_secure_media_delivery import Session

# Initialize session management
Session.initialize("MyRevocationTable")

# Create and revoke a session
session = Session("session123")
success = await session.revoke(expiry_period=86400, reason="COMPROMISED")
```

### Custom Secret Retrieval

```python
async def custom_secret_retriever(stack_name):
    # Your custom logic to retrieve secrets
    return {
        "primary": {
            "uuid": "key-uuid",
            "value": "secret-value"
        }
    }

secret = Secret(
    stack_name="MyStack",
    ttl=300,
    retrieve_mode="custom",
    retrieve_function=custom_secret_retriever,
    retrieve_function_args=["MyStack"]
)
```

## Classes

### Secret
Manages cryptographic secrets for token signing.

### Token
Generates JWT tokens with various security policies.

### Session
Manages session revocation and tracking.

## Requirements

- Python 3.8+
- boto3
- PyJWT
- cryptography

## License

This project is licensed under the Apache License 2.0.
