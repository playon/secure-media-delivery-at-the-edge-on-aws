/**
 * Auto-revocation Step Function handler
 * Updates KeyValueStore instead of WAF
 */

const { CloudFrontClient, UpdateKeyValueStoreCommand } = require("@aws-sdk/client-cloudfront");
const { AthenaClient, StartQueryExecutionCommand, GetQueryResultsCommand } = require("@aws-sdk/client-athena");

const cloudfront = new CloudFrontClient({});
const athena = new AthenaClient({});

exports.handler = async (event) => {
    try {
        const { suspiciousTokens } = event; // From Athena analysis
        const kvsId = process.env.KVS_ID;
        
        // Batch update KV store with revoked tokens
        for (const tokenId of suspiciousTokens) {
            const key = `revoked:${tokenId}`;
            const value = JSON.stringify({
                reason: "auto_suspicious_activity",
                revokedAt: Math.floor(Date.now() / 1000),
                ttl: Math.floor(Date.now() / 1000) + 86400
            });
            
            await cloudfront.send(new UpdateKeyValueStoreCommand({
                Id: kvsId,
                IfMatch: "*", 
                Key: key,
                Value: value
            }));
        }
        
        return {
            statusCode: 200,
            revokedCount: suspiciousTokens.length
        };
        
    } catch (error) {
        throw new Error(`Auto-revocation failed: ${error.message}`);
    }
};
