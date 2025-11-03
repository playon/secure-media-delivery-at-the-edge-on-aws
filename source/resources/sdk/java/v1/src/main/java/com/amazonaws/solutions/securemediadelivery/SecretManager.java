/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazonaws.solutions.securemediadelivery;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.Function;

/**
 * Manages cryptographic secrets for token signing.
 * 
 * This class handles the retrieval and caching of secrets from AWS Secrets Manager
 * or custom sources for use in JWT token generation.
 */
public class SecretManager {
    private static final Logger logger = LoggerFactory.getLogger(SecretManager.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    
    private final String stackName;
    private final Duration ttl;
    private final RetrieveMode retrieveMode;
    private final Function<String, CompletableFuture<SecretKeys>> customRetriever;
    private final SecretsManagerClient secretsManagerClient;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    
    private SecretKeys keys;
    private Instant lastUpdated;
    private boolean debug = false;
    
    /**
     * Retrieval mode for secrets
     */
    public enum RetrieveMode {
        NATIVE, CUSTOM
    }
    
    /**
     * Creates a new SecretManager with native AWS Secrets Manager retrieval
     * 
     * @param stackName CloudFormation stack name
     * @param ttl Time-to-live for cached secrets
     */
    public SecretManager(String stackName, Duration ttl) {
        this(stackName, ttl, SecretsManagerClient.create(), RetrieveMode.NATIVE, null);
    }
    
    /**
     * Creates a new SecretManager with custom retrieval function
     * 
     * @param stackName CloudFormation stack name
     * @param ttl Time-to-live for cached secrets
     * @param customRetriever Custom function to retrieve secrets
     */
    public SecretManager(String stackName, Duration ttl, 
                        Function<String, CompletableFuture<SecretKeys>> customRetriever) {
        this(stackName, ttl, null, RetrieveMode.CUSTOM, customRetriever);
    }
    
    /**
     * Creates a new SecretManager with specified client and mode
     */
    private SecretManager(String stackName, Duration ttl, SecretsManagerClient client,
                         RetrieveMode mode, Function<String, CompletableFuture<SecretKeys>> customRetriever) {
        this.stackName = stackName;
        this.ttl = ttl;
        this.secretsManagerClient = client;
        this.retrieveMode = mode;
        this.customRetriever = customRetriever;
    }
    
    /**
     * Enable or disable debug logging
     * 
     * @param debug true to enable debug logging
     */
    public void setDebug(boolean debug) {
        this.debug = debug;
    }
    
    /**
     * Retrieve cryptographic keys with caching
     * 
     * @param keyAlias "all" for all keys, or specific alias ("primary"/"secondary")
     * @return CompletableFuture containing the requested keys
     */
    public CompletableFuture<SecretKeys> retrieveKeys(String keyAlias) {
        // Check cache with read lock
        lock.readLock().lock();
        try {
            if (keys != null && lastUpdated != null && 
                Duration.between(lastUpdated, Instant.now()).compareTo(ttl) < 0) {
                return CompletableFuture.completedFuture(filterKeys(keys, keyAlias));
            }
        } finally {
            lock.readLock().unlock();
        }
        
        // Need to refresh - acquire write lock
        return CompletableFuture.supplyAsync(() -> {
            lock.writeLock().lock();
            try {
                // Double-check pattern
                if (keys != null && lastUpdated != null && 
                    Duration.between(lastUpdated, Instant.now()).compareTo(ttl) < 0) {
                    return filterKeys(keys, keyAlias);
                }
                
                debugLog("Starting key retrieval");
                
                SecretKeys retrievedKeys;
                switch (retrieveMode) {
                    case NATIVE:
                        retrievedKeys = retrieveFromSecretsManager();
                        break;
                    case CUSTOM:
                        retrievedKeys = customRetriever.apply(stackName).join();
                        break;
                    default:
                        throw new SecretRetrievalException("Invalid retrieve mode: " + retrieveMode);
                }
                
                validateKeys(retrievedKeys);
                
                this.keys = retrievedKeys;
                this.lastUpdated = Instant.now();
                
                return filterKeys(retrievedKeys, keyAlias);
                
            } catch (Exception e) {
                throw new SecretRetrievalException("Failed to retrieve keys", e);
            } finally {
                lock.writeLock().unlock();
            }
        });
    }
    
    /**
     * Retrieve secrets from AWS Secrets Manager
     */
    private SecretKeys retrieveFromSecretsManager() {
        String primarySecretName = stackName + "_PrimarySecret";
        String secondarySecretName = stackName + "_SecondarySecret";
        
        try {
            // Retrieve both secrets
            GetSecretValueResponse primaryResponse = secretsManagerClient.getSecretValue(
                GetSecretValueRequest.builder().secretId(primarySecretName).build());
            GetSecretValueResponse secondaryResponse = secretsManagerClient.getSecretValue(
                GetSecretValueRequest.builder().secretId(secondarySecretName).build());
            
            // Parse secrets
            SecretKey primaryKey = parseSecretValue(primaryResponse.secretString());
            SecretKey secondaryKey = parseSecretValue(secondaryResponse.secretString());
            
            return new SecretKeys(primaryKey, secondaryKey);
            
        } catch (Exception e) {
            throw new SecretRetrievalException("Failed to retrieve secrets from Secrets Manager", e);
        }
    }
    
    /**
     * Parse a secret value JSON string
     */
    private SecretKey parseSecretValue(String secretString) throws Exception {
        Map<String, String> secretMap = objectMapper.readValue(secretString, 
            new TypeReference<Map<String, String>>() {});
        
        if (secretMap.isEmpty()) {
            throw new SecretRetrievalException("No key-value pairs found in secret");
        }
        
        // Get the first (and should be only) key-value pair
        Map.Entry<String, String> entry = secretMap.entrySet().iterator().next();
        return new SecretKey(entry.getKey(), entry.getValue());
    }
    
    /**
     * Validate the structure of retrieved keys
     */
    private void validateKeys(SecretKeys keys) {
        if (keys == null) {
            throw new SecretRetrievalException("Keys is null");
        }
        
        if (keys.getPrimary() == null) {
            throw new SecretRetrievalException("Primary key is null");
        }
        
        if (keys.getPrimary().getUuid() == null || keys.getPrimary().getUuid().isEmpty() ||
            keys.getPrimary().getValue() == null || keys.getPrimary().getValue().isEmpty()) {
            throw new SecretRetrievalException("Primary key UUID or value is empty");
        }
        
        if (keys.getSecondary() != null) {
            if (keys.getSecondary().getUuid() == null || keys.getSecondary().getUuid().isEmpty() ||
                keys.getSecondary().getValue() == null || keys.getSecondary().getValue().isEmpty()) {
                throw new SecretRetrievalException("Secondary key UUID or value is empty");
            }
        }
    }
    
    /**
     * Filter keys based on alias
     */
    private SecretKeys filterKeys(SecretKeys keys, String keyAlias) {
        switch (keyAlias.toLowerCase()) {
            case "primary":
                return new SecretKeys(keys.getPrimary(), null);
            case "secondary":
                return new SecretKeys(null, keys.getSecondary());
            default: // "all" or any other value
                return keys;
        }
    }
    
    /**
     * Log debug messages if debug mode is enabled
     */
    private void debugLog(String message) {
        if (debug) {
            logger.debug("[SecretManager] {}", message);
        }
    }
    
    /**
     * Close the SecretManager and release resources
     */
    public void close() {
        if (secretsManagerClient != null) {
            secretsManagerClient.close();
        }
    }
}
