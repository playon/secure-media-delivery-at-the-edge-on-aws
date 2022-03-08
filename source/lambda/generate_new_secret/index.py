import json
import boto3
import os
import uuid
import random
import string

secrets_client = boto3.client('secretsmanager')
cf_client = boto3.client('cloudfront')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']


def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    new_primary_secret_value = uuid.uuid4().hex

    letters = string.ascii_lowercase
    random_suffix = ''.join(random.choice(letters) for i in range(10))
    new_primary_secret_key = 'UUID_'+random_suffix
    # Update temporary secret with a new value
    response = secrets_client.put_secret_value(
        SecretId=temporary_key_name,
        SecretString=json.dumps({new_primary_secret_key : new_primary_secret_value}),
    )

    return "ok"
