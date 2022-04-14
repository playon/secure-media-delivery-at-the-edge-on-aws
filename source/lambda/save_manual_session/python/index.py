import json
import boto3
import os
import time, calendar, datetime

ddb_client = boto3.client('dynamodb')

table_name = os.environ['TABLE_NAME']
ttl = os.environ['TTL']

def handler(event, context):
    print("Received event: " + json.dumps(event))

    week = datetime.datetime.today() + datetime.timedelta(days=int(ttl))
    expiryDateTime = int(time.mktime(week.timetuple()))
    current_timestamp = calendar.timegm(time.gmtime())

    if 'queryStringParameters' in event and 'sessionid' in event['queryStringParameters']:

        session_id = event['queryStringParameters']['sessionid']
        ddb_client.put_item(
            TableName = table_name,
            Item= {
                    'sessionid': { 'S': session_id},
                    'type': { 'S': 'MANUAL' },
                    'last_updated' : { 'N': str(current_timestamp) },
                    'ttl': { 'N': str(expiryDateTime)}
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

