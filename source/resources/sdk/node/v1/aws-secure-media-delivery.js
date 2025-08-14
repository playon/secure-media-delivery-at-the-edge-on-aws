// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Optimized AWS Secure Media Delivery Node.js SDK
 * 
 * This is an optimized version of the original SDK with improvements for:
 * - Performance and memory efficiency
 * - Error handling and resilience
 * - Code maintainability and best practices
 * - Security and validation
 */

const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { SecretsManager } = require("@aws-sdk/client-secrets-manager");
const { fromIni, fromTemporaryCredentials } = require("@aws-sdk/credential-providers");
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { URL } = require('url');
const { isIPv4, isIPv6 } = require('net');

// Constants for better maintainability
const CONSTANTS = {
    DEFAULT_REGION: 'us-east-1',
    DEFAULT_SESSION_LENGTH: 12,
    MIN_SESSION_LENGTH: 7,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    JWT_ALGORITHM: 'HS256',
    HASH_ALGORITHM: 'sha256'
};

// Utility functions
const utils = {
    /**
     * Optimized logging function with proper context binding
     */
    createLogger: (context) => (message) => {
        if (context._debug) {
            console.log(`[DEBUG] ${context.constructor.name}: ${message}`);
        }
    },

    /**
     * Improved IPv6 expansion with better error handling
     */
    expandIPv6: (address) => {
        try {
            // Use Node.js built-in validation first
            if (!isIPv6(address)) {
                throw new Error(`Invalid IPv6 address: ${address}`);
            }

            const parts = address.split(':');
            const expandedParts = [];
            let doubleColonIndex = -1;

            // Find double colon position
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === '' && doubleColonIndex === -1) {
                    doubleColonIndex = i;
                } else if (parts[i] !== '') {
                    expandedParts.push(parts[i].padStart(4, '0'));
                }
            }

            // Handle double colon expansion
            if (doubleColonIndex !== -1) {
                const missingParts = 8 - expandedParts.length;
                const beforeDoubleColon = expandedParts.slice(0, doubleColonIndex);
                const afterDoubleColon = expandedParts.slice(doubleColonIndex);
                
                return [
                    ...beforeDoubleColon,
                    ...Array(missingParts).fill('0000'),
                    ...afterDoubleColon
                ].join(':');
            }

            return expandedParts.join(':');
        } catch (error) {
            throw new Error(`IPv6 expansion failed: ${error.message}`);
        }
    },

    /**
     * Improved credentials and region resolution
     */
    getCredentialsAndRegion: (params = {}) => {
        const config = {};

        // Credentials resolution with validation
        if (params.profile) {
            if (typeof params.profile !== 'string') {
                throw new Error('Profile must be a string');
            }
            config.credentials = fromIni({ profile: params.profile });
        } else if (params.role) {
            if (typeof params.role !== 'string') {
                throw new Error('Role ARN must be a string');
            }
            config.credentials = fromTemporaryCredentials({
                params: {
                    RoleArn: params.role,
                    RoleSessionName: `SecureMediaDelivery-SDK-${Date.now()}`,
                },
            });
        }

        // Region resolution with fallback
        config.region = params.region || process.env.AWS_REGION || CONSTANTS.DEFAULT_REGION;

        return config;
    },

    /**
     * Retry mechanism for AWS API calls
     */
    retryOperation: async (operation, maxRetries = CONSTANTS.MAX_RETRY_ATTEMPTS) => {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain error types
                if (error.name === 'ValidationException' || 
                    error.name === 'AccessDeniedException' ||
                    attempt === maxRetries) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = CONSTANTS.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    },

    /**
     * Input validation helpers
     */
    validateRequired: (value, name) => {
        if (value === null || value === undefined || value === '') {
            throw new Error(`${name} is required`);
        }
    },

    validateString: (value, name) => {
        if (typeof value !== 'string') {
            throw new Error(`${name} must be a string`);
        }
    },

    validateNumber: (value, name) => {
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error(`${name} must be a valid number`);
        }
    }
};

