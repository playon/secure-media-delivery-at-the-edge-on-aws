import json
import boto3
import random
import string
import os

waf_client = boto3.client('wafv2')
rule_group_id = os.environ['RULE_GROUP_ID']
rule_group_name = os.environ['RULE_GROUP_NAME']

def handler(event, context):

   tokenidlist = ""

   for record in event['Records']:
      print(record)
      token = record['dynamodb']['Keys']['sessionid']['S']
      tokenidlist = tokenidlist + token + ","
      print('Successfully retrieved sessionid {}'.format(token))
      print("RuleName={}".format(rule_group_name))
      print("RuleId={}".format(rule_group_id))
      response = waf_client.get_rule_group(
         Name=rule_group_name,
         Scope='CLOUDFRONT',
         Id=rule_group_id
      )
      print("Response rule group={}".format(response))

      priority = int(len(response['RuleGroup']['Rules']))
      ruleName = str(get_random_alphanumeric_string(8))
      print ("Rule Name is " + str(ruleName))
      lockToken = response['LockToken']
      newRule = {
               "Name":ruleName,
               "Priority":priority,
               "Statement":{
                  "ByteMatchStatement":{
                     "SearchString":token,
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

      print (newRule)

      newRules = response['RuleGroup']['Rules']
      newRules.append(newRule)

      print(newRules)
      visibility = response['RuleGroup']['VisibilityConfig']

      response = waf_client.update_rule_group(
            Name=rule_group_name,
            Id=rule_group_id,
            Description="TokenRevoke",
            Scope="CLOUDFRONT",
            VisibilityConfig=visibility,
            LockToken=lockToken,
            Rules= newRules
      )

      print (response)

   return {
      'statusCode': 200,
      'body': json.dumps("Revoked tokens: " + tokenidlist)
   }


def get_random_alphanumeric_string(length):
    letters_and_digits = string.ascii_letters + string.digits
    result_str = ''.join((random.choice(letters_and_digits) for i in range(length)))
    print("Random alphanumeric String is:", result_str)
    return result_str