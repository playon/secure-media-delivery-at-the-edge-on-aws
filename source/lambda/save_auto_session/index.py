######################################################################################################################
#  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                                *
#                                                                                                                    *
#  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
#  with the License. A copy of the License is located at                                                             *
#                                                                                                                    *
#      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
#                                                                                                                    *
#  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
#  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
#  and limitations under the License.                                                                                *
######################################################################################################################


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
    expiry_date_time = int(time.mktime(week.timetuple()))
    current_timestamp = calendar.timegm(time.gmtime())

    for item in event[1:]:

        ddb_client.put_item(
            TableName = table_name,
            Item= {
                    'session_id': { 'S': item['Data'][0]['VarCharValue']},
                    'type': { 'S': 'AUTO' },
                    'reason': { 'S': 'COMPROMISED' },
                    'score' : { 'N': item['Data'][1]['VarCharValue']},
                    'ip_rate' : { 'N': item['Data'][2]['VarCharValue']},
                    'ip_penalty' : { 'N': item['Data'][3]['VarCharValue']},
                    'referer_penalty' : { 'N': item['Data'][4]['VarCharValue']},
                    'ua_penalty' : { 'N': item['Data'][5]['VarCharValue']},
                    'last_updated' : { 'N': str(current_timestamp) },
                    'ttl': { 'N': str(expiry_date_time)}
                }
            )
        print("Session ID={} inserted in dynamodb ".format(item['Data'][0]['VarCharValue']))





