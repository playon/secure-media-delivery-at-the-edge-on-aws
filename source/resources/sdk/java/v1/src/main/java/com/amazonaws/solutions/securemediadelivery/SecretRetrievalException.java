/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazonaws.solutions.securemediadelivery;

/**
 * Exception thrown when secret retrieval fails
 */
public class SecretRetrievalException extends RuntimeException {
    
    /**
     * Creates a new SecretRetrievalException with the specified message
     * 
     * @param message The exception message
     */
    public SecretRetrievalException(String message) {
        super(message);
    }
    
    /**
     * Creates a new SecretRetrievalException with the specified message and cause
     * 
     * @param message The exception message
     * @param cause The underlying cause
     */
    public SecretRetrievalException(String message, Throwable cause) {
        super(message, cause);
    }
}
