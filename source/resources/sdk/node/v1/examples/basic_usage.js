#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Basic usage example for AWS Secure Media Delivery Node.js SDK
 */

const awsSMD = require("../aws-secure-media-delivery");

async function main() {
    console.log("AWS Secure Media Delivery Node.js SDK - Basic Usage Example");
    console.log("=".repeat(60));

    // Enable debug logging
    awsSMD.Secret.setDEBUG(true);
    awsSMD.Token.setDEBUG(true);
    awsSMD.Session.setDEBUG(true);

    // Initialize secret manager
    console.log("Initializing secret manager...");
    const secret = new awsSMD.Secret('MySecureStreamStack', 300);
    
    // Initialize AWS Secrets Manager client
    if (!secret.initSMClient()) {
        console.log("Failed to initialize Secrets Manager client");
        return;
    }

    // Create token generator
    const token = new awsSMD.Token(secret);

    // Define viewer attributes
    const viewerAttributes = {
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
    };

    // Define token policy
    const tokenPolicy = {
        "ip": true,
        "co": true,
        "co_fallback": true,
        "headers": ["user-agent", "referer"],
        "querystrings": ["quality"],
        "paths": ["/video/", "/live/"],
        "exc": ["/health", "/status"],
        "exp": "+2h",
        "ssn": true,
        "session_auto_generate": 16
    };

    try {
        // Generate token for HLS stream
        console.log("\nGenerating token for HLS stream...");
        const hlsUrl = "https://d1234567890.cloudfront.net/video/stream.m3u8";
        const signedHlsUrl = await token.generate(viewerAttributes, hlsUrl, tokenPolicy);
        console.log(`Signed HLS URL: ${signedHlsUrl}`);

        // Generate token for DASH stream
        console.log("\nGenerating token for DASH stream...");
        const dashUrl = "https://d1234567890.cloudfront.net/video/stream.mpd";
        const signedDashUrl = await token.generate(viewerAttributes, dashUrl, tokenPolicy);
        console.log(`Signed DASH URL: ${signedDashUrl}`);

        // Generate standalone token
        console.log("\nGenerating standalone token...");
        const standaloneToken = await token.generate(viewerAttributes, null, tokenPolicy);
        console.log(`Standalone token: ${standaloneToken}`);

    } catch (error) {
        console.error("Error generating token:", error.message);
    }
}

async function sessionManagementExample() {
    console.log("\n" + "=".repeat(50));
    console.log("Session Management Example");
    console.log("=".repeat(50));

    // Initialize session management
    awsSMD.Session.initialize("MyRevocationTable", { region: "us-east-1" });

    // Create session with auto-generated ID
    const session1 = new awsSMD.Session(null, true);
    console.log(`Auto-generated session ID: ${session1.id}`);

    // Create session with specific ID
    const session2 = new awsSMD.Session("user-session-12345");
    console.log(`Custom session ID: ${session2.id}`);

    // Create session with custom length
    const session3 = new awsSMD.Session(20, true); // 20 character ID
    console.log(`Custom length session ID: ${session3.id}`);

    try {
        // Revoke a session
        console.log(`\nRevoking session: ${session2.id}`);
        const success = await session2.revoke(86400, "SUSPICIOUS_ACTIVITY");
        if (success) {
            console.log("Session revoked successfully");
        } else {
            console.log("Failed to revoke session");
        }
    } catch (error) {
        console.error("Error revoking session:", error.message);
    }
}

async function customSecretExample() {
    console.log("\n" + "=".repeat(50));
    console.log("Custom Secret Retrieval Example");
    console.log("=".repeat(50));

    // Custom secret retrieval function
    async function customSecretRetriever(stackName) {
        console.log(`Custom retrieval for stack: ${stackName}`);

        // In a real implementation, you might retrieve from:
        // - A different AWS service
        // - A local file
        // - An external API
        // - A database

        return {
            "primary": {
                "uuid": "custom-key-uuid-12345",
                "value": "custom-secret-value-abcdef"
            },
            "secondary": {
                "uuid": "custom-key-uuid-67890",
                "value": "custom-secret-value-ghijkl"
            }
        };
    }

    // Initialize secret with custom retrieval
    const secret = new awsSMD.Secret(
        'MyStack',
        300,
        'custom',
        customSecretRetriever,
        ['MyStack']
    );

    try {
        // Retrieve keys using custom function
        const keys = await secret.retrieveKeys();
        console.log(`Retrieved keys: ${Object.keys(keys).join(', ')}`);
        console.log(`Primary key UUID: ${keys.primary.uuid}`);

    } catch (error) {
        console.error("Error with custom secret retrieval:", error.message);
    }
}

function tokenPolicyExamples() {
    console.log("\n" + "=".repeat(50));
    console.log("Token Policy Examples");
    console.log("=".repeat(50));

    // Example 1: Basic IP and country validation
    const basicPolicy = {
        "ip": true,
        "co": true,
        "paths": ["/video/"],
        "exp": "+1h"
    };
    console.log("Basic Policy:", JSON.stringify(basicPolicy, null, 2));

    // Example 2: Comprehensive validation
    const comprehensivePolicy = {
        "ip": true,
        "co": true,
        "co_fallback": true,
        "reg": true,
        "cty": true,
        "ssn": true,
        "session_auto_generate": 16,
        "headers": ["user-agent", "referer", "authorization"],
        "querystrings": ["quality", "lang", "device"],
        "paths": ["/video/", "/live/", "/vod/"],
        "exc": ["/health", "/status", "/metrics"],
        "exp": "+4h",
        "nbf": (Math.floor(Date.now() / 1000) - 300).toString() // Valid 5 minutes ago
    };
    console.log("Comprehensive Policy:", JSON.stringify(comprehensivePolicy, null, 2));

    // Example 3: Session-based with fallbacks
    const sessionPolicy = {
        "ip": true,
        "co": true,
        "co_fallback": true,
        "reg": true,
        "reg_fallback": true,
        "ssn": true,
        "headers": ["user-agent"],
        "paths": ["/premium/"],
        "exp": "+30m" // Short expiration for premium content
    };
    console.log("Session Policy:", JSON.stringify(sessionPolicy, null, 2));
}

// Run examples
async function runExamples() {
    try {
        await main();
        await sessionManagementExample();
        await customSecretExample();
        tokenPolicyExamples();
    } catch (error) {
        console.error("Example execution failed:", error);
    }
}

if (require.main === module) {
    runExamples();
}
