# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import time
import secrets
import string
import os
from typing import Dict, Any, Optional, Callable
import boto3
from botocore.exceptions import ClientError


def log(message: str) -> None:
    """Debug logging function."""
    if Session._debug:
        print(f"[DEBUG] {message}")


def get_credentials_and_region(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get AWS credentials and region from parameters."""
    config = {}
    
    if "profile" in params:
        session = boto3.Session(profile_name=params["profile"])
        config["session"] = session
    elif "role" in params:
        sts_client = boto3.client("sts")
        assumed_role = sts_client.assume_role(
            RoleArn=params["role"],
            RoleSessionName=f"SecureMediaDelivery-SDK-{int(time.time())}"
        )
        config["aws_access_key_id"] = assumed_role["Credentials"]["AccessKeyId"]
        config["aws_secret_access_key"] = assumed_role["Credentials"]["SecretAccessKey"]
        config["aws_session_token"] = assumed_role["Credentials"]["SessionToken"]
    
    if "region" in params:
        config["region_name"] = params["region"]
    elif "AWS_REGION" not in os.environ:
        config["region_name"] = "us-east-1"
    
    return config


class Session:
    """
    Manages session revocation and tracking.
    
    This class handles session creation, auto-generation, and revocation
    for the secure media delivery system.
    """
    
    _debug: bool = False
    logger: Callable[[str], None] = log
    _ddb_client: Optional[boto3.client] = None
    revocation_table: str = ""
    
    def __init__(self, session_id: Optional[str] = None, autogenerate: bool = False, 
                 suspicion_score: int = 0):
        """
        Initialize Session.
        
        Args:
            session_id: Existing session ID or length for auto-generation
            autogenerate: Whether to auto-generate session ID
            suspicion_score: Suspicion score for the session
        """
        if session_id and autogenerate:
            try:
                session_length = int(session_id)
                if session_length > 6:
                    self.id = self._auto_generate(session_length)
                else:
                    raise ValueError("Invalid id input while autogenerate set to true. "
                                   "It must be a number greater than 6")
            except ValueError as e:
                if "invalid literal" in str(e):
                    raise ValueError("Invalid id input while autogenerate set to true. "
                                   "It must be a number greater than 6")
                raise
        elif session_id:
            self.id = session_id
        else:
            self.id = self._auto_generate(12)
        
        self.suspicion_score = suspicion_score
    
    @classmethod
    def set_debug(cls, val: bool = True) -> None:
        """Enable or disable debug logging."""
        if isinstance(val, bool):
            cls._debug = val
    
    @classmethod
    def initialize(cls, table_name: str, params: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize session management with DynamoDB table.
        
        Args:
            table_name: Name of the DynamoDB revocation table
            params: AWS configuration parameters
        """
        cls.revocation_table = table_name
        cls.init_db_client(params or {})
    
    async def revoke(self, expiry_period: int = 86400, reason: str = "COMPROMISED") -> bool:
        """
        Revoke the session by adding it to the revocation table.
        
        Args:
            expiry_period: How long the revocation should last (seconds)
            reason: Reason for revocation
            
        Returns:
            True if successful, False otherwise
        """
        if not self._ddb_client:
            raise Exception("DynamoDB client hasn't been initialized")
        if not self.revocation_table:
            raise Exception("Revocation Table name must be set")
        
        current_timestamp = int(time.time())
        expiry_time = current_timestamp + expiry_period
        
        item = {
            "session_id": {"S": self.id},
            "type": {"S": "MANUAL"},
            "score": {"N": str(self.suspicion_score)},
            "reason": {"S": reason},
            "last_updated": {"N": str(current_timestamp)},
            "ttl": {"N": str(expiry_time)}
        }
        
        params = {
            "Item": item,
            "TableName": self.revocation_table
        }
        
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._ddb_client.put_item, params)
            return True
        except Exception as e:
            print(f"ERROR: {e}")
            self.logger(f"Manual session revoke operation failed when updating DynamoDB table: {e}")
            return False
    
    @classmethod
    def init_db_client(cls, params: Dict[str, Any]) -> bool:
        """
        Initialize DynamoDB client.
        
        Args:
            params: AWS configuration parameters
            
        Returns:
            True if successful, False otherwise
        """
        try:
            config = get_credentials_and_region(params)
            if "session" in config:
                cls._ddb_client = config["session"].client("dynamodb")
            else:
                cls._ddb_client = boto3.client("dynamodb", **config)
            return True
        except Exception as e:
            cls.logger(f"Couldn't create DynamoDB client: {e}")
            return False
    
    @staticmethod
    def _auto_generate(output_length: int) -> str:
        """
        Auto-generate a random session ID.
        
        Args:
            output_length: Length of the generated session ID
            
        Returns:
            Random session ID string
        """
        chars = string.ascii_letters + string.digits
        return ''.join(secrets.choice(chars) for _ in range(output_length))
