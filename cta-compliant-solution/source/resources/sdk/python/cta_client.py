"""
CTA-5007-B Python SDK - Local Token Generation
"""

import json
import time
import hmac
import hashlib
import base64
import boto3
from typing import Dict, List, Optional

class CTAClient:
    def __init__(self, stack_name: str, region: str = 'us-east-1'):
        self.stack_name = stack_name
        self.region = region
        self.keys = None
        self.secrets_client = None
    
    def init_secrets_manager(self, **kwargs):
        """Initialize AWS Secrets Manager client"""
        self.secrets_client = boto3.client('secretsmanager', region_name=self.region, **kwargs)
    
    def get_signing_keys(self) -> Dict:
        """Fetch signing keys from AWS Secrets Manager"""
        if not self.secrets_client:
            raise Exception("Call init_secrets_manager() first")
        
        secret_name = f"{self.stack_name}_CTAKey"
        
        try:
            response = self.secrets_client.get_secret_value(SecretId=secret_name)
            secret = json.loads(response['SecretString'])
            
            self.keys = {
                'primary': {'value': secret['signingKey'], 'uuid': 'primary'}
            }
            
            return self.keys
        except Exception as e:
            raise Exception(f"Failed to get signing keys: {str(e)}")
    
    def generate_cwt_token(self, policy: Dict, viewer: Dict = None) -> Dict:
        """Generate CTA-5007-B compliant token locally"""
        if not self.keys:
            raise Exception("No signing keys available. Call get_signing_keys() first")
        
        viewer = viewer or {}
        now = int(time.time())
        
        # CTA-5007-B compliant claims
        claims = {
            4: now + self._parse_ttl(policy.get('ttl', '2h')),  # exp
            5: now,  # nbf
            6: now   # iat
        }
        
        # URI restrictions (catu claim)
        if policy.get('paths'):
            claims[312] = {3: {1: policy['paths'][0]}}
        
        # Country restrictions (catgeoiso3166 claim)
        if policy.get('countries'):
            claims[316] = policy['countries']
        
        # Session ID for replay protection
        if policy.get('sessionId'):
            claims[7] = policy['sessionId']  # cti
        
        # Create and sign token
        header = {'alg': 'HS256', 'typ': 'CWT'}
        token = self._sign_token(header, claims, self.keys['primary']['value'])
        
        return {
            'token': token,
            'claims': claims,
            'expiresAt': claims[4]
        }
    
    def generate_signed_url(self, media_url: str, policy: Dict, viewer: Dict = None) -> str:
        """Generate signed URL with CTA token"""
        result = self.generate_cwt_token(policy, viewer)
        
        # Apply token based on placement preference
        if policy.get('placement') == 'query':
            separator = '&' if '?' in media_url else '?'
            return f"{media_url}{separator}CAT={result['token']}"
        elif policy.get('placement') == 'header':
            return {
                'url': media_url,
                'headers': {'CTA-Common-Access-Token': result['token']}
            }
        else:
            # Default: path placement
            from urllib.parse import urlparse
            parsed = urlparse(media_url)
            return f"{parsed.scheme}://{parsed.netloc}/{result['token']}{parsed.path}{parsed.query}"
    
    def _sign_token(self, header: Dict, payload: Dict, key: str) -> str:
        """Sign token using HMAC-SHA256"""
        encoded_header = self._base64url_encode(json.dumps(header, separators=(',', ':')))
        encoded_payload = self._base64url_encode(json.dumps(payload, separators=(',', ':')))
        signing_input = f"{encoded_header}.{encoded_payload}"
        
        signature = hmac.new(
            key.encode('utf-8'),
            signing_input.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        encoded_signature = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')
        
        return f"{signing_input}.{encoded_signature}"
    
    def _parse_ttl(self, ttl) -> int:
        """Parse TTL string to seconds"""
        if isinstance(ttl, int):
            return ttl
        
        import re
        match = re.match(r'^(\d+)([smhd])$', ttl)
        if not match:
            return 7200  # Default 2 hours
        
        value = int(match.group(1))
        unit = match.group(2)
        
        multipliers = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}
        return value * multipliers.get(unit, 3600)
    
    def _base64url_encode(self, data: str) -> str:
        """Base64URL encode"""
        return base64.urlsafe_b64encode(data.encode('utf-8')).decode('utf-8').rstrip('=')

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
