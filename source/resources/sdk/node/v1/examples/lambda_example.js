#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * AWS Lambda function example using the Secure Media Delivery Node.js SDK
 * 
 * This example shows how to create a Lambda function that generates secure tokens
 * for video playback, integrating with DynamoDB for video metadata.
 */

const awsSMD = require("../aws-secure-media-delivery");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize outside handler for connection reuse
let secret = null;
let token = null;
let dynamoClient = null;

function initializeSDK() {
    const stackName = process.env.STACK_NAME || 'MySecureStreamStack';
    
    // Initialize secret manager
    secret = new awsSMD.Secret(stackName, 300);
    secret.initSMClient();
    
    // Initialize token generator
    token = new awsSMD.Token(secret);
    
    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    dynamoClient = DynamoDBDocumentClient.from(client);
}

/**
 * Populate country, region, and city from CloudFront headers
 */
function populateCountryRegionCity(tokenPolicy, headers) {
    const viewerAttributes = {};
    
    if (tokenPolicy.co) {
        if (headers['cloudfront-viewer-country']) {
            viewerAttributes.co = headers['cloudfront-viewer-country'];
        } else if (!tokenPolicy.co_fallback) {
            throw new Error('Country header missing and no fallback enabled');
        }
    }
    
    if (tokenPolicy.reg) {
        if (headers['cloudfront-viewer-country-region']) {
            viewerAttributes.reg = headers['cloudfront-viewer-country-region'];
        } else if (!tokenPolicy.reg_fallback) {
            throw new Error('Region header missing and no fallback enabled');
        }
    }
    
    if (tokenPolicy.cty) {
        if (headers['cloudfront-viewer-city']) {
            viewerAttributes.cty = headers['cloudfront-viewer-city'];
        } else if (!tokenPolicy.cty_fallback) {
            throw new Error('City header missing and no fallback enabled');
        }
    }
    
    return viewerAttributes;
}

/**
 * Populate all viewer attributes based on token policy
 */
function populateViewerAttributes(tokenPolicy, viewerIp, headers, queryParams) {
    const viewerAttributes = populateCountryRegionCity(tokenPolicy, headers);
    
    if (tokenPolicy.ip) {
        viewerAttributes.ip = viewerIp;
    }
    
    if (tokenPolicy.headers && tokenPolicy.headers.length > 0) {
        viewerAttributes.headers = headers;
    }
    
    if (tokenPolicy.querystrings && tokenPolicy.querystrings.length > 0) {
        viewerAttributes.qs = queryParams;
    }
    
    return viewerAttributes;
}

/**
 * AWS Lambda handler for generating secure media tokens
 * 
 * Expected event structure:
 * {
 *   "queryStringParameters": {
 *     "id": "video_asset_id"
 *   },
 *   "headers": {
 *     "cloudfront-viewer-address": "192.168.1.1:12345",
 *     "cloudfront-viewer-country": "US",
 *     "user-agent": "Mozilla/5.0...",
 *     "referer": "https://example.com"
 *   },
 *   "requestContext": {
 *     "http": {
 *       "sourceIp": "192.168.1.1"
 *     }
 *   }
 * }
 */
exports.handler = async (event, context) => {
    // Initialize SDK if not already done
    if (!secret || !token || !dynamoClient) {
        initializeSDK();
    }
    
    console.log(JSON.stringify(event));
    
    try {
        // Extract parameters
        const queryParams = event.queryStringParameters || {};
        const headers = event.headers || {};
        
        // Validate required parameters
        const videoId = queryParams.id;
        if (!videoId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required parameter: id' })
            };
        }
        
        // Validate video ID format
        if (!/^\w+$/.test(videoId) || videoId.length > 200) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid video ID format' })
            };
        }
        
        // Remove 'id' from query params for token generation
        const tokenQueryParams = { ...queryParams };
        delete tokenQueryParams.id;
        
        // Extract viewer IP
        let viewerIp = null;
        if (headers['cloudfront-viewer-address']) {
            // Extract IP from "IP:PORT" format
            viewerIp = headers['cloudfront-viewer-address'].split(':')[0];
        } else {
            viewerIp = event.requestContext?.http?.sourceIp;
        }
        
        if (!viewerIp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Unable to determine viewer IP' })
            };
        }
        
        // Get video metadata from DynamoDB
        const tableName = process.env.TABLE_NAME;
        if (!tableName) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'TABLE_NAME environment variable not set' })
            };
        }
        
        const getCommand = new GetCommand({
            TableName: tableName,
            Key: { id: videoId }
        });
        
        const response = await dynamoClient.send(getCommand);
        const videoMetadata = response.Item;
        
        if (!videoMetadata) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No video asset found for the given ID' })
            };
        }
        
        // Extract video metadata
        const endpointHostname = videoMetadata.endpoint_hostname;
        const videoUrl = videoMetadata.url_path;
        const tokenPolicy = videoMetadata.token_policy || {};
        
        // Build original URL
        let originalUrl = null;
        if (endpointHostname && videoUrl) {
            originalUrl = `${endpointHostname}${videoUrl}`;
        }
        
        // Populate viewer attributes
        const viewerAttributes = populateViewerAttributes(
            tokenPolicy, viewerIp, headers, tokenQueryParams
        );
        
        // Generate secure token
        const playbackUrl = await token.generate(viewerAttributes, originalUrl, tokenPolicy);
        
        // Build response body
        const responseBody = {
            playback_url: playbackUrl,
            token_policy: {
                ip: tokenPolicy.ip ? 1 : 0,
                ip_value: viewerIp,
                ua: (tokenPolicy.headers || []).includes('user-agent') ? 1 : 0,
                ua_value: headers['user-agent'],
                referer: (tokenPolicy.headers || []).includes('referer') ? 1 : 0,
                referer_value: headers['referer']
            }
        };
        
        return {
            statusCode: 200,
            body: JSON.stringify(responseBody),
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

// For local testing
if (require.main === module) {
    // Mock event for testing
    const testEvent = {
        queryStringParameters: {
            id: 'test-video-123',
            quality: '1080p'
        },
        headers: {
            'cloudfront-viewer-address': '192.168.1.100:12345',
            'cloudfront-viewer-country': 'US',
            'cloudfront-viewer-country-region': 'CA',
            'cloudfront-viewer-city': 'San Francisco',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'referer': 'https://example.com/player'
        },
        requestContext: {
            http: {
                sourceIp: '192.168.1.100'
            }
        }
    };
    
    // Set environment variables for testing
    process.env.STACK_NAME = 'TestStack';
    process.env.TABLE_NAME = 'TestTable';
    
    // Run test
    exports.handler(testEvent, {})
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error('Test failed:', error);
        });
}
