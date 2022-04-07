import json
import boto3
import botocore
import random
import string
import os
import datetime
import json

table_name = os.environ['TABLE_NAME']
bucket_name = os.environ['BUCKET_NAME']
params_filename = os.environ['PARAMS_FILENAME']

s3 = boto3.client('s3')
#s3 = boto3.resource('s3')


def lambda_handler(event, context):

   local_params_filename = '/tmp/' + params_filename

   for record in event['Records']:
      #print(record)
      #replace placeholders
      db_item = record['dynamodb']['NewImage']

      input_parameters = {
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

      json_string = json.dumps(input_parameters)

      with open(local_params_filename, 'w') as file:
         json.dump(json_string, file)

      s3.upload_file(local_params_filename, bucket_name, params_filename)

   return {
      'statusCode': 200,
      'body': 'OK'
   }
