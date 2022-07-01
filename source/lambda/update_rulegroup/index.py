import json
import boto3
import secrets
import string
import os
import time, calendar, datetime
from boto3.dynamodb.conditions import Key
from botocore.config import Config

my_config = Config(
    region_name = 'us-east-1',
)

waf_client = boto3.client('wafv2', config=my_config)

dynamodb = boto3.resource('dynamodb')

RULE_ID = os.environ['RULE_ID']
RULE_NAME = os.environ['RULE_NAME']
TABLE_NAME = os.environ['TABLE_NAME']
MAX_SESSIONS = os.environ['MAX_SESSIONS']
GSI_INDEX_NAME = os.environ['GSI_INDEX_NAME']
RETENTION = os.environ['RETENTION']

sessions_table = dynamodb.Table(TABLE_NAME)


def get_formatted_rule_config(session_id, RULE_NAME, priority):
   return {
            "Name":RULE_NAME,
            "Priority":priority,
            "Statement":{
               "ByteMatchStatement":{
                  "SearchString": session_id,
                  "FieldToMatch":{
                     "UriPath":{

                     }
                  },
                  "TextTransformations":[
                     {
                        "Priority":0,
                        "Type":"NONE"
                     }
                  ],
                  "PositionalConstraint":"STARTS_WITH"
               }
            },
            "Action":{
               "Block":{

               }
            },
            "VisibilityConfig":{
               "SampledRequestsEnabled": True,
               "CloudWatchMetricsEnabled": True,
               "MetricName":"Example"
            }
         }

def get_current_rules():

   response = waf_client.get_rule_group(
      Name=RULE_NAME,
      Scope='CLOUDFRONT',
      Id=RULE_ID
   )

   return response

def update_rules(visibility, lock_token, rules):
   response = waf_client.update_rule_group(
         Name = RULE_NAME,
         Id = RULE_ID,
         Description = "TokenRevoke",
         Scope = "CLOUDFRONT",
         VisibilityConfig = visibility,
         LockToken = lock_token,
         Rules = rules
   )
   print ("Update rule group status={}".format(response['ResponseMetadata']['HTTPStatusCode']))

   return response
def query_sessions():

   RETENTIONDateTime = datetime.datetime.today() - datetime.timedelta(days=int(RETENTION))
   RETENTIONEpochTimestamp = int(time.mktime(RETENTIONDateTime.timetuple()))

   response = sessions_table.query(
      IndexName=GSI_INDEX_NAME,
      KeyConditionExpression=Key('reason').eq('COMPROMISED') & Key('last_updated').gte(RETENTIONEpochTimestamp)
   )
   return response['Items']


def handler(event, context):

   items = query_sessions()
   global_index = 1
   local_index = 1
   rules = []

   if items:
      print("{} Sessions IDs from DynamoDB to process".format(len(items)))

      #look for manual sessions
      manual_sessions = [item for item in items if item.get('type')=='MANUAL']
      #look for auto sessions
      auto_sessions = [item for item in items if item.get('type')=='AUTO']

      sorted_auto_sessions = sorted(auto_sessions, key=lambda x: x['score'], reverse=True)

      for item in manual_sessions:

         if global_index <= int(MAX_SESSIONS):
            RULE_NAME = str(get_random_alphanumeric_string(8))
            current_rule = get_formatted_rule_config('/' + item['session_id'], RULE_NAME, global_index)
            rules.append(current_rule)
            global_index += 1
            local_index +=1
         else:
            print("Max items added to rule group reached, stopping iteration through results from dynamodb")
            break
         print("{} MANUAL Sessions IDs to add to Rule Group".format(local_index - 1))

      local_index = 1

      for item in sorted_auto_sessions:
         if global_index <= int(MAX_SESSIONS):
            RULE_NAME = str(get_random_alphanumeric_string(8))
            current_rule = get_formatted_rule_config(item['session_id'], RULE_NAME, global_index)
            rules.append(current_rule)
            global_index += 1
            local_index +=1
         else:
            print("Max items added to rule group reached, stopping iteration through results from dynamodb")
            break

         print("{} AUTO Sessions IDs to add to Rule Group".format(local_index - 1))


      print("{} Sessions IDs from DynamoDB to attach to rule group".format(global_index - 1))
      attached_rules = get_current_rules()
      update_rules(attached_rules['RuleGroup']['VisibilityConfig'], attached_rules['LockToken'], rules)

   else:
      print ("No Session ID from DynamoDB Table. Nothing to do.")


   return {
      'statusCode': 200,
      'body': json.dumps("Revoked sessions: ")
   }


def get_random_alphanumeric_string(length):
    letters_and_digits = string.ascii_letters + string.digits
    result_str = ''.join((secrets.choice(letters_and_digits) for i in range(length)))
    return result_str