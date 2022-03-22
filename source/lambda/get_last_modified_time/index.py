import json
import boto3
import os

cf_client = boto3.client('cloudfront')
max_iteration = int(os.environ['MAX_ITERATIONS'])

def handler(event, context):

    print("Received event: " + json.dumps(event, indent=2))
    response_cf = cf_client.get_distribution(
            Id=event['id']

        )
    last_updated = str(response_cf['Distribution']['LastModifiedTime'])

    if not 'index' in event:
        event['index'] = 1
    else:
        event['index'] = int(event['index']) + 1

    if event['index'] > max_iteration:
        event['continue'] = False
    else:
        event['continue'] = True

    print(str(last_updated) == event['timestamp'])
    print("str(last_updated)=")
    print(str(last_updated))
    print("event['timestamp']=")
    print(event['timestamp'])
    if last_updated == event['timestamp']:
        event['propagated'] = False
    else:
        event['propagated'] = True


    return event
