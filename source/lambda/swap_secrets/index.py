import json
import boto3
import os

secrets_client = boto3.client('secretsmanager')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']
primary_key_name = os.environ['PRIMARY_KEY_NAME']
secondary_key_name = os.environ['SECONDARY_KEY_NAME']

def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    #get temporary secret
    response_secret = secrets_client.get_secret_value(
        SecretId=temporary_key_name
    )

    temporary_secret_as_json = response_secret['SecretString']
    temporary_secret_key_name = list(json.loads(temporary_secret_as_json).keys())[0]
    temporary_secret_key_value = list(json.loads(temporary_secret_as_json).values())[0]

    #get primary secret
    response_secret = secrets_client.get_secret_value(
        SecretId=primary_key_name
    )

    primary_secret_as_json = response_secret['SecretString']
    primary_secret_key_name = list(json.loads(primary_secret_as_json).keys())[0]
    primary_secret_key_value = list(json.loads(primary_secret_as_json).values())[0]

    #set primary value to secondary secret
    response_secret = secrets_client.put_secret_value(
        SecretId=secondary_key_name,
        SecretString=json.dumps({primary_secret_key_name: primary_secret_key_value}),
    )

    #set temporary value to primary secret
    response_secret = secrets_client.put_secret_value(
        SecretId=primary_key_name,
        SecretString=json.dumps({temporary_secret_key_name: temporary_secret_key_value}),
    )

    #delete the temporary keys
    response_secret = secrets_client.put_secret_value(
        SecretId=temporary_key_name,
        SecretString=json.dumps({"INITIALIZED_KEY": "INITIALIZED_VALUE"}),
    )

    return "ok"
    #raise Exception('Something went wrong')

