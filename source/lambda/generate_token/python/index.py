import json

print('Loading function')


def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))
    return {
        'statusCode': 202,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps("OK from python")
    }

