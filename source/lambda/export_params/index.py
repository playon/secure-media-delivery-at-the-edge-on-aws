import json
import boto3
import botocore
import random
import string
import os
import datetime
import json

submit_query_function = os.environ['SUBMIT_QUERY_FUNCTION']
s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')


def handler(event, context):
   print("Received event: " + json.dumps(event))


   for record in event['Records']:

    db_item = record['dynamodb']['NewImage']
    try:
      #score_threshold must be > 1
      if(not float(db_item['score_threshold']['N'])>1):
          raise Exception("score_threshold is lower than 1")
      lambda_client.update_function_configuration(
            FunctionName=submit_query_function,
            Environment={
                'Variables': {
                    'ip_penalty': db_item['ip_penalty']['N'],
                    'referer_penalty': db_item['referer_penalty']['N'],
                    'ua_penalty': db_item['ua_penalty']['N'],
                    'ip_rate': db_item['ip_rate']['N'],
                    'uri_column_name': db_item['uri_column_name']['S'],
                    'referer_column_name': db_item['referer_column_name']['S'],
                    'ua_column_name': db_item['ua_column_name']['S'],
                    'request_ip_column': db_item['request_ip_column']['S'],
                    'status_column_name': db_item['status_column_name']['S'],
                    'response_bytes_column_name': db_item['response_bytes_column_name']['S'],
                    'date_column_name': db_item['date_column_name']['S'],
                    'time_column_name': db_item['time_column_name']['S'],
                    'db_name': db_item['db_name']['S'],
                    'table_name': db_item['table_name']['S'],
                    'min_sessions_number': db_item['min_sessions_number']['N'],
                    'min_session_duration': db_item['min_session_duration']['N'],
                    'score_threshold': db_item['score_threshold']['N'],
                    'partitioned': db_item['partitioned']['N'],
                    'lookback_period': db_item['lookback_period']['N']
                }
            }
        )
      #print(response)

    except botocore.exceptions.ClientError as error:
        # Put your error handling logic here
        raise error

   return {
      'statusCode': 200,
      'body': 'OK'
   }
