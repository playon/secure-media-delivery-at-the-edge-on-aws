"""
CTA-5007-B Python SDK
"""

import json
import time
import requests
from typing import Dict, List, Optional

class CTAClient:
    def __init__(self, api_endpoint: str):
        self.api_endpoint = api_endpoint
    
    def generate_token(self, policy: Dict, viewer: Dict = None, media_url: str = None) -> Dict:
        """Generate CTA-5007-B compliant token"""
        payload = {
            'policy': policy,
            'viewer': viewer or {},
            'mediaUrl': media_url
        }
        
        response = requests.post(
            f"{self.api_endpoint}/token",
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        if not response.ok:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        
        return response.json()
    
    def sign_url(self, media_url: str, policy: Dict, viewer: Dict = None) -> str:
        """Generate signed URL with CTA token"""
        result = self.generate_token(policy, viewer, media_url)
        return result['signedUrl']

# Usage examples
EXAMPLES = {
    'basic': {
        'policy': {'paths': ['/video/'], 'ttl': '2h'},
        'viewer': {'country': 'us'}
    },
    'geo_restricted': {
        'policy': {'paths': ['/premium/'], 'ttl': '24h', 'countries': ['us', 'ca']},
        'viewer': {'country': 'us'}
    }
}
