/**
 * CTA-5007-B Native SDK
 */

class CTAClient {
    constructor(apiEndpoint) {
        this.apiEndpoint = apiEndpoint;
    }

    async generateToken(policy, viewer = {}, mediaUrl) {
        const response = await fetch(`${this.apiEndpoint}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy, viewer, mediaUrl })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }

    async signUrl(mediaUrl, policy, viewer = {}) {
        const result = await this.generateToken(policy, viewer, mediaUrl);
        return result.signedUrl;
    }

    async revokeToken(tokenId, reason = "manual") {
        const response = await fetch(`${this.apiEndpoint}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenId, reason })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }
}

// Usage examples
const Examples = {
    basic: {
        policy: { paths: ["/video/"], ttl: "2h" },
        viewer: { country: "us" }
    },
    
    geoRestricted: {
        policy: { 
            paths: ["/premium/"], 
            ttl: "24h",
            countries: ["us", "ca", "gb"]
        }
    },
    
    sessionBased: {
        policy: {
            paths: ["/live/"],
            ttl: "1h", 
            sessionId: "session-123"
        }
    }
};

if (typeof module !== 'undefined') module.exports = { CTAClient, Examples };
else window.CTAClient = CTAClient;
