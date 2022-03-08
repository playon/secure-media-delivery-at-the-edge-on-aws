import json
import boto3
import os
import uuid
import random
import string
from jsonpath_ng.ext import parse
import datetime

secrets_client = boto3.client('secretsmanager')
cf_client = boto3.client('cloudfront')

temporary_key_name = os.environ['TEMPORARY_KEY_NAME']
primary_key_name = os.environ['PRIMARY_KEY_NAME']
cff_name = os.environ['CFF_NAME']
account_id = os.environ['ACCOUNT_ID']


def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))
    now = datetime.datetime.now()
    marker = ""

    while True:
        response_cf = cf_client.list_distributions(
            Marker=marker,
            MaxItems="100"
        )
        #TODO to handle other behaviours than the default
        cff_arn = "arn:aws:cloudfront::{}:function/{}".format(account_id, cff_name)
        jsonpath_query = "$.DistributionList.Items[?(@.DefaultCacheBehavior.FunctionAssociations.Items[*].FunctionARN=='{}')].Id ".format(cff_arn)
        print(jsonpath_query)
        jsonpath_expression = parse(jsonpath_query)
        distribution_list = []
        for match in jsonpath_expression.find(response_cf):
            found_id=match.value
            timestamp = ""
            jsonpath_expression_ts = parse("$.DistributionList.Items[?(@.Id=='{}')].LastModifiedTime".format(found_id))
            for match_ts in jsonpath_expression_ts.find(response_cf):
                timestamp = f"{match_ts.value.isoformat()[:-9]}Z"


            distribution_list.append({"id": found_id, "timestamp": str(timestamp)})
            print(distribution_list)

        if not 'NextMarker' in  response_cf['DistributionList']:
            break
        else:
            marker = response_cf['DistributionList']['NextMarker']

    #print(distribution_list)


    """

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

    #update cloudfront function code
    replaced_content = ""
    #looping through the file
    print("Read CloudFront Function code")
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
            'Comment': 'string',
            'Runtime': 'cloudfront-js-1.0'
        },
        FunctionCode=str.encode(replaced_content)
    )

    etag = response_cf['ETag']

    print("Publish CloudFront Function")
    response_cf = cf_client.publish_function(
        Name=cff_name,
        IfMatch=etag
    )

    print(etag)
    """
    print(distribution_list)
    return {
        'distributions': distribution_list
    }
