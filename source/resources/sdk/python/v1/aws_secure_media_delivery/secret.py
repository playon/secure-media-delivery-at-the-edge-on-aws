# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
import time
import asyncio
import os
from typing import Dict, Any, Optional, Callable, List, Union
import boto3
from botocore.exceptions import ClientError


def log(message: str) -> None:
    """Debug logging function."""
    if Secret._debug:
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


class Secret:
    """
    Manages cryptographic secrets for token signing.
    
    This class handles the retrieval and caching of secrets from AWS Secrets Manager
    or custom sources for use in JWT token generation.
    """
    
    _debug: bool = False
    logger: Callable[[str], None] = log
    
    def __init__(
        self,
        stack_name: str,
        ttl: int,
        retrieve_mode: str = "native",
        retrieve_function: Optional[Callable] = None,
        retrieve_function_args: Optional[List[Any]] = None
    ):
        """
        Initialize Secret manager.
        
        Args:
            stack_name: CloudFormation stack name
            ttl: Time-to-live for cached secrets in seconds
            retrieve_mode: "native" for AWS Secrets Manager or "custom" for custom function
            retrieve_function: Custom function to retrieve secrets (if retrieve_mode="custom")
            retrieve_function_args: Arguments for custom retrieve function
        """
        self.keys: Optional[Dict[str, Dict[str, str]]] = None
        self._last_updated: Optional[int] = None
        self._lock: bool = False
        self.stack_name = stack_name
        self._sm_client: Optional[boto3.client] = None
        self.ttl = ttl
        self.retrieve_mode = retrieve_mode
        self.retrieve_function = retrieve_function
        self.retrieve_function_args = retrieve_function_args or []
    
    @classmethod
    def set_debug(cls, val: bool = True) -> None:
        """Enable or disable debug logging."""
        if isinstance(val, bool):
            cls._debug = val
    
    def init_sm_client(self, params: Optional[Dict[str, Any]] = None) -> bool:
        """
        Initialize AWS Secrets Manager client.
        
        Args:
            params: AWS configuration parameters
            
        Returns:
            True if successful, False otherwise
        """
        try:
            config = get_credentials_and_region(params or {})
            if "session" in config:
                self._sm_client = config["session"].client("secretsmanager")
            else:
                self._sm_client = boto3.client("secretsmanager", **config)
            return True
        except Exception as e:
            self.logger(f"Couldn't create SecretsManager client: {e}")
            return False
    
    async def _get_sm_secret(self) -> Dict[str, Dict[str, str]]:
        """
        Retrieve secrets from AWS Secrets Manager.
        
        Returns:
            Dictionary containing primary and secondary secrets
        """
        secret_name_primary = f"{self.stack_name}_PrimarySecret"
        secret_name_secondary = f"{self.stack_name}_SecondarySecret"
        
        try:
            # Get both secrets concurrently
            loop = asyncio.get_event_loop()
            
            primary_task = loop.run_in_executor(
                None,
                lambda: self._sm_client.get_secret_value(SecretId=secret_name_primary)
            )
            secondary_task = loop.run_in_executor(
                None,
                lambda: self._sm_client.get_secret_value(SecretId=secret_name_secondary)
            )
            
            primary_response, secondary_response = await asyncio.gather(
                primary_task, secondary_task
            )
            
            primary_secret_json = self._get_secret_kv(primary_response)
            secondary_secret_json = self._get_secret_kv(secondary_response)
            
        except Exception as e:
            raise Exception(f"Couldn't retrieve SecretsManager secrets: {e}")
        
        return {
            "primary": {
                "uuid": list(primary_secret_json.keys())[0],
                "value": list(primary_secret_json.values())[0]
            },
            "secondary": {
                "uuid": list(secondary_secret_json.keys())[0],
                "value": list(secondary_secret_json.values())[0]
            }
        }
    
    def get_key_value(self, key_alias: str) -> str:
        """Get the value of a specific key."""
        return self.keys[key_alias]["value"]
    
    def get_key_uuid(self, key_alias: str) -> str:
        """Get the UUID of a specific key."""
        return self.keys[key_alias]["uuid"]
    
    def _check_if_expired(self) -> Optional[bool]:
        """
        Check if cached keys have expired.
        
        Returns:
            True if expired, False if valid, None if not set
        """
        if not self._last_updated:
            self.logger("Keys have not been set yet")
            return None
        elif int(time.time()) - self._last_updated > self.ttl:
            return True
        else:
            return False
    
    async def retrieve_keys(self, key_alias: str = "all") -> Union[Dict[str, Dict[str, str]], Dict[str, str]]:
        """
        Retrieve cryptographic keys.
        
        Args:
            key_alias: "all" for all keys, or specific alias ("primary"/"secondary")
            
        Returns:
            Dictionary containing requested keys
        """
        is_expired = self._check_if_expired()
        
        if self._last_updated and (not is_expired or self._lock):
            if key_alias == "all":
                return self.keys
            return self.keys[key_alias]
        
        self.logger("Starting key retrieval")
        self._lock = True
        
        try:
            if self.retrieve_mode == "native":
                provisional_keys = await self._get_sm_secret()
                if not self.validate_keys(provisional_keys):
                    raise Exception("Invalid format of the returned keys")
                self.keys = provisional_keys
                self._last_updated = int(time.time())
            elif self.retrieve_mode == "custom":
                if asyncio.iscoroutinefunction(self.retrieve_function):
                    provisional_keys = await self.retrieve_function(*self.retrieve_function_args)
                else:
                    provisional_keys = self.retrieve_function(*self.retrieve_function_args)
                if not self.validate_keys(provisional_keys):
                    raise Exception("Invalid format of the returned keys")
                self.keys = provisional_keys
                self._last_updated = int(time.time())
        except Exception as e:
            print(e)
            self.logger(f"Failed to retrieve the keys: {e}")
        finally:
            self._lock = False
        
        if self.keys:
            if key_alias == "all":
                return self.keys
            return self.keys[key_alias]
        
        raise Exception("Key retrieval failed and no previously set key is available")
    
    @staticmethod
    def validate_keys(obj: Dict[str, Any]) -> bool:
        """
        Validate the format of retrieved keys.
        
        Args:
            obj: Keys object to validate
            
        Returns:
            True if valid format, False otherwise
        """
        top_level_keys = list(obj.keys())
        
        if len(top_level_keys) == 1:
            low_level_keys = list(obj["primary"].keys())
            return Secret._validate_primary(
                top_level_keys, low_level_keys,
                obj["primary"]["uuid"], obj["primary"]["value"]
            )
        elif len(top_level_keys) == 2:
            return Secret._validate_secondary(top_level_keys, list(obj.items()))
        else:
            return False
    
    @staticmethod
    def _validate_primary(top_level_keys: List[str], low_level_keys: List[str], 
                         uuid: str, value: str) -> bool:
        """Validate primary key structure."""
        if "primary" not in top_level_keys:
            return False
        if len(low_level_keys) != 2:
            return False
        if not ("uuid" in low_level_keys and "value" in low_level_keys):
            return False
        return isinstance(uuid, str) and isinstance(value, str)
    
    @staticmethod
    def _validate_secondary(top_level_keys: List[str], entries: List[tuple]) -> bool:
        """Validate secondary key structure."""
        if not ("primary" in top_level_keys and "secondary" in top_level_keys):
            return False
        
        for key, value in entries:
            low_level_keys = list(value.keys())
            if len(low_level_keys) != 2:
                return False
            if not ("uuid" in low_level_keys and "value" in low_level_keys):
                return False
            if not (isinstance(value["uuid"], str) and isinstance(value["value"], str)):
                return False
        
        return True
    
    @staticmethod
    def _get_secret_kv(sm_response: Dict[str, Any]) -> Dict[str, str]:
        """
        Extract key-value pairs from Secrets Manager response.
        
        Args:
            sm_response: Response from Secrets Manager
            
        Returns:
            Dictionary containing secret key-value pairs
        """
        if "SecretString" in sm_response:
            secret = sm_response["SecretString"]
        else:
            import base64
            secret = base64.b64decode(sm_response["SecretBinary"]).decode()
        
        return json.loads(secret)
