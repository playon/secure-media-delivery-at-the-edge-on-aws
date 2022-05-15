import json
import boto3
import os
import random
import string

lambda_client = boto3.client('lambda')
iam = boto3.client('iam')

API_ARN = os.environ['API_ARN']
ROLE_NAME = os.environ['ROLE_NAME']

def get_random_string(length):
    # choose from all lowercase letter
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))


def handler(event, context):

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
    print("Attaching the new policy to the role {}".format(ROLE_NAME))
    response = iam.attach_role_policy(
        RoleName=ROLE_NAME,
        PolicyArn=policy_arn

    )

    return "ok"