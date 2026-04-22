/**
 * CTA-5007-B Native Token Generator
 */

const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const CTA = {
    EXP: 4,           // Expiration
    NBF: 5,           // Not Before
    IAT: 6,           // Issued At
    CTI: 7,           // Token ID
    CATNIP: 311,      // Network IP
    CATU: 312,        // URI restrictions
    CATGEOISO3166: 316 // Country codes
};

const secretsManager = new SecretsManagerClient({});

async function getSigningKey() {
    const command = new GetSecretValueCommand({ SecretId: process.env.SECRET_NAME });
    const response = await secretsManager.send(command);
    return JSON.parse(response.SecretString).signingKey;
}

function createCWTPayload(policy, viewer) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        [CTA.IAT]: now,
        [CTA.NBF]: now
    };
    
    // Expiration
    if (policy.ttl) {
        payload[CTA.EXP] = now + parseTTL(policy.ttl);
    }
    
    // URI restrictions (catu → path → prefix_match per AWS docs)
    if (policy.paths) {
        payload[CTA.CATU] = { 2: { 1: policy.paths[0] } };
    }
    
    // Country restrictions
    if (policy.countries) {
        payload[CTA.CATGEOISO3166] = policy.countries;
    }
    
    // Session ID
    if (policy.sessionId) {
        payload[CTA.CTI] = policy.sessionId;
    }
    
    return payload;
}

function parseTTL(ttl) {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 3600;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return 3600;
    }
}

exports.handler = async (event) => {
    try {
        const { policy, viewer, mediaUrl } = JSON.parse(event.body);
        
        const signingKey = await getSigningKey();
        const payload = createCWTPayload(policy, viewer);
        
        // CWT structure for cf.cwt.generateToken()
        const cwtStructure = {
            protected: { 1: 5 }, // HMAC-SHA256
            unprotected: {},
            payload
        };
        
        // Note: Actual token generation would use cf.cwt.generateToken()
        // This is a placeholder for the structure
        const tokenPlaceholder = Buffer.from(JSON.stringify(payload)).toString('base64url');
        
        let signedUrl = mediaUrl;
        if (policy.placement === 'query') {
            const separator = mediaUrl.includes('?') ? '&' : '?';
            signedUrl = `${mediaUrl}${separator}CAT=${tokenPlaceholder}`;
        } else {
            const url = new URL(mediaUrl);
            signedUrl = `${url.protocol}//${url.host}/${tokenPlaceholder}${url.pathname}`;
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                token: tokenPlaceholder,
                signedUrl,
                expiresAt: payload[CTA.EXP]
            })
        };
        
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
