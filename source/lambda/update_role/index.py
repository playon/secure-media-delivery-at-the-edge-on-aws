import json
import boto3
import os
import random
import string

lambda_client = boto3.client('lambda')
iam = boto3.client('iam')

LAMBDA_ARN = os.environ['LE_ARN']
API_ARN = os.environ['API_ARN']

def get_random_string(length):
    # choose from all lowercase letter
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))


def handler(event, context):
    function_name = LAMBDA_ARN.split(':')[6]
    print ('checking if function exists: {}'.format(function_name))
    response = lambda_client.get_function(
                FunctionName=function_name)
    role_arn = response['Configuration']['Role']

    my_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "execute-api:Invoke"
                ],
            "Resource": API_ARN
            }
        ]
    }
    response = iam.create_policy(
        PolicyName='invokeHttpApiPolicy'+get_random_string(6),
        PolicyDocument=json.dumps(my_policy)
    )
    policy_arn = response['Policy']['Arn']
    role_name = role_arn.split(':')[5].split('/')[1]
    print("Attaching the new policy to the role {}".format(role_name))
    response = iam.attach_role_policy(
        RoleName=role_name,
        PolicyArn=policy_arn

    )

    return "ok"