#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Basic usage example for AWS Secure Media Delivery Python SDK.
"""

import asyncio
from aws_secure_media_delivery import Secret, Token, Session


async def main():
    """Demonstrate basic SDK usage."""
    
    # Initialize secret manager
    print("Initializing secret manager...")
    secret = Secret(stack_name="MySecureStreamStack", ttl=300)
    
    # Initialize AWS Secrets Manager client
    if not secret.init_sm_client():
        print("Failed to initialize Secrets Manager client")
        return
    
    # Create token generator
    token = Token(secret)
    
    # Define viewer attributes
    viewer_attributes = {
        "ip": "192.168.1.100",
        "co": "US",
        "reg": "CA",
        "cty": "San Francisco",
        "headers": {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "referer": "https://example.com/player"
        },
        "qs": {
            "quality": "1080p",
            "lang": "en"
        }
    }
    
    # Define token policy
    token_policy = {
        "ip": True,
        "co": True,
        "co_fallback": True,
        "headers": ["user-agent", "referer"],
        "querystrings": ["quality"],
        "paths": ["/video/", "/live/"],
        "exc": ["/health", "/status"],
        "exp": "+2h",
        "ssn": True,
        "session_auto_generate": 16
    }
    
    try:
        # Generate token for HLS stream
        print("\nGenerating token for HLS stream...")
        hls_url = "https://d1234567890.cloudfront.net/video/stream.m3u8"
        signed_hls_url = await token.generate(viewer_attributes, hls_url, token_policy)
        print(f"Signed HLS URL: {signed_hls_url}")
        
        # Generate token for DASH stream
        print("\nGenerating token for DASH stream...")
        dash_url = "https://d1234567890.cloudfront.net/video/stream.mpd"
        signed_dash_url = await token.generate(viewer_attributes, dash_url, token_policy)
        print(f"Signed DASH URL: {signed_dash_url}")
        
        # Generate token without URL (just the token)
        print("\nGenerating standalone token...")
        standalone_token = await token.generate(viewer_attributes, None, token_policy)
        print(f"Standalone token: {standalone_token}")
        
    except Exception as e:
        print(f"Error generating token: {e}")


async def session_management_example():
    """Demonstrate session management."""
    
    print("\n" + "="*50)
    print("Session Management Example")
    print("="*50)
    
    # Initialize session management
    Session.initialize("MyRevocationTable", {"region": "us-east-1"})
    
    # Create a session with auto-generated ID
    session1 = Session(autogenerate=True)
    print(f"Auto-generated session ID: {session1.id}")
    
    # Create a session with specific ID
    session2 = Session("user-session-12345")
    print(f"Custom session ID: {session2.id}")
    
    # Create a session with custom length
    session3 = Session("20", autogenerate=True)  # 20 character ID
    print(f"Custom length session ID: {session3.id}")
    
    try:
        # Revoke a session
        print(f"\nRevoking session: {session2.id}")
        success = await session2.revoke(expiry_period=86400, reason="SUSPICIOUS_ACTIVITY")
        if success:
            print("Session revoked successfully")
        else:
            print("Failed to revoke session")
    except Exception as e:
        print(f"Error revoking session: {e}")


async def custom_secret_example():
    """Demonstrate custom secret retrieval."""
    
    print("\n" + "="*50)
    print("Custom Secret Retrieval Example")
    print("="*50)
    
    async def custom_secret_retriever(stack_name):
        """Custom function to retrieve secrets."""
        print(f"Custom retrieval for stack: {stack_name}")
        
        # In a real implementation, you might retrieve from:
        # - A different AWS service
        # - A local file
        # - An external API
        # - A database
        
        return {
            "primary": {
                "uuid": "custom-key-uuid-12345",
                "value": "custom-secret-value-abcdef"
            },
            "secondary": {
                "uuid": "custom-key-uuid-67890",
                "value": "custom-secret-value-ghijkl"
            }
        }
    
    # Initialize secret with custom retrieval
    secret = Secret(
        stack_name="MyStack",
        ttl=300,
        retrieve_mode="custom",
        retrieve_function=custom_secret_retriever,
        retrieve_function_args=["MyStack"]
    )
    
    try:
        # Retrieve keys using custom function
        keys = await secret.retrieve_keys()
        print(f"Retrieved keys: {list(keys.keys())}")
        print(f"Primary key UUID: {keys['primary']['uuid']}")
        
    except Exception as e:
        print(f"Error with custom secret retrieval: {e}")


if __name__ == "__main__":
    # Enable debug logging
    Secret.set_debug(True)
    Token.set_debug(True)
    Session.set_debug(True)
    
    print("AWS Secure Media Delivery Python SDK - Basic Usage Example")
    print("="*60)
    
    # Run examples
    asyncio.run(main())
    asyncio.run(session_management_example())
    asyncio.run(custom_secret_example())
