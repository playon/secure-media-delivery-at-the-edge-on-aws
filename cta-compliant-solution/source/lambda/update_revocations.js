/**
 * Update KeyValueStore with revoked tokens (replaces WAF updates)
 */

const { CloudFrontClient, UpdateKeyValueStoreCommand } = require("@aws-sdk/client-cloudfront");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const cloudfront = new CloudFrontClient({});
const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
    try {
        const { suspiciousTokens } = event;
        const kvsId = process.env.KVS_ID;
        const tableName = process.env.SESSIONS_TABLE;
        
        let revokedCount = 0;
        const now = Math.floor(Date.now() / 1000);
        
        for (const token of suspiciousTokens) {
            try {
                // Add to KeyValueStore for fast edge lookup
                const kvKey = `revoked:${token.tokenId}`;
                const kvValue = JSON.stringify({
                    reason: token.reason,
                    score: token.score,
                    revokedAt: now,
                    ttl: now + 86400, // 24 hour TTL
                    type: "auto"
                });
                
                await cloudfront.send(new UpdateKeyValueStoreCommand({
                    Id: kvsId,
                    IfMatch: "*",
                    Key: kvKey,
                    Value: kvValue
                }));
                
                // Also log to DynamoDB for audit trail
                await dynamodb.send(new PutItemCommand({
                    TableName: tableName,
                    Item: {
                        session_id: { S: token.tokenId },
                        reason: { S: token.reason },
                        score: { N: token.score.toString() },
                        type: { S: "AUTO" },
                        last_updated: { N: now.toString() },
                        ttl: { N: (now + 86400).toString() }
                    }
                }));
                
                revokedCount++;
                
            } catch (error) {
                console.error(`Failed to revoke token ${token.tokenId}:`, error);
            }
        }
        
        return {
            success: true,
            revokedCount,
            totalProcessed: suspiciousTokens.length,
        };
        
    } catch (error) {
        throw new Error(`Revocation update failed: ${error.message}`);
    }
};
