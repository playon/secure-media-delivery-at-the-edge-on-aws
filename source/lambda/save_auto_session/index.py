import json
import boto3
import os
import time, calendar, datetime

ddb_client = boto3.client('dynamodb')

print('Save sessions to DynamoDb table')
table_name = os.environ['TABLE_NAME']
ttl = os.environ['TTL']

def handler(event, context):
    print("Received event: " + json.dumps(event))

    week = datetime.datetime.today() + datetime.timedelta(days=int(ttl))
    expiryDateTime = int(time.mktime(week.timetuple()))
    current_timestamp = calendar.timegm(time.gmtime())

    for item in event[1:]:

        ddb_client.put_item(
            TableName = table_name,
            Item= {
                    'sessionid': { 'S': item['Data'][0]['VarCharValue']},
                    'type': { 'S': 'AUTO' },
                    'score' : { 'N': item['Data'][1]['VarCharValue']},
                    'ip_rate' : { 'N': item['Data'][2]['VarCharValue']},
                    'ip_penalty' : { 'N': item['Data'][3]['VarCharValue']},
                    'referer_penalty' : { 'N': item['Data'][4]['VarCharValue']},
                    'ua_penalty' : { 'N': item['Data'][5]['VarCharValue']},
                    'last_updated' : { 'N': str(current_timestamp) },
                    'ttl': { 'N': str(expiryDateTime)}
                }
            )
        print("Session ID={} inserted in dynamodb ".format(item['Data'][0]['VarCharValue']))





