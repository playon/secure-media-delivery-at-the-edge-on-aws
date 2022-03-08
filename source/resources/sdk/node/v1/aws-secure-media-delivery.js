const aws = require('aws-sdk');
const b64url = require('base64url');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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

    static async retrieveSecrets(){
        this._secrets_retrival_lock = true;
        if(this._secrets_retrieve_mode == 'native'){
            let primarySecret = await this._getSecretfromSM(this._secrets_manager_client,`${this._secrets_prefix}_PrimarySecret`); 
            let secondarySecret = await this._getSecretfromSM(this._secrets_manager_client,`${this._secrets_prefix}_SecondarySecret`);   
            //TODO - add suport for binary secret
            let primarySecret_json = JSON.parse(primarySecret['SecretString']);
            let secondarySecret_json = JSON.parse(secondarySecret['SecretString']);
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
            //console.log(this._secrets);
            console.log("Secrets updated! Last update: ", this._secrets_last_update);
            //TODO - promise error handling
        }
        else if(this.secret_retrive_mode == 'custom'){
            this._secrets = this._secrets_retrieve_function();
        }
        this._secrets_retrival_lock = false;
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
            jwt_payload['ip']=true;
            intsig_input += attributes['ip'] + ':';
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
         
        if (attributes['headers']){
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

        if(intsig_input) intsig_input = intsig_input.slice(0,-1);
        console.log("Input for internal signature: ", intsig_input); 
        console.log(TokenProvider._secrets);

        jwt_payload['intsig'] = this._sign(intsig_input, TokenProvider._secrets[secret_alias].value, 'sha256');

        jwt_payload['paths'] = attributes['paths'];
        if (attributes['exc']) jwt_payload['exc'] = attributes['exc'];

        if (attributes['nbf']) jwt_payload['nbf'] = parseInt(attributes['nbf']);
        jwt_payload['exp'] = parseInt(attributes['exp']);

        this.encoded_jwt = jwt.sign( jwt_payload, TokenProvider._secrets[secret_alias].value, {algorithm: 'HS256', keyid: TokenProvider._secrets[secret_alias].uuid});

        if(playback_url){
            let playback_url_array = playback_url.split('/');
            playback_url_array.splice(3,0,`${this.payloadSsn?this.payloadSsn+'.':''}${this.encoded_jwt}`);
            this.output_playback_url = playback_url_array.join('/');
            //console.log('output ',this.output_playback_url);
            return this.output_playback_url;
        } else{
            return this.encoded_jwt;
        }
    }

}

module.exports = TokenProvider;