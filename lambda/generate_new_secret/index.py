import json
import boto3
import os
import uuid
import random
import string

secrets_client = boto3.client('secretsmanager')
cf_client = boto3.client('cloudfront')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']
primary_key_name = os.environ['PRIMARY_KEY_NAME']
cff_name = os.environ['CFF_NAME']


def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    new_primary_secret_value = uuid.uuid4().hex

    letters = string.ascii_lowercase
    random_suffix = ''.join(random.choice(letters) for i in range(10))
    new_primary_secret_key = 'UUID_'+random_suffix
    # Update temporary secret with a new value
    response_secret = secrets_client.put_secret_value(
        SecretId=temporary_key_name,
        SecretString=json.dumps({new_primary_secret_key : new_primary_secret_value}),
    )


    #get primary secret to set it as secondary
    response_secret = secrets_client.get_secret_value(
        SecretId=primary_key_name
    )

    primary_secret_as_json = response_secret['SecretString']
    primary_secret_key_name = list(json.loads(primary_secret_as_json).keys())[0]
    primary_secret_key_value = list(json.loads(primary_secret_as_json).values())[0]

    response_cf = cf_client.describe_function(
        Name=cff_name
    )

    etag = response_cf['ETag']

    print(etag)

    replaced_content = ""
    line_uuid1 = ""
    #looping through the file
    file = open("index.js", "r")

    #content = file.read()
    for line in file:

        #stripping line break
        line = line.strip()

        #replacing the texts
        if line.startswith('var secrets = '):
            new_line = "var secrets = { \"secret1_key\" : \""+new_primary_secret_key +"\", \"secret1_value\": " + json.dumps(new_primary_secret_value) + ",  \"secret2_key\": \""+primary_secret_key_name +"\", \"secret2_value\": "+ json.dumps(primary_secret_key_value) +" }"
        else:
            new_line = line

        #concatenate the new string and add an end-line break
        replaced_content = replaced_content + new_line + "\n"


    #close the file
    file.close()


    #get code for CFF
    #get ETAG for the CFF
    return {
        'etag': etag,
        'cff_content' : replaced_content
    }
    #raise Exception('Something went wrong')