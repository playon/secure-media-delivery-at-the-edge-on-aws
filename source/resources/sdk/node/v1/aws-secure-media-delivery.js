const aws = require('aws-sdk');
const b64url = require('base64url');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let DEBUG = false;

function setDEBUG(val){
    DEBUG = val
}

function logger(message){
    if(DEBUG) console.log("[DEBUG] " + message);
}

function validateIPv4(address){
    //validate if input address matches with IPv4 regex pattern, with single regex statement
    let ipv4_regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4_regex.test(address);
}

function validateIPv6(address){
    //validate if input address matches with expected IPv6 format. 
    let ipv6_parts_regex = /^([0-9a-fA-F]{1,4}:){0,7}[0-9a-fA-F]{1,4}$/;
    //Input is splitt into two parts assuming two-colon separator can exist then each side of the address is validated against regex
    address_parts = address.split('::');
    if(address_parts.length>2) return false; //only a single two-colon seperator is allowed
    let parts_groups_sum = 0;
    for (part of address_parts){
        let part_groups = part.split(':');
        parts_groups_sum += part_groups.length;
        if(part_groups.length == 1 && part_groups[0] == ''){
            //skip when address starts or ends with two-colon
            continue;
        } else {
            if(!ipv6_parts_regex.test(part)) return false;
        }

    }
    //checking if number of groups does not equal expected value
    if(parts_groups_sum > 8) return false;
    if(address_parts.length == 1 && parts_groups_sum != 8) return false;
    return true;
}

function expandIPv6(address){
    let hextets_abbrev = address.split(':');
    if (hextets_abbrev.slice(-1) == '') {
        hextets_abbrev.pop();  //when prefix ends with :: this creates two empty elements in an array
    }
    if (hextets_abbrev[0] == '') {
        hextets_abbrev.shift();  //when prefix starts with :: this creates two empty elements in an array
    }
    //add leading zeros in extets and expand two-collon (::) notation
    hextets = hextets_abbrev.map(item => { return(item.length ? Array(5-item.length).join('0')+item : '')});
    if(hextets.indexOf('')>-1) {
        hextets.splice.apply(hextets,[hextets.indexOf(''),1].concat(Array(9-hextets.length).fill('0000')));
    }
    return hextets.join(':');
}

class TokenProvider{
    static _secrets = {};
    static _secrets_prefix = '';
    static _secrets_last_update = null;
    static _secrets_retrieve_mode = 'native';
    static _secrets_retrieve_function = null;
    static _secrets_manager_client = null;
    static _secrets_retrival_lock = false;

         
    static _getSecretfromSM(sm_client, secret_name){
        let sm_promise = sm_client.getSecretValue({SecretId: secret_name}).promise();
        return sm_promise;
    }
        
    constructor(key_expiry_period){
        this.key_expiry = key_expiry_period;
    }

    static _getSecretKV(smResponse){
        //returns key value object from either string or binary format of the secret
		let secret = null;
        if ('SecretString' in smResponse) {
            secret = smResponse.SecretString;
        } else {
            let buff = Buffer.from(smResponse.SecretBinary, 'base64');
            secret = buff.toString();
        }
        return JSON.parse(secret);
    }

    static async retrieveSecrets(){
        this._secrets_retrival_lock = true;
        if(this._secrets_retrieve_mode == 'native'){
            try{
                let primarySecret = await this._getSecretfromSM(this._secrets_manager_client,`${this._secrets_prefix}_PrimarySecret`); 
                let secondarySecret = await this._getSecretfromSM(this._secrets_manager_client,`${this._secrets_prefix}_SecondarySecret`);
                let primarySecret_json = this._getSecretKV(primarySecret);
                let secondarySecret_json = this._getSecretKV(secondarySecret);
                this._secrets = {
                    'primary': {
                        'uuid': Object.keys(primarySecret_json)[0],
                        'value': Object.values(primarySecret_json)[0]
                    },
                    'secondary': {
                        'uuid': Object.keys(secondarySecret_json)[0],
                        'value': Object.values(secondarySecret_json)[0]
                    }
                };
                this._secrets_last_update = Math.floor(Date.now()/1000);
                logger("Secrets updated! Last update: " + this._secrets_last_update.toString());
            } catch (e) {
                logger("Couldn't process the secret from SecretsManager");
            } finally {
                this._secrets_retrival_lock = false;
            }
        }
        else if(this._secrets_retrieve_mode == 'custom'){
            try{
                this._secrets = await this._secrets_retrieve_function();
                this._secrets_last_update = Math.floor(Date.now()/1000);
                logger("Secrets updated! Last update: " + this._secrets_last_update.toString());
            } catch (e) {
                logger("Couldn't process the secret from SecretsManager");
            } finally {
                this._secrets_retrival_lock = false;
            }
            
        }
        
    }
    
    
    static SecretsConfigure(kwarg){
        if(kwarg['secrets_prefix']) this._secrets_prefix = kwarg['secrets_prefix'];
        if(kwarg['secrets_retrieve_mode']) this._secrets_retrieve_mode = kwarg['secrets_retrieve_mode'];
        if(kwarg['secrets_retrieve_function']) this._secrets_retrieve_function = kwarg['secrets_retrieve_function'];
        if(kwarg['secrets_manager_client']) this._secrets_manager_client = kwarg['secrets_manager_client'];
    }
    
