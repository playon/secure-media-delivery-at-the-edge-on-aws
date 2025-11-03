/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazonaws.solutions.securemediadelivery;

/**
 * Represents the primary and secondary cryptographic keys
 */
public class SecretKeys {
    private final SecretKey primary;
    private final SecretKey secondary;
    
    /**
     * Creates a new SecretKeys instance
     * 
     * @param primary Primary secret key
     * @param secondary Secondary secret key (can be null)
     */
    public SecretKeys(SecretKey primary, SecretKey secondary) {
        this.primary = primary;
        this.secondary = secondary;
    }
    
    /**
     * @return The primary secret key
     */
    public SecretKey getPrimary() {
        return primary;
    }
    
    /**
     * @return The secondary secret key (may be null)
     */
    public SecretKey getSecondary() {
        return secondary;
    }
    
    /**
     * Get a key by alias
     * 
     * @param alias "primary" or "secondary"
     * @return The requested key, or null if not found
     */
    public SecretKey getByAlias(String alias) {
        switch (alias.toLowerCase()) {
            case "primary":
                return primary;
            case "secondary":
                return secondary;
            default:
                return null;
        }
    }
    
    @Override
    public String toString() {
        return "SecretKeys{" +
                "primary=" + primary +
                ", secondary=" + secondary +
                '}';
    }
}
