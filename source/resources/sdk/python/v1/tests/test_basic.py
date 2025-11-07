#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Basic tests for the AWS Secure Media Delivery Python SDK.
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from aws_secure_media_delivery import Secret, Token, Session


class TestSecret:
    """Test cases for Secret class."""
    
    def test_secret_initialization(self):
        """Test Secret class initialization."""
        secret = Secret("TestStack", 300)
        assert secret.stack_name == "TestStack"
        assert secret.ttl == 300
        assert secret.retrieve_mode == "native"
        assert secret.keys is None
    
    def test_secret_validation_primary_only(self):
        """Test secret validation with primary key only."""
        valid_keys = {
            "primary": {
                "uuid": "test-uuid",
                "value": "test-value"
            }
        }
        assert Secret.validate_keys(valid_keys) is True
    
    def test_secret_validation_primary_and_secondary(self):
        """Test secret validation with both keys."""
        valid_keys = {
            "primary": {
                "uuid": "test-uuid-1",
                "value": "test-value-1"
            },
            "secondary": {
                "uuid": "test-uuid-2",
                "value": "test-value-2"
            }
        }
        assert Secret.validate_keys(valid_keys) is True
    
    def test_secret_validation_invalid(self):
        """Test secret validation with invalid format."""
        invalid_keys = {
            "primary": {
                "uuid": "test-uuid"
                # Missing 'value'
            }
        }
        assert Secret.validate_keys(invalid_keys) is False
    
    @patch('boto3.client')
    def test_init_sm_client(self, mock_boto_client):
        """Test Secrets Manager client initialization."""
        secret = Secret("TestStack", 300)
        result = secret.init_sm_client()
        assert result is True
        mock_boto_client.assert_called_once()


class TestSession:
    """Test cases for Session class."""
    
    def test_session_initialization_default(self):
        """Test Session initialization with default parameters."""
        session = Session()
        assert len(session.id) == 12
        assert session.suspicion_score == 0
    
    def test_session_initialization_custom_id(self):
        """Test Session initialization with custom ID."""
        session = Session("custom-session-123")
        assert session.id == "custom-session-123"
    
    def test_session_initialization_autogenerate(self):
        """Test Session initialization with auto-generation."""
        session = Session("16", autogenerate=True)
        assert len(session.id) == 16
    
    def test_session_autogenerate_invalid_length(self):
        """Test Session auto-generation with invalid length."""
        with pytest.raises(ValueError):
            Session("5", autogenerate=True)
    
    def test_auto_generate_length(self):
        """Test auto-generation produces correct length."""
        result = Session._auto_generate(20)
        assert len(result) == 20
        assert result.isalnum()
    
    @patch('boto3.client')
    def test_init_db_client(self, mock_boto_client):
        """Test DynamoDB client initialization."""
        result = Session.init_db_client({})
        assert result is True
        mock_boto_client.assert_called_once()


class TestToken:
    """Test cases for Token class."""
    
    def test_token_initialization(self):
        """Test Token class initialization."""
        mock_secret = Mock()
        token = Token(mock_secret)
        assert token.secret == mock_secret
        assert token.default_token_policy is None
    
    def test_sign_method(self):
        """Test HMAC signing method."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        # Test signing
        signature = token._sign("test-data", "test-key", "sha256")
        assert isinstance(signature, str)
        assert len(signature) > 0
    
    def test_populate_ip_ipv4(self):
        """Test IP population with IPv4 address."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        viewer_attributes = {"ip": "192.168.1.1"}
        jwt_payload = {}
        
        result = token._populate_ip(viewer_attributes, jwt_payload)
        assert result["fullIP"] == "192.168.1.1"
        assert result["jwt_payload"]["ip_ver"] == 4
    
    def test_populate_ip_ipv6(self):
        """Test IP population with IPv6 address."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        viewer_attributes = {"ip": "2001:db8::1"}
        jwt_payload = {}
        
        result = token._populate_ip(viewer_attributes, jwt_payload)
        assert "2001:0db8:0000:0000:0000:0000:0000:0001" in result["fullIP"]
        assert result["jwt_payload"]["ip_ver"] == 6
    
    def test_populate_ip_invalid(self):
        """Test IP population with invalid address."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        viewer_attributes = {"ip": "invalid-ip"}
        jwt_payload = {}
        
        with pytest.raises(ValueError):
            token._populate_ip(viewer_attributes, jwt_payload)
    
    def test_populate_exp_relative_hours(self):
        """Test expiration population with relative hours."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        token_policy = {"exp": "+2h"}
        jwt_payload = {}
        
        result = token._populate_exp(token_policy, jwt_payload)
        assert "exp" in result
        assert isinstance(result["exp"], int)
    
    def test_populate_exp_relative_minutes(self):
        """Test expiration population with relative minutes."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        token_policy = {"exp": "+30m"}
        jwt_payload = {}
        
        result = token._populate_exp(token_policy, jwt_payload)
        assert "exp" in result
        assert isinstance(result["exp"], int)
    
    def test_populate_exp_absolute(self):
        """Test expiration population with absolute timestamp."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        token_policy = {"exp": "1640995200"}  # Fixed timestamp
        jwt_payload = {}
        
        result = token._populate_exp(token_policy, jwt_payload)
        assert result["exp"] == 1640995200
    
    def test_populate_exp_invalid(self):
        """Test expiration population with invalid format."""
        mock_secret = Mock()
        token = Token(mock_secret)
        
        token_policy = {"exp": "invalid"}
        jwt_payload = {}
        
        with pytest.raises(ValueError):
            token._populate_exp(token_policy, jwt_payload)


@pytest.mark.asyncio
async def test_token_generation_integration():
    """Integration test for token generation."""
    # Mock secret with test keys
    mock_secret = Mock()
    mock_secret.retrieve_keys = AsyncMock(return_value={
        "primary": {
            "uuid": "test-key-uuid",
            "value": "test-secret-key-value"
        }
    })
    
    token = Token(mock_secret)
    
    viewer_attributes = {
        "ip": "192.168.1.1",
        "co": "US"
    }
    
    token_policy = {
        "ip": True,
        "co": True,
        "paths": ["/video/"],
        "exp": "+1h"
    }
    
    # Generate token
    result = await token.generate(viewer_attributes, None, token_policy)
    
    # Verify result
    assert isinstance(result, str)
    assert len(result) > 0
    # JWT tokens have 3 parts separated by dots
    assert len(result.split('.')) >= 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