/**
 * Optimized Secret class with improved error handling and performance
 */
class Secret {
    static _debug = false;

    constructor(stackName, ttl, retrieveMode = 'native', retrieveFunction = null, retrieveFunctionArgs = []) {
        // Input validation
        utils.validateRequired(stackName, 'stackName');
        utils.validateString(stackName, 'stackName');
        utils.validateRequired(ttl, 'ttl');
        utils.validateNumber(ttl, 'ttl');

        if (ttl <= 0) {
            throw new Error('TTL must be greater than 0');
        }

        this.stackName = stackName;
        this.ttl = ttl;
        this.retrieveMode = retrieveMode;
        this.retrieveFunction = retrieveFunction;
        this.retrieveFunctionArgs = retrieveFunctionArgs || [];
        
        // Private properties
        this._keys = null;
        this._lastUpdated = null;
        this._lock = false;
        this._smClient = null;
        this._logger = utils.createLogger(this);

        // Validate custom retrieval setup
        if (retrieveMode === 'custom' && typeof retrieveFunction !== 'function') {
            throw new Error('retrieveFunction must be a function when retrieveMode is custom');
        }
    }

    static setDEBUG(val = true) {
        if (typeof val === 'boolean') {
            this._debug = val;
        }
    }

    /**
     * Initialize Secrets Manager client with improved error handling
     */
    initSMClient(params = {}) {
        try {
            const config = utils.getCredentialsAndRegion(params);
            this._smClient = new SecretsManager(config);
            this._logger('SecretsManager client initialized successfully');
            return true;
        } catch (error) {
            this._logger(`Failed to create SecretsManager client: ${error.message}`);
            return false;
        }
    }

    /**
     * Optimized secret retrieval with proper error handling and retries
     */
    async _getSMSecret() {
        const secretNamePrimary = `${this.stackName}_PrimarySecret`;
        const secretNameSecondary = `${this.stackName}_SecondarySecret`;

        try {
            // Use retry mechanism for AWS API calls
            const [primaryResponse, secondaryResponse] = await Promise.all([
                utils.retryOperation(() => this._smClient.getSecretValue({ SecretId: secretNamePrimary })),
                utils.retryOperation(() => this._smClient.getSecretValue({ SecretId: secretNameSecondary }))
            ]);

            const primarySecret = this._parseSecretValue(primaryResponse);
            const secondarySecret = this._parseSecretValue(secondaryResponse);

            return {
                primary: {
                    uuid: Object.keys(primarySecret)[0],
                    value: Object.values(primarySecret)[0]
                },
                secondary: {
                    uuid: Object.keys(secondarySecret)[0],
                    value: Object.values(secondarySecret)[0]
                }
            };
        } catch (error) {
            throw new Error(`Failed to retrieve secrets: ${error.message}`);
        }
    }

