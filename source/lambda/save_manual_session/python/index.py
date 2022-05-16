import json
import boto3
import os
import time, calendar, datetime

ddb_client = boto3.client('dynamodb')

table_name = os.environ['TABLE_NAME']
ttl = os.environ['TTL']

def handler(event, context):
    print("Received event: " + json.dumps(event))

    expiryDateTime = datetime.datetime.today() + datetime.timedelta(days=int(ttl))
    expiryEpochTimestamp = int(time.mktime(expiryDateTime.timetuple()))
    currentEpochTimestamp = calendar.timegm(time.gmtime())

    if 'queryStringParameters' in event and 'sessionid' in event['queryStringParameters']:

        session_id = event['queryStringParameters']['sessionid']
        if (len(session_id) > 50 or (not session_id.isalnum())):
            return {
                'statusCode': 400,
                'body': json.dumps("sessionid is invalid")
            }

        ddb_client.put_item(
            TableName = table_name,
            Item= {
                    'session_id': { 'S': session_id},
                    'type': { 'S': 'MANUAL' },
                    'reason': { 'S': 'COMPROMISED' },
                    'last_updated' : { 'N': str(currentEpochTimestamp) },
                    'ttl': { 'N': str(expiryEpochTimestamp)}
                }
            )
        print("Session ID={} inserted in dynamodb ".format(session_id))

        return {
            'statusCode': 200,
            'body': json.dumps("SessionID submitted for revocation")
        }
    else:
        return {
            'statusCode': 400,
            'body': json.dumps("Missing querystring 'sessionid'")
        }

