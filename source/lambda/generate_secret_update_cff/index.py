import json
import boto3
import os
import secrets
import string

from datetime import datetime

secrets_client = boto3.client('secretsmanager')
cf_client = boto3.client('cloudfront')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']
primary_key_name = os.environ['PRIMARY_KEY_NAME']
secondary_key_name = os.environ['SECONDARY_KEY_NAME']
cff_name = os.environ['CFF_NAME']

def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    #New secrets
    secret1_key=""
    secret1_value=""
    secret2_key=""
    secret2_value=""


    if 'initialize' in event:
        #lambda is triggered after the first deployment
        # Update temporary secret with a new value
        print("Initialize temporary secret")
        secrets_client.put_secret_value(
            SecretId=temporary_key_name,
            SecretString=json.dumps({generate_secret_key() : generate_secret_value()}),
        )

        print("Initialize primary secret")
        # Update primary secret with a new value
        secret1_key=generate_secret_key()
        secret1_value=generate_secret_value()
        secrets_client.put_secret_value(
            SecretId=primary_key_name,
            SecretString=json.dumps({ secret1_key: secret1_value}),
        )
        secret2_key=generate_secret_key()
        secret2_value=generate_secret_value()

        # Update secondary secret with a new value
        print("Initialize secondary secret")
        secrets_client.put_secret_value(
            SecretId=secondary_key_name,
            SecretString=json.dumps({secret2_key : secret2_value}),
        )
    else:
        # Update temporary secret with a new value
        secret1_key=generate_secret_key()
        secret1_value=generate_secret_value()

        print("Initialize temporary secret")
        secrets_client.put_secret_value(
            SecretId=temporary_key_name,
            SecretString=json.dumps({secret1_key : secret1_value}),
        )

        #get primary secret to set it as secondary
        response_secret = secrets_client.get_secret_value(
            SecretId=primary_key_name
        )

        primary_secret_as_json = response_secret['SecretString']
        secret2_key = list(json.loads(primary_secret_as_json).keys())[0]
        secret2_value = list(json.loads(primary_secret_as_json).values())[0]


    #update CloudFront Function

    replaced_content = ""
    print("Read CloudFront Function code")
    file = open("index.js", "r")

    for line in file:

        #stripping line break
        line = line.strip()

        #replacing the texts
        if line.startswith('var secrets = '):
            new_line = "var secrets = { \""+secret1_key +"\" : \""+secret1_value +"\", \""+secret2_key +"\": " + json.dumps(secret2_value) + " }"
        elif line.startswith('exports.handler'):
            new_line = ""
        else:
            new_line = line

        #concatenate the new string and add an end-line break
        replaced_content = replaced_content + new_line + "\n"


    #close the file
    file.close()

    print("Get CloudFront Function ETAG")
    response_cf = cf_client.describe_function(
        Name=cff_name
    )

    etag = response_cf['ETag']

    print("Update CloudFront Function Code")
    response_cf = cf_client.update_function(
        Name=cff_name,
        IfMatch=etag,
        FunctionConfig={
            'Comment': 'CloudFront Function used to check a JWT token',
            'Runtime': 'cloudfront-js-1.0'
        },
        FunctionCode=str.encode(replaced_content)
    )

    etag = response_cf['ETag']

    print("Publish CloudFront Function")
    cf_client.publish_function(
        Name=cff_name,
        IfMatch=etag
    )
    return "ok"

def generate_secret_key():

    now = datetime.now()
    letters = string.ascii_lowercase
    random_key_suffix = ''.join(secrets.choice(letters) for _ in range(10))

    return  now.strftime("%Y%m%d") + '_'+random_key_suffix

def generate_secret_value():

    letters_and_digits = string.ascii_letters + string.digits
    new_primary_secret_value = ''.join((secrets.choice(letters_and_digits) for _ in range(64)))

    return new_primary_secret_value
