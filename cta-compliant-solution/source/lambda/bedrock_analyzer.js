/**
 * Bedrock Nova-powered suspicious activity analyzer
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { AthenaClient, GetQueryResultsCommand } = require("@aws-sdk/client-athena");

const bedrock = new BedrockRuntimeClient({});
const athena = new AthenaClient({});

exports.handler = async (event) => {
    try {
        const { queryExecutionId } = event;
        
        // Get raw CloudFront log data from Athena
        const results = await athena.send(new GetQueryResultsCommand({
            QueryExecutionId: queryExecutionId,
        }));
        
        // Prepare data for Nova analysis
        const logData = results.ResultSet.Rows.slice(1).map(row => ({
            tokenId: row.Data[0]?.VarCharValue,
            clientIp: row.Data[1]?.VarCharValue,
            requestCount: parseInt(row.Data[2]?.VarCharValue || "0"),
            uniquePaths: parseInt(row.Data[3]?.VarCharValue || "0"),
            timeSpan: row.Data[4]?.VarCharValue,
            userAgent: row.Data[5]?.VarCharValue,
            referer: row.Data[6]?.VarCharValue,
            country: row.Data[7]?.VarCharValue,
        }));
        
        // Nova prompt for suspicious activity detection
        const prompt = `
Analyze this CloudFront access log data for suspicious token usage patterns. 
Identify tokens that should be revoked based on security concerns.

Data: ${JSON.stringify(logData, null, 2)}

Look for:
1. Abnormally high request rates (>100 req/hour from single IP)
2. Geographic anomalies (same token from multiple countries)
3. Bot-like behavior patterns (regular intervals, missing referers)
4. Path enumeration attempts (accessing many different paths)
5. Token sharing indicators (same token from multiple IPs)

Return JSON response with this structure:
{
  "suspiciousTokens": [
    {
      "tokenId": "token123",
      "riskScore": 85,
      "reasons": ["high_request_rate", "multiple_ips"],
      "confidence": "high",
      "recommendedAction": "immediate_revocation"
    }
  ],
  "summary": {
    "totalAnalyzed": 50,
    "flaggedCount": 3,
    "highRiskCount": 1
  }
}

Only flag tokens with risk scores >70. Be conservative to avoid false positives.
`;

        // Invoke Nova model
        const command = new InvokeModelCommand({
            modelId: "amazon.nova-pro-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                messages: [{
                    role: "user",
                    content: prompt
                }],
                max_tokens: 2000,
                temperature: 0.1, // Low temperature for consistent analysis
            }),
        });
        
        const response = await bedrock.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        // Parse Nova's analysis
        let analysis;
        try {
            analysis = JSON.parse(responseBody.content[0].text);
        } catch (e) {
            // Fallback if Nova doesn't return valid JSON
            console.warn("Nova response parsing failed, using fallback logic");
            analysis = fallbackAnalysis(logData);
        }
        
        // Format for downstream processing
        const suspiciousTokens = analysis.suspiciousTokens.map(token => ({
            tokenId: token.tokenId,
            score: token.riskScore,
            reason: token.reasons.join(", "),
            confidence: token.confidence,
            aiAnalysis: true,
        }));
        
        return {
            suspiciousTokens,
            totalAnalyzed: analysis.summary.totalAnalyzed,
            aiSummary: analysis.summary,
            model: "amazon.nova-pro-v1:0",
        };
        
    } catch (error) {
        console.error("Bedrock analysis failed:", error);
        
        // Fallback to simple rule-based analysis
        const fallbackResult = simpleFallbackAnalysis(event);
        return {
            ...fallbackResult,
            fallbackUsed: true,
            error: error.message,
        };
    }
};

function fallbackAnalysis(logData) {
    const suspicious = logData.filter(item => 
        item.requestCount > 100 || item.uniquePaths > 50
    ).map(item => ({
        tokenId: item.tokenId,
        riskScore: Math.min(100, item.requestCount / 2 + item.uniquePaths * 3),
        reasons: [
            item.requestCount > 100 ? "high_request_rate" : "",
            item.uniquePaths > 50 ? "path_enumeration" : ""
        ].filter(Boolean),
        confidence: "medium",
        recommendedAction: "review"
    }));
    
    return {
        suspiciousTokens: suspicious,
        summary: {
            totalAnalyzed: logData.length,
            flaggedCount: suspicious.length,
            highRiskCount: suspicious.filter(t => t.riskScore > 80).length
        }
    };
}

function simpleFallbackAnalysis(event) {
    return {
        suspiciousTokens: [],
        totalAnalyzed: 0,
        aiSummary: { error: "Bedrock unavailable, no analysis performed" }
    };
}
