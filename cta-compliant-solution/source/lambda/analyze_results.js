/**
 * Analyze Athena results and identify tokens to revoke
 */

const { AthenaClient, GetQueryResultsCommand, GetQueryExecutionCommand } = require("@aws-sdk/client-athena");

const athena = new AthenaClient({});

exports.handler = async (event) => {
    try {
        const { queryExecutionId } = event;
        
        // Check query status
        const statusCommand = new GetQueryExecutionCommand({
            QueryExecutionId: queryExecutionId,
        });
        
        const statusResult = await athena.send(statusCommand);
        
        if (statusResult.QueryExecution.Status.State !== "SUCCEEDED") {
            throw new Error(`Query not ready: ${statusResult.QueryExecution.Status.State}`);
        }
        
        // Get results
        const resultsCommand = new GetQueryResultsCommand({
            QueryExecutionId: queryExecutionId,
        });
        
        const results = await athena.send(resultsCommand);
        const suspiciousTokens = [];
        
        // Skip header row and process results
        for (let i = 1; i < results.ResultSet.Rows.length; i++) {
            const row = results.ResultSet.Rows[i];
            const tokenId = row.Data[0]?.VarCharValue;
            const requestCount = parseInt(row.Data[2]?.VarCharValue || "0");
            const uniquePaths = parseInt(row.Data[3]?.VarCharValue || "0");
            
            if (tokenId && (requestCount > 100 || uniquePaths > 50)) {
                suspiciousTokens.push({
                    tokenId,
                    requestCount,
                    uniquePaths,
                    reason: requestCount > 100 ? "high_request_rate" : "path_enumeration",
                    score: Math.min(100, Math.floor((requestCount / 10) + (uniquePaths * 2))),
                });
            }
        }
        
        return {
            suspiciousTokens,
            totalFound: suspiciousTokens.length,
        };
        
    } catch (error) {
        throw new Error(`Results analysis failed: ${error.message}`);
    }
};