    /**
     * Improved secret value parsing with better error handling
     */
    _parseSecretValue(response) {
        try {
            let secretString;
            
            if (response.SecretString) {
                secretString = response.SecretString;
            } else if (response.SecretBinary) {
                secretString = Buffer.from(response.SecretBinary, 'base64').toString('utf-8');
            } else {
                throw new Error('No secret string or binary found in response');
            }

            const parsed = JSON.parse(secretString);
            
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Secret must be a valid JSON object');
            }

            return parsed;
        } catch (error) {
            throw new Error(`Failed to parse secret value: ${error.message}`);
        }
    }

    /**
     * Fixed key access methods (original had bugs)
     */
    getKeyValue(keyAlias) {
        if (!this._keys || !this._keys[keyAlias]) {
            throw new Error(`Key '${keyAlias}' not found`);
        }
        return this._keys[keyAlias].value;
    }

    getKeyUUID(keyAlias) {
        if (!this._keys || !this._keys[keyAlias]) {
            throw new Error(`Key '${keyAlias}' not found`);
        }
        return this._keys[keyAlias].uuid;
    }

    /**
     * Improved expiration check with better time handling
     */
    _checkIfExpired() {
        if (!this._lastUpdated) {
            this._logger('Keys have not been set yet');
            return null;
        }
        
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - this._lastUpdated;
        return elapsed > this.ttl;
    }

    /**
     * Optimized key retrieval with proper concurrency control
     */
    async retrieveKeys(keyAlias = 'all') {
        const isExpired = this._checkIfExpired();
        
        // Return cached keys if valid and not locked
        if (this._lastUpdated && !isExpired && !this._lock) {
            return this._filterKeys(keyAlias);
        }

        // Prevent concurrent retrievals
        if (this._lock) {
            // Wait for ongoing retrieval with timeout
            const timeout = 30000; // 30 seconds
            const start = Date.now();
            
            while (this._lock && (Date.now() - start) < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (this._lock) {
                throw new Error('Key retrieval timeout - concurrent operation took too long');
            }
            
            return this._filterKeys(keyAlias);
        }

        this._logger('Starting key retrieval');
        this._lock = true;

        try {
            let keys;
            
            if (this.retrieveMode === 'native') {
                if (!this._smClient) {
                    throw new Error('SecretsManager client not initialized. Call initSMClient() first.');
                }
                keys = await this._getSMSecret();
            } else if (this.retrieveMode === 'custom') {
                keys = await this.retrieveFunction(...this.retrieveFunctionArgs);
            } else {
                throw new Error(`Invalid retrieve mode: ${this.retrieveMode}`);
            }

            // Validate retrieved keys
            this._validateKeys(keys);
            
            this._keys = keys;
            this._lastUpdated = Math.floor(Date.now() / 1000);
            
            this._logger('Keys retrieved and cached successfully');
            return this._filterKeys(keyAlias);
            
        } catch (error) {
            this._logger(`Key retrieval failed: ${error.message}`);
            throw error;
        } finally {
            this._lock = false;
        }
    }

    /**
     * Improved key filtering with validation
     */
    _filterKeys(keyAlias) {
        if (!this._keys) {
            throw new Error('No keys available');
        }

        switch (keyAlias) {
            case 'all':
                return { ...this._keys }; // Return copy to prevent mutation
            case 'primary':
                return this._keys.primary ? { ...this._keys.primary } : null;
            case 'secondary':
                return this._keys.secondary ? { ...this._keys.secondary } : null;
            default:
                throw new Error(`Invalid key alias: ${keyAlias}`);
        }
    }

    /**
     * Enhanced key validation
     */
    _validateKeys(keys) {
        if (!keys || typeof keys !== 'object') {
            throw new Error('Keys must be an object');
        }

        if (!keys.primary || typeof keys.primary !== 'object') {
            throw new Error('Primary key is required and must be an object');
        }

        this._validateKeyStructure(keys.primary, 'primary');
        
        if (keys.secondary) {
            this._validateKeyStructure(keys.secondary, 'secondary');
        }
    }

    _validateKeyStructure(key, keyName) {
        if (!key.uuid || typeof key.uuid !== 'string') {
            throw new Error(`${keyName} key must have a valid UUID string`);
        }
        
        if (!key.value || typeof key.value !== 'string') {
            throw new Error(`${keyName} key must have a valid value string`);
        }
    }

    /**
     * Static validation method (improved from original)
     */
    static validateKeys(obj) {
        try {
            const instance = new Secret('temp', 300);
            instance._validateKeys(obj);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Optimized Session class with better random generation and error handling
 */
class Session {
    static _debug = false;
    static _ddbClient = null;
    static revocationTable = '';

    constructor(id = null, autogenerate = false, suspicionScore = 0) {
        utils.validateNumber(suspicionScore, 'suspicionScore');
        
        if (suspicionScore < 0 || suspicionScore > 100) {
            throw new Error('Suspicion score must be between 0 and 100');
        }

        this.suspicionScore = suspicionScore;
        this._logger = utils.createLogger(this);

        // Improved ID generation logic
        if (id && autogenerate) {
            const sessionLength = parseInt(id, 10);
            if (isNaN(sessionLength) || sessionLength < CONSTANTS.MIN_SESSION_LENGTH) {
                throw new Error(`Invalid session length. Must be >= ${CONSTANTS.MIN_SESSION_LENGTH}`);
            }
            this.id = this._generateSecureId(sessionLength);
        } else if (id) {
            utils.validateString(id, 'session ID');
            this.id = id;
        } else {
            this.id = this._generateSecureId(CONSTANTS.DEFAULT_SESSION_LENGTH);
        }
    }

    static setDEBUG(val = true) {
        if (typeof val === 'boolean') {
            this._debug = val;
        }
    }

    static initialize(tableName, params = {}) {
        utils.validateRequired(tableName, 'tableName');
        utils.validateString(tableName, 'tableName');
        
        this.revocationTable = tableName;
        return this.initDBClient(params);
    }

    static initDBClient(params = {}) {
        try {
            const config = utils.getCredentialsAndRegion(params);
            this._ddbClient = new DynamoDB(config);
            return true;
        } catch (error) {
            console.error(`Failed to create DynamoDB client: ${error.message}`);
            return false;
        }
    }

    /**
     * Cryptographically secure ID generation
     */
    _generateSecureId(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const randomBytes = crypto.randomBytes(length);
        
        return Array.from(randomBytes, byte => chars[byte % chars.length]).join('');
    }

    /**
     * Improved session revocation with better error handling
     */
    async revoke(expiryPeriod = 86400, reason = 'COMPROMISED') {
        if (!Session._ddbClient) {
            throw new Error("DynamoDB client hasn't been initialized. Call Session.initialize() first.");
        }
        
        if (!Session.revocationTable) {
            throw new Error('Revocation table name must be set');
        }

        utils.validateNumber(expiryPeriod, 'expiryPeriod');
        utils.validateString(reason, 'reason');

        if (expiryPeriod <= 0) {
            throw new Error('Expiry period must be greater than 0');
        }

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const expiryTime = currentTimestamp + expiryPeriod;

        const item = {
            session_id: { S: this.id },
            type: { S: 'MANUAL' },
            score: { N: this.suspicionScore.toString() },
            reason: { S: reason },
            last_updated: { N: currentTimestamp.toString() },
            ttl: { N: expiryTime.toString() }
        };

        try {
            await utils.retryOperation(() => 
                Session._ddbClient.putItem({
                    TableName: Session.revocationTable,
                    Item: item
                })
            );
            
            this._logger(`Session ${this.id} revoked successfully`);
            return true;
        } catch (error) {
            this._logger(`Failed to revoke session ${this.id}: ${error.message}`);
            throw new Error(`Session revocation failed: ${error.message}`);
        }
    }

    /**
     * Static method for generating secure IDs
     */
    static _autoGenerate(outputLength) {
        const instance = new Session();
        return instance._generateSecureId(outputLength);
    }
}

/**
 * Optimized Token class with improved validation and performance
 */
class Token {
    static _debug = false;

    constructor(secret, defaultTokenPolicy = null) {
        if (!(secret instanceof Secret)) {
            throw new Error('secret must be an instance of Secret class');
        }

        this.secret = secret;
        this.defaultTokenPolicy = defaultTokenPolicy;
        this._logger = utils.createLogger(this);
        
        // Initialize properties
        this.encodedJwt = null;
        this.outputPlaybackUrl = null;
        this.payloadSsn = null;
    }

    static setDEBUG(val = true) {
        if (typeof val === 'boolean') {
            this._debug = val;
        }
    }

    /**
     * Optimized token generation with better validation and error handling
     */
    async generate(viewerAttributes, playbackUrl = null, tokenPolicy = null, secretAlias = 'primary') {
        // Input validation
        if (!viewerAttributes || typeof viewerAttributes !== 'object') {
            throw new Error('viewerAttributes must be an object');
        }

        const policy = tokenPolicy || this.defaultTokenPolicy;
        if (!policy) {
            throw new Error('No token policy provided and no default policy set');
        }

        // Validate secret alias
        if (!['primary', 'secondary'].includes(secretAlias)) {
            throw new Error('secretAlias must be either "primary" or "secondary"');
        }

        try {
            // Retrieve keys
            const keys = await this.secret.retrieveKeys('all');
            const secretKey = keys[secretAlias];
            
            if (!secretKey) {
                throw new Error(`Secret key '${secretAlias}' not found`);
            }

            // Parse playback URL if provided
            let playbackUrlQs = {};
            if (playbackUrl) {
                try {
                    const url = new URL(playbackUrl);
                    playbackUrlQs = Object.fromEntries(url.searchParams);
                } catch (error) {
                    throw new Error(`Invalid playback URL: ${error.message}`);
                }
            }

            // Build JWT payload
            const jwtPayload = this._buildJwtPayload(policy, viewerAttributes, playbackUrlQs, secretKey);

            // Generate JWT with improved error handling
            this.encodedJwt = jwt.sign(jwtPayload, secretKey.value, {
                algorithm: CONSTANTS.JWT_ALGORITHM,
                keyid: secretKey.uuid
            });

            // Handle URL modification or return token
            if (playbackUrl) {
                this.outputPlaybackUrl = this._insertTokenIntoUrl(playbackUrl, this.encodedJwt, this.payloadSsn);
                return this.outputPlaybackUrl;
            }

            return this.payloadSsn ? `${this.payloadSsn}.${this.encodedJwt}` : this.encodedJwt;

        } catch (error) {
            this._logger(`Token generation failed: ${error.message}`);
            throw new Error(`Token generation failed: ${error.message}`);
        }
    }

    /**
     * Improved JWT payload building with better validation
     */
    _buildJwtPayload(tokenPolicy, viewerAttributes, playbackUrlQs, secretKey) {
        const payload = {
            ip: false,
            co: false,
            cty: false,
            reg: false,
            ssn: false,
            exp: '',
            headers: [],
            qs: [],
            intsig: '',
            paths: [],
            exc: []
        };

        let intsigInput = '';

        // IP validation with improved error handling
        if (tokenPolicy.ip) {
            const ipResult = this._processIp(viewerAttributes.ip);
            Object.assign(payload, ipResult.payload);
            intsigInput += `${ipResult.fullIp}:`;
        }

        // Geolocation processing
        intsigInput += this._processGeolocation(tokenPolicy, viewerAttributes, payload);

        // Session processing
        if (tokenPolicy.ssn) {
            payload.ssn = true;
            this.payloadSsn = viewerAttributes.sessionId || 
                Session._autoGenerate(tokenPolicy.session_auto_generate || CONSTANTS.DEFAULT_SESSION_LENGTH);
            intsigInput += `${this.payloadSsn}:`;
        }

        // Headers and query strings
        intsigInput += this._processHeadersAndQs(tokenPolicy, viewerAttributes, playbackUrlQs, payload);

        // Internal signature
        if (intsigInput) {
            const cleanInput = intsigInput.slice(0, -1); // Remove trailing colon
            this._logger(`Input for internal signature: ${cleanInput}`);
            payload.intsig = this._createSignature(cleanInput, secretKey.value);
        } else {
            delete payload.intsig;
        }

        // Paths and exclusions
        payload.paths = tokenPolicy.paths || [];
        if (tokenPolicy.exc) payload.exc = tokenPolicy.exc;

        // Expiration and not-before
        payload.exp = this._processExpiration(tokenPolicy.exp);
        if (tokenPolicy.nbf) payload.nbf = parseInt(tokenPolicy.nbf, 10);

        return payload;
    }

    /**
     * Improved IP processing with better validation
     */
    _processIp(ip) {
        if (!ip || typeof ip !== 'string') {
            throw new Error('IP address is required and must be a string');
        }

        let ipVersion, fullIp;

        if (isIPv4(ip)) {
            ipVersion = 4;
            fullIp = ip;
        } else if (isIPv6(ip)) {
            ipVersion = 6;
            fullIp = utils.expandIPv6(ip);
        } else {
            throw new Error(`Invalid IP address format: ${ip}`);
        }

        return {
            payload: { ip: true, ip_ver: ipVersion },
            fullIp
        };
    }

    /**
     * Process geolocation attributes
     */
    _processGeolocation(tokenPolicy, viewerAttributes, payload) {
        let input = '';

        if (tokenPolicy.co) {
            payload.co = true;
            if (viewerAttributes.co) input += `${viewerAttributes.co}:`;
            if (tokenPolicy.co_fallback) payload.co_fallback = true;
        }

        if (tokenPolicy.cty) {
            payload.cty = true;
            if (viewerAttributes.cty) input += `${viewerAttributes.cty}:`;
        }

        if (tokenPolicy.reg) {
            payload.reg = true;
            if (viewerAttributes.reg) input += `${viewerAttributes.reg}:`;
            if (tokenPolicy.reg_fallback) payload.reg_fallback = true;
        }

        return input;
    }

    /**
     * Process headers and query strings
     */
    _processHeadersAndQs(tokenPolicy, viewerAttributes, playbackUrlQs, payload) {
        let input = '';

        // Headers
        if (tokenPolicy.headers && Array.isArray(tokenPolicy.headers)) {
            payload.headers = [...tokenPolicy.headers];
            tokenPolicy.headers.forEach(header => {
                const value = viewerAttributes.headers?.[header];
                if (value) input += `${value}:`;
            });
        }

        // Query strings
        if (tokenPolicy.querystrings && Array.isArray(tokenPolicy.querystrings)) {
            payload.qs = [...tokenPolicy.querystrings];
            tokenPolicy.querystrings.forEach(qs => {
                const value = playbackUrlQs[qs] || viewerAttributes.qs?.[qs];
                if (value) input += `${value}:`;
            });
        }

        return input;
    }

    /**
     * Improved expiration processing
     */
    _processExpiration(exp) {
        if (!exp) {
            throw new Error('Expiration (exp) is required');
        }

        if (typeof exp !== 'string') {
            throw new Error('Expiration must be a string');
        }

        const now = Math.floor(Date.now() / 1000);

        if (exp.startsWith('+')) {
            const match = exp.match(/^\+(\d+)([hm])$/);
            if (!match) {
                throw new Error('Invalid relative expiration format. Use +Nh or +Nm');
            }

            const [, value, unit] = match;
            const multiplier = unit === 'h' ? 3600 : 60;
            return now + (parseInt(value, 10) * multiplier);
        }

        const timestamp = parseInt(exp, 10);
        if (isNaN(timestamp) || timestamp <= 0) {
            throw new Error('Invalid absolute expiration timestamp');
        }

        return timestamp;
    }

    /**
     * Improved signature creation
     */
    _createSignature(input, key) {
        return crypto
            .createHmac(CONSTANTS.HASH_ALGORITHM, key)
            .update(input)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Improved URL token insertion
     */
    _insertTokenIntoUrl(playbackUrl, token, sessionId) {
        try {
            const url = new URL(playbackUrl);
            const pathParts = url.pathname.split('/');
            
            const tokenPart = sessionId ? `${sessionId}.${token}` : token;
            pathParts.splice(1, 0, tokenPart); // Insert after first slash
            
            url.pathname = pathParts.join('/');
            return url.toString();
        } catch (error) {
            throw new Error(`Failed to insert token into URL: ${error.message}`);
        }
    }
}

// Export classes
module.exports = {
    Secret,
    Token,
    Session,
    // Export utilities for testing
    utils: process.env.NODE_ENV === 'test' ? utils : undefined
};
