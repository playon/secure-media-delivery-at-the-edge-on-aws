/**
 * CTA-5007-B Java SDK
 */

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.util.Map;
import java.util.HashMap;
import com.fasterxml.jackson.databind.ObjectMapper;

public class CTAClient {
    private final String apiEndpoint;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    
    public CTAClient(String apiEndpoint) {
        this.apiEndpoint = apiEndpoint;
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
    }
    
    public Map<String, Object> generateToken(Map<String, Object> policy, 
                                           Map<String, Object> viewer, 
                                           String mediaUrl) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("policy", policy);
        payload.put("viewer", viewer != null ? viewer : new HashMap<>());
        payload.put("mediaUrl", mediaUrl);
        
        String jsonPayload = objectMapper.writeValueAsString(payload);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(apiEndpoint + "/token"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, 
            HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() != 200) {
            throw new Exception("HTTP " + response.statusCode() + ": " + response.body());
        }
        
        return objectMapper.readValue(response.body(), Map.class);
    }
    
    public String signUrl(String mediaUrl, Map<String, Object> policy, 
                         Map<String, Object> viewer) throws Exception {
        Map<String, Object> result = generateToken(policy, viewer, mediaUrl);
        return (String) result.get("signedUrl");
    }
}
