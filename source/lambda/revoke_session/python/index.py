import json
import boto3
import os

ddb_client = boto3.resource('dynamodb')
print('Revoke session manually')
table_name = os.environ['TABLE_NAME']
table = ddb_client.Table(table_name)

def handler(event, context):
    print("Received event: " + json.dumps(event))
    if 'queryStringParameters' in event and 'sessionid' in event['queryStringParameters']:
        sessionid = event['queryStringParameters']['sessionid']
        table.put_item(Item= {'sessionid': sessionid + '.'})
        print("SessionID inserted in dynamodb {}".format(sessionid))

        return {
            'statusCode': 200,
            'body': json.dumps("Token submitted for revocation")
        }
    else:
        return {
            'statusCode': 400,
            'body': json.dumps("Missing querystring 'sessionid'")
        }

