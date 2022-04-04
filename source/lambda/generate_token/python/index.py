import aws_secure_media_delivery
import json
import os
import base64
import boto3
from urllib.parse import parse_qs, urlencode, urlparse
import time
#out = token.createtoken()
user = os.environ['USERNAME']
passwd = os.environ['PASSWORD']

stackName = os.environ['STACK_NAME']
tableName = os.environ['TABLE_NAME']
dynamodb = boto3.resource('dynamodb')

table = dynamodb.Table(tableName)


def handler(event, context):
    headers = event['headers']
    querystrings = event['queryStringParameters']
    qparams = {k : v[0] for k, v in parse_qs(querystrings).items()}

    if "cloudfront-viewer-address" in headers:
        viewer_ip = str(headers['cloudfront-viewer-address'])[0:str(headers['cloudfront-viewer-address']).rindex(':')]
    else:
        viewer_ip = event['requestContext']['http']['sourceIp']
    message = user + ":" + passwd
    message_bytes = message.encode('ascii')
    base64_bytes = base64.b64encode(message_bytes)
    authorized = base64_bytes.decode('ascii')
    auth_header = str(headers['authorization'][0]['value'])
    auth_header = auth_header.split(' ')[1]
    print ("AUTH HEADER " + auth_header)
    print ("authorized " + authorized)
    if auth_header != authorized:
        response = {
            'status': '401',
            'body': "Not authorized"
        }
        return response

    if ("id" not in qparams) or not list(qparams.keys()):
        response = {
            'status': '400',
            'body': "Bad Request"
        }
        return response
    else:
        id = qparams['id']

    print ("ID is " + str(id))

    try:
        dbResponse = table.get_item(Key={'id': id})
        print ("Response from DB " + str(dbResponse))
    except ClientError as e:
        response = {
            'status': '404',
            'body': "No video asset for the given ID"
        }
        return response
    else:
        print ("All good on DB")

    if 'Item' not in dbResponse:
        response = {
            'status': '404',
            'body': "No video asset for the given ID"
        }
        return response
    video_metadata = dbResponse['Item']
    endpoint_hostname = video_metadata['endpoint_hostname']
    video_url = video_metadata['url_path']
    token_policy = video_metadata['token_policy']

    token_attributes = {}
    if 'ip' in token_policy:
        token_attributes['ip'] = viewer_ip

    if 'co' in token_policy:
        if 'cloudfront-viewer-country' in headers:
            token_attributes['co'] = headers['cloudfront-viewer-country'][0]['value']
        elif 'co_fallback' not in token_policy:
            response = {
            'status': '400',
            'body': "Bad request"
            }
            return response

    if 'cty' in token_policy:
        if 'cloudfront-viewer-city' in headers:
            token_attributes['cty'] = headers['cloudfront-viewer-city'][0]['value']
        elif 'cty_fallback' not in token_policy:
            response = {
            'status': '400',
            'body': "Bad request"
            }
            return response

    if 'session_auto_generate' in token_policy:
        token_attributes['ssn'] = "generate_" + str(token_policy['session_auto_generate'])

    print ("Session: " + token_attributes['ssn'])

    if 'nbf' in token_policy:
        token_attributes['nbf'] = int(token_policy['nbf'])

    if 'exp' in token_policy:
        if ('h' in token_policy['exp']):
            delay = int(token_policy['exp'][:-1])
            #nowint( time.time() )
            token_attributes['exp'] = int( time.time() ) + (delay * 3600)
        elif ('m' in token_policy['exp']):
            delay = int(token_policy['exp'][:-1])
            nowint( time.time() )
            token_attributes['exp'] = int( time.time() ) + (delay * 60)
        else:
            token_attributes['exp'] = token_policy['exp']
    else:
        response = {
            'status': '400',
            'body': "Bad request"
            }
        return response

    if 'paths' in token_policy and len(token_policy['paths']) >0:
        token_attributes['paths'] = token_policy['paths']
    else:
        response = {
            'status': '400',
            'body': "Bad request"
            }
        return response

    if 'exc' in token_policy and len(token_policy['exc']) > 0:
        token_attributes['exc'] = token_policy['exc']
    else:
        response = {
            'status': '400',
            'body': "Bad request"
            }
        return response

    if 'headers' in token_policy and len(token_policy['headers']) > 0:
        token_attributes['headers'] = dict()
        for value in token_policy['headers']:
            value = value.lower()
            token_attributes['headers'][value] = headers[value][0]['value']

    if 'qs' in token_policy and len(token_policy['qs']) > 0:
        token_attributes['qs'] = dict()
        for value in token_policy['qs']:
            value = value.lower()
            token_attributes['qs'][value] = qparams[value]

    full_path = video_metadata['endpoint_hostname'] + video_metadata['url_path']
    out = aws_secure_media_delivery.createtoken(token_attributes,"primary",full_path,secrets_prefix=stackName)
    print (out)

    # TODO implement
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }

