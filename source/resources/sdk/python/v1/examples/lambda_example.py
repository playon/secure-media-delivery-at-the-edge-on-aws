#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
AWS Lambda function example using the Secure Media Delivery Python SDK.

This example shows how to create a Lambda function that generates secure tokens
for video playback, similar to the Node.js version in the solution.
"""

import json
import asyncio
import os
import re
from typing import Dict, Any, Optional
from aws_secure_media_delivery import Secret, Token
import boto3


# Initialize outside handler for connection reuse
secret = None
token = None


def init_sdk():
    """Initialize the SDK components."""
    global secret, token
    
    stack_name = os.environ.get('STACK_NAME', 'MySecureStreamStack')
    
    # Initialize secret manager
    secret = Secret(stack_name=stack_name, ttl=300)
    secret.init_sm_client()
    
    # Initialize token generator
    token = Token(secret)


def populate_country_region_city(token_policy: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    """Populate country, region, and city from CloudFront headers."""
    viewer_attributes = {}
    
    if token_policy.get('co'):
        if 'cloudfront-viewer-country' in headers:
            viewer_attributes['co'] = headers['cloudfront-viewer-country']
        elif not token_policy.get('co_fallback'):
            raise ValueError("Country header missing and no fallback enabled")
    
    if token_policy.get('reg'):
        if 'cloudfront-viewer-country-region' in headers:
            viewer_attributes['reg'] = headers['cloudfront-viewer-country-region']
        elif not token_policy.get('reg_fallback'):
            raise ValueError("Region header missing and no fallback enabled")
    
    if token_policy.get('cty'):
        if 'cloudfront-viewer-city' in headers:
            viewer_attributes['cty'] = headers['cloudfront-viewer-city']
        elif not token_policy.get('cty_fallback'):
            raise ValueError("City header missing and no fallback enabled")
    
    return viewer_attributes


def populate_viewer_attributes(token_policy: Dict[str, Any], viewer_ip: str, 
                             headers: Dict[str, str], query_params: Dict[str, Any]) -> Dict[str, Any]:
    """Populate all viewer attributes based on token policy."""
    viewer_attributes = populate_country_region_city(token_policy, headers)
    
    if token_policy.get('ip'):
        viewer_attributes['ip'] = viewer_ip
    
    if token_policy.get('headers') and len(token_policy['headers']) > 0:
        viewer_attributes['headers'] = headers
    
    if token_policy.get('querystrings') and len(token_policy['querystrings']) > 0:
        viewer_attributes['qs'] = query_params
    
    return viewer_attributes


async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for generating secure media tokens.
    
    Expected event structure:
    {
        "queryStringParameters": {
            "id": "video_asset_id"
        },
        "headers": {
            "cloudfront-viewer-address": "192.168.1.1:12345",
            "cloudfront-viewer-country": "US",
            "user-agent": "Mozilla/5.0...",
            "referer": "https://example.com"
        },
        "requestContext": {
            "http": {
                "sourceIp": "192.168.1.1"
            }
        }
    }
    """
    
    # Initialize SDK if not already done
    if not secret or not token:
        init_sdk()
    
    print(json.dumps(event))
    
    try:
        # Extract parameters
        query_params = event.get('queryStringParameters') or {}
        headers = event.get('headers') or {}
        
        # Validate required parameters
        video_id = query_params.get('id')
        if not video_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing required parameter: id"})
            }
        
        # Validate video ID format
        if not re.match(r'^\w+$', video_id) or len(video_id) > 200:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid video ID format"})
            }
        
        # Remove 'id' from query params for token generation
        token_query_params = {k: v for k, v in query_params.items() if k != 'id'}
        
        # Extract viewer IP
        viewer_ip = None
        if 'cloudfront-viewer-address' in headers:
            # Extract IP from "IP:PORT" format
            viewer_ip = headers['cloudfront-viewer-address'].split(':')[0]
        else:
            viewer_ip = event.get('requestContext', {}).get('http', {}).get('sourceIp')
        
        if not viewer_ip:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Unable to determine viewer IP"})
            }
        
        # Get video metadata from DynamoDB
        table_name = os.environ.get('TABLE_NAME')
        if not table_name:
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "TABLE_NAME environment variable not set"})
            }
        
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(table_name)
        
        response = table.get_item(Key={'id': video_id})
        video_metadata = response.get('Item')
        
        if not video_metadata:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "No video asset found for the given ID"})
            }
        
        # Extract video metadata
        endpoint_hostname = video_metadata.get('endpoint_hostname')
        video_url = video_metadata.get('url_path')
        token_policy = video_metadata.get('token_policy', {})
        
        # Build original URL
        original_url = None
        if endpoint_hostname and video_url:
            original_url = f"{endpoint_hostname}{video_url}"
        
        # Populate viewer attributes
        viewer_attributes = populate_viewer_attributes(
            token_policy, viewer_ip, headers, token_query_params
        )
        
        # Generate secure token
        playback_url = await token.generate(viewer_attributes, original_url, token_policy)
        
        # Build response body
        response_body = {
            "playback_url": playback_url,
            "token_policy": {
                "ip": 1 if token_policy.get('ip') else 0,
                "ip_value": viewer_ip,
                "ua": 1 if 'user-agent' in token_policy.get('headers', []) else 0,
                "ua_value": headers.get('user-agent'),
                "referer": 1 if 'referer' in token_policy.get('headers', []) else 0,
                "referer_value": headers.get('referer')
            }
        }
        
        return {
            "statusCode": 200,
            "body": json.dumps(response_body),
            "headers": {
                "Content-Type": "application/json"
            }
        }
        
    except ValueError as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(e)})
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"})
        }


# For local testing
if __name__ == "__main__":
    # Mock event for testing
    test_event = {
        "queryStringParameters": {
            "id": "test-video-123",
            "quality": "1080p"
        },
        "headers": {
            "cloudfront-viewer-address": "192.168.1.100:12345",
            "cloudfront-viewer-country": "US",
            "cloudfront-viewer-country-region": "CA",
            "cloudfront-viewer-city": "San Francisco",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "referer": "https://example.com/player"
        },
        "requestContext": {
            "http": {
                "sourceIp": "192.168.1.100"
            }
        }
    }
    
    # Set environment variables for testing
    os.environ['STACK_NAME'] = 'TestStack'
    os.environ['TABLE_NAME'] = 'TestTable'
    
    # Run test
    result = asyncio.run(lambda_handler(test_event, None))
    print(json.dumps(result, indent=2))
