/**
 * CTA-5007-B Java SDK - Local Token Generation
 */

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;
import software.amazon.awssdk.regions.Region;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.ObjectMapper;

public class CTAClient {
    private final String stackName;
    private final String region;
    private SecretsManagerClient secretsClient;
    private Map<String, Object> keys;
    private final ObjectMapper objectMapper;
    
    public CTAClient(String stackName, String region) {
        this.stackName = stackName;
        this.region = region != null ? region : "us-east-1";
        this.objectMapper = new ObjectMapper();
    }
    
    public void initSecretsManager() {
        this.secretsClient = SecretsManagerClient.builder()
            .region(Region.of(this.region))
            .build();
    }
    
    public Map<String, Object> getSigningKeys() throws Exception {
        if (secretsClient == null) {
            throw new Exception("Call initSecretsManager() first");
        }
        
        String secretName = stackName + "_CTAKey";
        
        try {
            GetSecretValueRequest request = GetSecretValueRequest.builder()
                .secretId(secretName)
                .build();
                
            GetSecretValueResponse response = secretsClient.getSecretValue(request);
            
            Map<String, Object> secret = objectMapper.readValue(response.secretString(), Map.class);
            
            this.keys = new HashMap<>();
            Map<String, Object> primaryKey = new HashMap<>();
            primaryKey.put("value", secret.get("signingKey"));
            primaryKey.put("uuid", "primary");
            this.keys.put("primary", primaryKey);
            
            return this.keys;
        } catch (Exception e) {
            throw new Exception("Failed to get signing keys: " + e.getMessage());
        }
    }
    
    public Map<String, Object> generateCWTToken(Map<String, Object> policy, Map<String, Object> viewer) throws Exception {
        if (keys == null) {
            throw new Exception("No signing keys available. Call getSigningKeys() first");
        }
        
        if (viewer == null) viewer = new HashMap<>();
        
        long now = Instant.now().getEpochSecond();
        
        // CTA-5007-B compliant claims
        Map<String, Object> claims = new HashMap<>();
        claims.put("4", now + parseTTL(policy.getOrDefault("ttl", "2h").toString())); // exp
        claims.put("5", now); // nbf
        claims.put("6", now); // iat
        
        // URI restrictions (catu claim)
        if (policy.containsKey("paths")) {
            Map<String, Object> catu = new HashMap<>();
            Map<String, Object> pathObj = new HashMap<>();
            pathObj.put("1", ((java.util.List<?>) policy.get("paths")).get(0));
            catu.put("3", pathObj);
            claims.put("312", catu);
        }
        
        // Country restrictions (catgeoiso3166 claim)
        if (policy.containsKey("countries")) {
            claims.put("316", policy.get("countries"));
        }
        
        // Session ID for replay protection
        if (policy.containsKey("sessionId")) {
            claims.put("7", policy.get("sessionId")); // cti
        }
        
        // Create and sign token
        Map<String, Object> header = new HashMap<>();
        header.put("alg", "HS256");
        header.put("typ", "CWT");
        
        Map<String, Object> primaryKey = (Map<String, Object>) keys.get("primary");
        String token = signToken(header, claims, primaryKey.get("value").toString());
        
        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("claims", claims);
        result.put("expiresAt", claims.get("4"));
        
        return result;
    }
    
    public String generateSignedUrl(String mediaUrl, Map<String, Object> policy, Map<String, Object> viewer) throws Exception {
        Map<String, Object> result = generateCWTToken(policy, viewer);
        String token = result.get("token").toString();
        
        // Apply token based on placement preference
        String placement = policy.getOrDefault("placement", "path").toString();
        
        if ("query".equals(placement)) {
            String separator = mediaUrl.contains("?") ? "&" : "?";
            return mediaUrl + separator + "CAT=" + token;
        } else if ("header".equals(placement)) {
            // Return structured response for header usage
            Map<String, Object> response = new HashMap<>();
            response.put("url", mediaUrl);
            Map<String, String> headers = new HashMap<>();
            headers.put("CTA-Common-Access-Token", token);
            response.put("headers", headers);
            return objectMapper.writeValueAsString(response);
        } else {
            // Default: path placement
            URL url = new URL(mediaUrl);
            return url.getProtocol() + "://" + url.getHost() + "/" + token + url.getPath() + 
                   (url.getQuery() != null ? "?" + url.getQuery() : "");
        }
    }
    
    private String signToken(Map<String, Object> header, Map<String, Object> payload, String key) throws Exception {
        String encodedHeader = base64UrlEncode(objectMapper.writeValueAsString(header));
        String encodedPayload = base64UrlEncode(objectMapper.writeValueAsString(payload));
        String signingInput = encodedHeader + "." + encodedPayload;
        
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(secretKey);
        
        byte[] signature = mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
        String encodedSignature = Base64.getUrlEncoder().withoutPadding().encodeToString(signature);
        
        return signingInput + "." + encodedSignature;
    }
    
    private long parseTTL(String ttl) {
        if (ttl.matches("\\d+")) {
            return Long.parseLong(ttl);
        }
        
        Pattern pattern = Pattern.compile("^(\\d+)([smhd])$");
        Matcher matcher = pattern.matcher(ttl);
        
        if (!matcher.matches()) {
            return 7200; // Default 2 hours
        }
        
        long value = Long.parseLong(matcher.group(1));
        String unit = matcher.group(2);
        
        switch (unit) {
            case "s": return value;
            case "m": return value * 60;
            case "h": return value * 3600;
            case "d": return value * 86400;
            default: return 7200;
        }
    }
    
    private String base64UrlEncode(String data) {
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(data.getBytes(StandardCharsets.UTF_8));
    }
}
