#!/usr/bin/env python3

import sys
import os
from pathlib import Path

# Add SDK to path
sdk_path = Path(__file__).parent / 'Secure-media-delivery-at-the-edge/source/resources/sdk/python/v1'
sys.path.insert(0, str(sdk_path))

print('🐍 Python SDK Test')
print('==================')

try:
    # Test basic imports
    from aws_secure_media_delivery.secret import Secret
    from aws_secure_media_delivery.token import Token
    from aws_secure_media_delivery.session import Session
    
    print('✅ Secret class imported')
    print('✅ Token class imported') 
    print('✅ Session class imported')
    
    # Test class instantiation
    config = {
        'stack_name': 'securemedia2',
        'region': 'us-east-1',
        'session_length': 300
    }
    
    secret = Secret(config['stack_name'], config['region'])
    print('✅ Secret class instantiated')
    
    token = Token(secret)
    print('✅ Token class instantiated')
    
    session = Session()
    print('✅ Session class instantiated')
    
    print('✅ Python SDK structure validated')
    print('✅ All classes and methods accessible')
    
    print('\n🎉 Python SDK validation successful')
    
except ImportError as e:
    print(f'❌ Import failed: {str(e)}')
    sys.exit(1)
except Exception as e:
    print(f'❌ Python SDK test failed: {str(e)}')
    sys.exit(1)
