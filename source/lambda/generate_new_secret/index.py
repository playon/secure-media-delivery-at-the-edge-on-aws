import json
import boto3
import os
import random
import string

from datetime import datetime

secrets_client = boto3.client('secretsmanager')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']


def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    now = datetime.now()

    letters = string.ascii_lowercase
    letters_and_digits = string.ascii_letters + string.digits

    random_key_suffix = ''.join(random.choice(letters) for i in range(10))

    new_primary_secret_key = now.strftime("%Y%m%d") + '_'+random_key_suffix
    new_primary_secret_value = ''.join((random.choice(letters_and_digits) for i in range(64)))

    print("new_primary_secret_key={}".format(new_primary_secret_key))
    # Update temporary secret with a new value
    secrets_client.put_secret_value(
        SecretId=temporary_key_name,
        SecretString=json.dumps({new_primary_secret_key : new_primary_secret_value}),
    )

    return "ok"

