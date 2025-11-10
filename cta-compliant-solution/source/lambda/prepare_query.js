/**
 * Prepare Athena query for Bedrock analysis
 * Collects richer data for AI-powered suspicious detection
 */

const { AthenaClient, StartQueryExecutionCommand } = require("@aws-sdk/client-athena");

const athena = new AthenaClient({});

exports.handler = async (event) => {
    try {
        const queryBucket = process.env.QUERY_BUCKET;
        
        // Enhanced query for Bedrock analysis - collect more context
        const query = `
            SELECT 
                regexp_extract(cs_uri_stem, '/([^/]+)/', 1) as token_id,
                c_ip,
                COUNT(*) as request_count,
                COUNT(DISTINCT cs_uri_stem) as unique_paths,
                CONCAT(MIN(date), ' to ', MAX(date)) as time_span,
                arbitrary(cs_user_agent) as user_agent,
                arbitrary(cs_referer) as referer,
                arbitrary(cs_header_cloudfront_viewer_country) as country,
                COUNT(DISTINCT c_ip) as unique_ips,
                AVG(sc_bytes) as avg_bytes,
                COUNT(CASE WHEN sc_status >= 400 THEN 1 END) as error_count,
                array_agg(DISTINCT sc_status) as status_codes
            FROM cloudfront_logs
            WHERE date >= current_date - interval '1' hour
                AND cs_uri_stem LIKE '/%/%'
                AND regexp_extract(cs_uri_stem, '/([^/]+)/', 1) != ''
            GROUP BY 
                regexp_extract(cs_uri_stem, '/([^/]+)/', 1),
                c_ip
            HAVING 
                COUNT(*) > 10  -- Lower threshold for Bedrock analysis
            ORDER BY request_count DESC
            LIMIT 500
        `;
        
        const command = new StartQueryExecutionCommand({
            QueryString: query,
            ResultConfiguration: {
                OutputLocation: `s3://${queryBucket}/bedrock-analysis/`,
            },
            WorkGroup: "primary",
        });
        
        const result = await athena.send(command);
        
        return {
            queryExecutionId: result.QueryExecutionId,
            status: "RUNNING",
            analysisType: "bedrock_enhanced",
        };
        
    } catch (error) {
        throw new Error(`Enhanced query preparation failed: ${error.message}`);
    }
};