    _get_random_alphanumeric_string(output_length){
        const chars = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890";
        let result_str = Array.from({length: output_length}, ()=>chars.charAt(Math.floor(Math.random()*chars.length))).join('');
        return result_str;
    }

    _sign(input, key, method){
        return b64url(crypto.createHmac(method, key).update(input).digest());
    }
    
    async generateToken(attributes, secret_alias, playback_url){
        if (!TokenProvider._secrets[secret_alias] && !TokenProvider._secrets_retrival_lock){
            console.log("Initializing secrets object");
            await TokenProvider.retrieveSecrets();
            console.log('Done');
        } 
        else if(!TokenProvider._secrets_last_update){
            throw "Missing last update timestamp";
        }
        else if((Math.floor(Date.now()/1000)-TokenProvider._secrets_last_update > this.key_expiry) && !TokenProvider._secrets_retrival_lock) {
            console.log("Expiry time elapsed - updating secrets object");
            TokenProvider.retrieveSecrets();
        } 
        else console.log('Time left: ', Math.floor(Date.now()/1000)-TokenProvider._secrets_last_update);

        let jwt_payload = {
            ip: false,
            co: false,
            cty: false,
            ssn: false,
            nbf: '',
            exp: '',
            headers: [],
            qs: [],
            intsig: '',
            paths: [],
            exc: []
        };

        let intsig_input = '';

        if (attributes['ip']) {
            let fullIP;
            if(attributes['ip'].includes('.') && validateIPv4(attributes['ip'])){
                jwt_payload['ip_ver']=4;
                fullIP = attributes['ip'];
            } else if(validateIPv6(attributes['ip'])){
                jwt_payload['ip_ver']=6;
                fullIP = expandIPv6(attributes['ip']);
            } else {
                throw "Invalid viewer's IP format";
            }
            jwt_payload['ip']=true;
            intsig_input += fullIP + ':';
        };
        if (attributes['co']){
            jwt_payload['co']=true;
            intsig_input += attributes['co'] + ':';
        };

        if (attributes['cty']){
            jwt_payload['cty']=true;
            intsig_input += attributes['cty'] + ':';
        }; 

        if (attributes['ssn']){
            jwt_payload['ssn']=true;
            if (attributes['ssn'].startsWith('generate_')) {
                let session_len = attributes['ssn'].split('_').pop();
                this.payloadSsn = this._get_random_alphanumeric_string(session_len);
            } else {
                this.payloadSsn = attributes['ssn'];
            };
            intsig_input += this.payloadSsn + ':';
        };
         
        if (attributes['headers'] && attributes['headers'].length){
            attributes['headers'].forEach((header)=>{
                jwt_payload['headers'].push(header.key);
                intsig_input += header.value + ':';
            });
        };

        if (attributes['qs']){
            attributes['qs'].forEach((qs_param)=>{
                jwt_payload['qs'].push(qs_param.key);
                intsig_input += qs_param.value + ':';
            });
        };

		if(intsig_input){
			intsig_input = intsig_input.slice(0,-1);
			console.log("Input for internal signature: ", intsig_input); 
			jwt_payload['intsig'] = this._sign(intsig_input, TokenProvider._secrets[secret_alias].value, 'sha256')
        } else {
			delete jwt_payload['intsig'];
		};

        jwt_payload['paths'] = attributes['paths'];
        if (attributes['exc']) jwt_payload['exc'] = attributes['exc'];

        if (attributes['nbf']) jwt_payload['nbf'] = parseInt(attributes['nbf']);
        jwt_payload['exp'] = parseInt(attributes['exp']);

        this.encoded_jwt = jwt.sign( jwt_payload, TokenProvider._secrets[secret_alias].value, {algorithm: 'HS256', keyid: TokenProvider._secrets[secret_alias].uuid});

        if(playback_url){
            let playback_url_array = playback_url.split('/');
            playback_url_array.splice(3,0,`${this.payloadSsn?this.payloadSsn+'.':''}${this.encoded_jwt}`);
            this.output_playback_url = playback_url_array.join('/');
            return this.output_playback_url;
        } else{
            return `${this.payloadSsn?this.payloadSsn+'.':''}${this.encoded_jwt}`;
        }
    }

}

exports.TokenProvider = TokenProvider;
exports.setDEBUG = setDEBUG;