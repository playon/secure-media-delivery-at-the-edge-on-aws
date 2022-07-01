import json
import boto3
import os
import botocore

lambda_client = boto3.client('lambda')
iam = boto3.client('iam')

API_ARN = os.environ['API_ARN']
ROLE_ARN = os.environ['ROLE_ARN']
ACCOUNT_ID = os.environ['ACCOUNT_ID']
STACK_NAME = os.environ['STACK_NAME']

def handler(event, context):

    policy_name = STACK_NAME + '_invokeHttpApi'
    policy_arn = "arn:aws:iam::{}:policy/{}".format(ACCOUNT_ID, policy_name)

    print("check if policy {} exist already".format(policy_arn))
    try:
        iam.get_policy(
            PolicyArn = policy_arn
        )

        print("Policy {} exists already".format(policy_name))
    except botocore.exceptions.NoSuchEntityException:
        print("Policy does not exists. Creating it")

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
        iam.create_policy(
            PolicyName=policy_name,
            PolicyDocument=json.dumps(my_policy)
        )
        print("Policy created")
        role_name = ROLE_ARN.split(':')[5].split('/')[1]

        print("Attaching the new policy to the role {}".format(role_name))
        iam.attach_role_policy(
            RoleName=role_name,
            PolicyArn=policy_arn
        )




    return "ok"