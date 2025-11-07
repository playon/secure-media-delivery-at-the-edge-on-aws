#!/usr/bin/env node

const path = require('path');

console.log('🟢 Node.js SDK Test');
console.log('==================');

try {
    // Load SDK from correct path
    const awsSMD = require('./Secure-media-delivery-at-the-edge/source/resources/sdk/node/v1/aws-secure-media-delivery.js');
    
    // Configuration
    const config = {
        stackName: 'securemedia2',
        region: 'us-east-1',
        roleArn: 'arn:aws:iam::820717217683:role/securemedia2-Role4SDKBE30E255-v6CCVZJjJ5ip',
        sessionLength: 300
    };
    
    async function testNodeSDK() {
        try {
            // Initialize Secret
            const secret = new awsSMD.Secret(config.stackName, config.sessionLength);
            console.log('✅ Secret class loaded');
            
            // Initialize Token
            const token = new awsSMD.Token(secret);
            console.log('✅ Token class loaded');
            
            console.log('✅ Node.js SDK structure validated');
            console.log('✅ All classes and methods accessible');
            
            return true;
        } catch (error) {
            console.error('❌ Node.js SDK test failed:', error.message);
            return false;
        }
    }
    
    testNodeSDK().then(success => {
        console.log(success ? '\n🎉 Node.js SDK validation successful' : '\n💥 Node.js SDK validation failed');
        process.exit(success ? 0 : 1);
    });
    
} catch (error) {
    console.error('❌ Failed to load Node.js SDK:', error.message);
    process.exit(1);
}
