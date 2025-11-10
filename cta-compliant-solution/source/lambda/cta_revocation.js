/**
 * CTA Token Revocation Handler
 * Manages token revocation via CloudFront KeyValueStore
 */

const { CloudFrontClient, UpdateKeyValueStoreCommand } = require("@aws-sdk/client-cloudfront");

const cloudfront = new CloudFrontClient({});

exports.handler = async (event) => {
    try {
        const { tokenId, reason = "manual", ttl = 86400 } = JSON.parse(event.body);
        
        if (!tokenId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing tokenId" })
            };
        }
        
        // Add to KV store revocation list
        const kvsId = process.env.KVS_ID;
        const key = `revoked:${tokenId}`;
        const value = JSON.stringify({
            reason,
            revokedAt: Math.floor(Date.now() / 1000),
            ttl: Math.floor(Date.now() / 1000) + ttl
        });
        
        await cloudfront.send(new UpdateKeyValueStoreCommand({
            Id: kvsId,
            IfMatch: "*",
            Key: key,
            Value: value
        }));
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                tokenId,
                reason,
                message: "Token revoked successfully"
            })
        };
        
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
