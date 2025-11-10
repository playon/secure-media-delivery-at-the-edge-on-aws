/**
 * CTA-5007-B Native SDK - Local Token Generation
 */

const crypto = require('crypto');

class CTAClient {
    constructor(stackName, region = 'us-east-1') {
        this.stackName = stackName;
        this.region = region;
        this.keys = null;
    }

    async initSecretsManager(credentials = {}) {
        const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
        
        this.smClient = new SecretsManagerClient({
            region: this.region,
            ...credentials
        });
    }

    async getSigningKeys() {
        if (!this.smClient) {
            throw new Error("Call initSecretsManager() first");
        }

        const secretName = `${this.stackName}_CTAKey`;
        
        try {
            const command = new GetSecretValueCommand({ SecretId: secretName });
            const response = await this.smClient.send(command);
            
            const secret = JSON.parse(response.SecretString);
            this.keys = {
                primary: { value: secret.signingKey, uuid: 'primary' }
            };
            
            return this.keys;
        } catch (error) {
            throw new Error(`Failed to get signing keys: ${error.message}`);
        }
    }

    generateCWTToken(policy, viewer = {}) {
        if (!this.keys) {
            throw new Error("No signing keys available. Call getSigningKeys() first");
        }

        const now = Math.floor(Date.now() / 1000);
        
        // CTA-5007-B compliant claims
        const claims = {
            4: now + this.parseTTL(policy.ttl || '2h'), // exp
            5: now,  // nbf  
            6: now   // iat
        };

        // URI restrictions (catu claim)
        if (policy.paths && policy.paths.length > 0) {
            claims[312] = { 3: { 1: policy.paths[0] } };
        }

        // Country restrictions (catgeoiso3166 claim)
        if (policy.countries && policy.countries.length > 0) {
            claims[316] = policy.countries;
        }

        // Session ID for replay protection
        if (policy.sessionId) {
            claims[7] = policy.sessionId; // cti
        }

        // Create CWT structure (simplified - real implementation would use proper CBOR)
        const header = { alg: 'HS256', typ: 'CWT' };
        const payload = claims;
        
        // Sign token (simplified JWT-style for demo - real CWT would use CBOR)
        const token = this.signToken(header, payload, this.keys.primary.value);
        
        return {
            token,
            claims,
            expiresAt: claims[4]
        };
    }

    signToken(header, payload, key) {
        const encodedHeader = this.base64urlEncode(JSON.stringify(header));
        const encodedPayload = this.base64urlEncode(JSON.stringify(payload));
        const signingInput = `${encodedHeader}.${encodedPayload}`;
        
        const signature = crypto
            .createHmac('sha256', key)
            .update(signingInput)
            .digest('base64url');
            
        return `${signingInput}.${signature}`;
    }

    generateSignedUrl(mediaUrl, policy, viewer = {}) {
        const result = this.generateCWTToken(policy, viewer);
        
        // Apply token based on placement preference
        if (policy.placement === 'query') {
            const separator = mediaUrl.includes('?') ? '&' : '?';
            return `${mediaUrl}${separator}CAT=${result.token}`;
        } else if (policy.placement === 'header') {
            // Return token for header usage
            return {
                url: mediaUrl,
                headers: { 'CTA-Common-Access-Token': result.token }
            };
        } else {
            // Default: path placement
            const url = new URL(mediaUrl);
            return `${url.protocol}//${url.host}/${result.token}${url.pathname}${url.search}`;
        }
    }

    parseTTL(ttl) {
        if (typeof ttl === 'number') return ttl;
        
        const match = ttl.match(/^(\d+)([smhd])$/);
        if (!match) return 7200; // Default 2 hours

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 7200;
        }
    }

    base64urlEncode(str) {
        return Buffer.from(str)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

// Usage examples
const Examples = {
    basic: async () => {
        const client = new CTAClient('CTASecureMedia', 'us-east-1');
        await client.initSecretsManager();
        await client.getSigningKeys();
        
        const signedUrl = client.generateSignedUrl(
            'https://cdn.example.com/video/stream.m3u8',
            { paths: ['/video/'], ttl: '2h' },
            { country: 'us' }
        );
        
        return signedUrl;
    },
    
    geoRestricted: async () => {
        const client = new CTAClient('CTASecureMedia');
        await client.initSecretsManager();
        await client.getSigningKeys();
        
        return client.generateSignedUrl(
            'https://cdn.example.com/premium/content.m3u8',
            { 
                paths: ['/premium/'], 
                ttl: '24h',
                countries: ['us', 'ca', 'gb'],
                placement: 'query'
            }
        );
    }
};

if (typeof module !== 'undefined') module.exports = { CTAClient, Examples };
else window.CTAClient = CTAClient;
