import json
import boto3
import os
import uuid
import random
import string
from jsonpath_ng.ext import parse
import datetime

cf_client = boto3.client('cloudfront')
cff_name = os.environ['CFF_NAME']
account_id = os.environ['ACCOUNT_ID']


def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

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
                #timestamp = f"{match_ts.value.isoformat()[:-9]}Z"
                timestamp = str(match_ts.value)


            distribution_list.append({"id": found_id, "timestamp": str(timestamp)})
            print(distribution_list)

        if not 'NextMarker' in  response_cf['DistributionList']:
            break
        else:
            marker = response_cf['DistributionList']['NextMarker']


    print(distribution_list)
    return {
        'distributions': distribution_list
    }