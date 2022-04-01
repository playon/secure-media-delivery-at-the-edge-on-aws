import jwt
import random
import base64
import cachetools.func
import json
import boto3
import hmac
import hashlib
import base64
from urllib.parse import urlparse, urldefrag, urlsplit


class Secret:
    Secret = "cloudfront/tokenauth/key"

    @classmethod
    @cachetools.func.ttl_cache(ttl=4)
    def __init__(self):
        print ("Fetching Secret...")
        session = boto3.session.Session()
        client = session.client(
                service_name='secretsmanager'
        )

        try:
            primary_secret_value_response = client.get_secret_value(
            SecretId=Secret.primarySecret
            )

            secondary_secret_value_response = client.get_secret_value(
            SecretId=Secret.secondarySecret
            )

        except SystemError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                print("The requested secret was not found")
            elif e.response['Error']['Code'] == 'InvalidRequestException':
                print("The request was invalid due to:", e)
            elif e.response['Error']['Code'] == 'InvalidParameterException':
                print("The request had invalid params:", e)
            elif e.response['Error']['Code'] == 'DecryptionFailure':
                print("The requested secret can't be decrypted using the provided KMS key:", e)
            elif e.response['Error']['Code'] == 'InternalServiceError':
                print("An error occurred on service side:", e)
        else:
            if 'SecretString' in primary_secret_value_response:
                secret_data = json.loads(primary_secret_value_response['SecretString'])
                first_pair = next(iter((secret_data.items())) )
                Secret.secret1 = first_pair[1]

            if 'SecretString' in secondary_secret_value_response:
                secret_data = json.loads(secondary_secret_value_response['SecretString'])
                first_pair = next(iter((secret_data.items())) )
                Secret.secret2 = first_pair[1]

    def show(self,kind):
        if "primary" in kind:
             return(self.secret1)
        if "secondary" in kind:
             return(self.secret2)



def createtoken(attributes,secret_alias,playback_url,**kwargs):
	jwt_payload = {}
	jwt_payload['ip'] = "false"
	jwt_payload['co'] = "false"
	jwt_payload['cty'] = "false"
	jwt_payload['ssn'] = "false"
	jwt_payload['nbf'] = ''
	jwt_payload['exp'] = ''
	jwt_payload['headers'] = {}
	jwt_payload['qs'] = {}
	jwt_payload['intsig'] = ''
	jwt_payload['paths'] = {}
	jwt_payload['exc'] = {}
	private_payload = ""

	if "secrets_prefix" not in kwargs:
	  secrets_prefix = "cloudfront/tokenauth/key"
	else:
	  secrets_prefix = kwargs['secrets_prefix']

	p = urlparse(playback_url)
	myScheme = p.scheme
	myDomain = p.netloc
	myPath = p.path
		
	Secret.Secret = secret_alias
	Secret.primarySecret = secrets_prefix + "_PrimarySecret"
	Secret.secondarySecret = secrets_prefix + "_SecondarySecret"
	keys = Secret()
	secret = keys.show("primary")
	
	### Encode key into UTF-8
	key = secret.encode()

	if "ip" in attributes:
	  jwt_payload['ip'] = True
	  private_payload += attributes['ip'] + ":"
	
	if "co" in attributes:
	  jwt_payload['co'] = True
	  private_payload += attributes['co'] + ":"
	
	if "ip" in attributes:
	  jwt_payload['cty'] = True
	  private_payload += attributes['cty'] + ":"
	
	if "ssn" in attributes:
	  jwt_payload['ssn'] = True
	  if "generate" in attributes['ssn']:
	    sessionArr = attributes['ssn'].split(_)
	    sessionLen = sessionArr[1]
	    sessionPayload = ''.join(random.choices(string.ascii_lowercase, k=sessionLen))
	  else:
	    sessionPayload = attributes['ssn']

	if "headers" in attributes:
	  jwt_payload['headers'] = attributes['headers']
	  headerString = ":".join(attributes['headers'])
	  private_payload += headerString + ":"
	
	if "qs" in attributes:
	  jwt_payload['qs'] = attributes['qs']
	  queryString = ":".join(attributes['qs'])
	  private_payload += queryString + ":"

	if "exc" in attributes:
	  jwt_payload['exc'] = attributes['exc']
	
	if "nbf" in attributes:
	  jwt_payload['nbf'] = int(attributes['nbf'])
	
	if "exp" in attributes:
	  jwt_payload['exp'] = int(attributes['exp'])
	

	
	### Generate private payload
	private_payload = private_payload.rstrip(":")
	print ("PRIVATE PAYLOAD" + private_payload)
	private_payload_utf = private_payload.encode()
	dig = hmac.new(key, msg=private_payload_utf, digestmod=hashlib.sha256).digest()
	intsig = base64.urlsafe_b64encode(dig).decode()
	jwt_payload['intsig'] = intsig
	
	
	
	
	
	### Convert string above to structure
	#jwt_json=json.loads(jwt_payload)
	
	### Encode token
	encoded_jwt = jwt.encode(jwt_payload, key, algorithm="HS256",headers={"kid": "230498151c214b788dd97f22b85410a5"},)
	new_url = myScheme + "://" + myDomain + "/" + encoded_jwt + myPath
	
	return(new_url)
