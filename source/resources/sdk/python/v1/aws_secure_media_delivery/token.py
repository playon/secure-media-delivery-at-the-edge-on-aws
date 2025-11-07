# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import hmac
import hashlib
import base64
import time
import ipaddress
from urllib.parse import parse_qs, urlparse
from typing import Dict, Any, Optional, Callable, Union
import jwt
from .secret import Secret
from .session import Session


def log(message: str) -> None:
    """Debug logging function."""
    if Token._debug:
        print(f"[DEBUG] {message}")


def expand_ipv6(address: str) -> str:
    """
    Expand IPv6 address to full format.
    
    Args:
        address: IPv6 address string
        
    Returns:
        Fully expanded IPv6 address
    """
    try:
        # Use ipaddress module to properly expand IPv6
        ip = ipaddress.IPv6Address(address)
        return str(ip.exploded)
    except ipaddress.AddressValueError:
        # Fallback to manual expansion for edge cases
        hextets_abbrev = address.split(':')
        if hextets_abbrev[-1] == '':
            hextets_abbrev.pop()
        if hextets_abbrev[0] == '':
            hextets_abbrev.pop(0)
        
        # Add leading zeros and expand :: notation
        hextets = [item.zfill(4) if item else '' for item in hextets_abbrev]
        
        if '' in hextets:
            empty_index = hextets.index('')
            missing_count = 9 - len(hextets)
            hextets[empty_index:empty_index+1] = ['0000'] * missing_count
        
        return ':'.join(hextets)


class Token:
    """
    Generates JWT tokens with various security policies.
    
    This class creates secure tokens for media delivery with support for
    IP validation, geolocation, headers, query strings, and session management.
    """
    
    _debug: bool = False
    logger: Callable[[str], None] = log
    
    def __init__(self, secret: Secret, default_token_policy: Optional[Dict[str, Any]] = None):
        """
        Initialize Token generator.
        
        Args:
            secret: Secret manager instance
            default_token_policy: Default policy for token generation
        """
        self.secret = secret
        self.default_token_policy = default_token_policy
        self.encoded_jwt: Optional[str] = None
        self.output_playback_url: Optional[str] = None
        self.payload_ssn: Optional[str] = None
    
    @classmethod
    def set_debug(cls, val: bool = True) -> None:
        """Enable or disable debug logging."""
        if isinstance(val, bool):
            cls._debug = val
    
    def _sign(self, input_data: str, key: str, method: str) -> str:
        """
        Create HMAC signature.
        
        Args:
            input_data: Data to sign
            key: Signing key
            method: Hash method (e.g., 'sha256')
            
        Returns:
            Base64URL encoded signature
        """
        if method == 'sha256':
            hash_func = hashlib.sha256
        else:
            raise ValueError(f"Unsupported hash method: {method}")
        
        signature = hmac.new(
            key.encode('utf-8'),
            input_data.encode('utf-8'),
            hash_func
        ).digest()
        
        # Convert to base64url encoding
        return base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')
    
    def _populate_ip(self, viewer_attributes: Dict[str, Any], 
                    jwt_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Populate IP-related fields in JWT payload.
        
        Args:
            viewer_attributes: Viewer's attributes including IP
            jwt_payload: JWT payload being constructed
            
        Returns:
            Dictionary with fullIP and updated jwt_payload
        """
        ip = viewer_attributes['ip']
        
        try:
            ip_obj = ipaddress.ip_address(ip)
            if isinstance(ip_obj, ipaddress.IPv4Address):
                jwt_payload['ip_ver'] = 4
                full_ip = str(ip_obj)
            elif isinstance(ip_obj, ipaddress.IPv6Address):
                jwt_payload['ip_ver'] = 6
                full_ip = expand_ipv6(str(ip_obj))
            else:
                raise ValueError("Invalid IP address format")
        except ipaddress.AddressValueError:
            raise ValueError("Invalid viewer's IP format")
        
        return {"fullIP": full_ip, "jwt_payload": jwt_payload}
    
    def _populate_boolean_items(self, token_policy: Dict[str, Any], 
                               viewer_attributes: Dict[str, Any],
                               jwt_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Populate boolean policy items in JWT payload.
        
        Args:
            token_policy: Token generation policy
            viewer_attributes: Viewer's attributes
            jwt_payload: JWT payload being constructed
            
        Returns:
            Dictionary with updated jwt_payload and intsig_input
        """
        intsig_input = ''
        
        if token_policy.get('ip'):
            populated_ip = self._populate_ip(viewer_attributes, jwt_payload)
            jwt_payload = populated_ip['jwt_payload']
            jwt_payload['ip'] = True
            intsig_input += populated_ip['fullIP'] + ':'
        
        if token_policy.get('co'):
            jwt_payload['co'] = True
            intsig_input += viewer_attributes['co'] + ':'
            if token_policy.get('co_fallback'):
                jwt_payload['co_fallback'] = True
        
        if token_policy.get('cty'):
            jwt_payload['cty'] = True
            intsig_input += viewer_attributes['cty'] + ':'
        
        if token_policy.get('reg'):
            jwt_payload['reg'] = True
            intsig_input += viewer_attributes['reg'] + ':'
            if token_policy.get('reg_fallback'):
                jwt_payload['reg_fallback'] = True
        
        if token_policy.get('ssn'):
            jwt_payload['ssn'] = True
            if 'sessionId' in viewer_attributes:
                self.payload_ssn = viewer_attributes['sessionId']
            else:
                session = Session(
                    str(token_policy.get('session_auto_generate', 12)), 
                    autogenerate=True
                )
                self.payload_ssn = session.id
            intsig_input += self.payload_ssn + ':'
        
        return {"jwt_payload": jwt_payload, "intsig_input": intsig_input}
    
    def _populate_exp(self, token_policy: Dict[str, Any], 
                     jwt_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Populate expiration time in JWT payload.
        
        Args:
            token_policy: Token generation policy
            jwt_payload: JWT payload being constructed
            
        Returns:
            Updated JWT payload
        """
        exp = token_policy['exp']
        
        if exp.startswith('+'):
            current_time = int(time.time())
            if exp.endswith('h'):
                jwt_payload['exp'] = current_time + int(exp[1:-1]) * 3600
            elif exp.endswith('m'):
                jwt_payload['exp'] = current_time + int(exp[1:-1]) * 60
            else:
                raise ValueError("Invalid exp format")
        else:
            parsed_exp = int(exp)
            if parsed_exp <= 0:
                raise ValueError("Invalid exp format")
            jwt_payload['exp'] = parsed_exp
        
        return jwt_payload
    
    def _populate_jwt_payload(self, token_policy: Dict[str, Any],
                             viewer_attributes: Dict[str, Any],
                             jwt_payload: Dict[str, Any],
                             playback_url_qs: Dict[str, Any],
                             secret_alias: Dict[str, str]) -> Dict[str, Any]:
        """
        Populate the complete JWT payload.
        
        Args:
            token_policy: Token generation policy
            viewer_attributes: Viewer's attributes
            jwt_payload: JWT payload being constructed
            playback_url_qs: Query string parameters from playback URL
            secret_alias: Secret key information
            
        Returns:
            Complete JWT payload
        """
        boolean_items = self._populate_boolean_items(token_policy, viewer_attributes, jwt_payload)
        jwt_payload = boolean_items['jwt_payload']
        intsig_input = boolean_items['intsig_input']
        
        if token_policy.get('headers') and len(token_policy['headers']) > 0:
            for header in token_policy['headers']:
                jwt_payload['headers'].append(header)
                if header in viewer_attributes.get('headers', {}):
                    intsig_input += viewer_attributes['headers'][header] + ':'
        
        if token_policy.get('querystrings') and len(token_policy['querystrings']) > 0:
            for qs_param in token_policy['querystrings']:
                jwt_payload['qs'].append(qs_param)
                qs_value = (playback_url_qs.get(qs_param) or 
                           viewer_attributes.get('qs', {}).get(qs_param))
                if qs_value:
                    # Handle list values from parse_qs
                    if isinstance(qs_value, list):
                        qs_value = qs_value[0]
                    intsig_input += qs_value + ':'
        
        if intsig_input:
            intsig_input = intsig_input.rstrip(':')
            self.logger(f"Input for internal signature: {intsig_input}")
            jwt_payload['intsig'] = self._sign(intsig_input, secret_alias['value'], 'sha256')
        else:
            jwt_payload.pop('intsig', None)
        
        jwt_payload['paths'] = token_policy['paths']
        if token_policy.get('exc'):
            jwt_payload['exc'] = token_policy['exc']
        
        if token_policy.get('nbf'):
            jwt_payload['nbf'] = int(token_policy['nbf'])
        
        jwt_payload = self._populate_exp(token_policy, jwt_payload)
        
        return jwt_payload
    
    async def generate(self, viewer_attributes: Dict[str, Any],
                      playback_url: Optional[str] = None,
                      token_policy: Optional[Dict[str, Any]] = None,
                      secret_alias: str = "primary") -> str:
        """
        Generate a secure JWT token.
        
        Args:
            viewer_attributes: Viewer's attributes (IP, location, headers, etc.)
            playback_url: Original playback URL to be secured
            token_policy: Token generation policy
            secret_alias: Which secret to use ("primary" or "secondary")
            
        Returns:
            Signed playback URL or token string
        """
        keys = await self.secret.retrieve_keys()
        if secret_alias not in keys:
            raise ValueError(f"Provided secret alias '{secret_alias}' can't be found in the retrieved secret")
        
        playback_url_qs = {}
        if playback_url:
            parsed_url = urlparse(playback_url)
            playback_url_qs = parse_qs(parsed_url.query)
        
        # Use provided policy or default
        policy = token_policy or self.default_token_policy
        if not policy:
            raise ValueError("No token policy provided and no default policy set")
        
        jwt_payload = {
            "ip": False,
            "co": False,
            "cty": False,
            "reg": False,
            "ssn": False,
            "exp": "",
            "headers": [],
            "qs": [],
            "intsig": "",
            "paths": [],
            "exc": []
        }
        
        jwt_payload = self._populate_jwt_payload(
            policy, viewer_attributes, jwt_payload, playback_url_qs, keys[secret_alias]
        )
        
        # Generate JWT token
        self.encoded_jwt = jwt.encode(
            jwt_payload,
            keys[secret_alias]['value'],
            algorithm='HS256',
            headers={'kid': keys[secret_alias]['uuid']}
        )
        
        if playback_url:
            # Insert token into URL path
            url_parts = playback_url.split('/')
            token_part = f"{self.payload_ssn}.{self.encoded_jwt}" if self.payload_ssn else self.encoded_jwt
            url_parts.insert(3, token_part)  # Insert after protocol://domain
            self.output_playback_url = '/'.join(url_parts)
            return self.output_playback_url
        
        # Return token with optional session ID
        return f"{self.payload_ssn}.{self.encoded_jwt}" if self.payload_ssn else self.encoded_jwt
