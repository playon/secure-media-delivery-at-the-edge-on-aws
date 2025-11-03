/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazonaws.solutions.securemediadelivery;

/**
 * Represents a cryptographic key with UUID and value
 */
public class SecretKey {
    private final String uuid;
    private final String value;
    
    /**
     * Creates a new SecretKey
     * 
     * @param uuid Unique identifier for the key
     * @param value The secret key value
     */
    public SecretKey(String uuid, String value) {
        this.uuid = uuid;
        this.value = value;
    }
    
    /**
     * @return The key UUID
     */
    public String getUuid() {
        return uuid;
    }
    
    /**
     * @return The key value
     */
    public String getValue() {
        return value;
    }
    
    @Override
    public String toString() {
        return "SecretKey{uuid='" + uuid + "', value='[REDACTED]'}";
    }
}
