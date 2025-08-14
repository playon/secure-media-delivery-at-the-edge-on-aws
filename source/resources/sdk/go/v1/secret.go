// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package smd

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

// SecretKey represents a cryptographic key with UUID and value
type SecretKey struct {
	UUID  string `json:"uuid"`
	Value string `json:"value"`
}

// SecretKeys represents the primary and secondary keys
type SecretKeys struct {
	Primary   *SecretKey `json:"primary"`
	Secondary *SecretKey `json:"secondary,omitempty"`
}

// SecretManager manages cryptographic secrets for token signing
type SecretManager struct {
	stackName      string
	ttl            time.Duration
	retrieveMode   string
	retrieveFunc   func(context.Context, string) (*SecretKeys, error)
	client         *secretsmanager.Client
	keys           *SecretKeys
	lastUpdated    time.Time
	mutex          sync.RWMutex
	debug          bool
}

// SecretManagerOption configures SecretManager
type SecretManagerOption func(*SecretManager)

// WithDebug enables debug logging
func WithDebug(debug bool) SecretManagerOption {
	return func(sm *SecretManager) {
		sm.debug = debug
	}
}

// WithCustomRetriever sets a custom secret retrieval function
func WithCustomRetriever(fn func(context.Context, string) (*SecretKeys, error)) SecretManagerOption {
	return func(sm *SecretManager) {
		sm.retrieveMode = "custom"
		sm.retrieveFunc = fn
	}
}

// NewSecretManager creates a new SecretManager instance
func NewSecretManager(stackName string, ttl time.Duration, opts ...SecretManagerOption) (*SecretManager, error) {
	sm := &SecretManager{
		stackName:    stackName,
		ttl:          ttl,
		retrieveMode: "native",
	}

	// Apply options
	for _, opt := range opts {
		opt(sm)
	}

	// Initialize AWS client for native mode
	if sm.retrieveMode == "native" {
		cfg, err := config.LoadDefaultConfig(context.Background())
		if err != nil {
			return nil, fmt.Errorf("failed to load AWS config: %w", err)
		}
		sm.client = secretsmanager.NewFromConfig(cfg)
	}

	return sm, nil
}

// RetrieveKeys retrieves cryptographic keys with caching
func (sm *SecretManager) RetrieveKeys(ctx context.Context, keyAlias string) (*SecretKeys, error) {
	sm.mutex.RLock()
	if sm.keys != nil && time.Since(sm.lastUpdated) < sm.ttl {
		keys := sm.keys
		sm.mutex.RUnlock()
		return sm.filterKeys(keys, keyAlias), nil
	}
	sm.mutex.RUnlock()

	// Acquire write lock for update
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	// Double-check pattern
	if sm.keys != nil && time.Since(sm.lastUpdated) < sm.ttl {
		return sm.filterKeys(sm.keys, keyAlias), nil
	}

	sm.debugLog("Starting key retrieval")

	var keys *SecretKeys
	var err error

	switch sm.retrieveMode {
	case "native":
		keys, err = sm.retrieveFromSecretsManager(ctx)
	case "custom":
		keys, err = sm.retrieveFunc(ctx, sm.stackName)
	default:
		return nil, fmt.Errorf("invalid retrieve mode: %s", sm.retrieveMode)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to retrieve keys: %w", err)
	}

	if err := sm.validateKeys(keys); err != nil {
		return nil, fmt.Errorf("invalid key format: %w", err)
	}

	sm.keys = keys
	sm.lastUpdated = time.Now()

	return sm.filterKeys(keys, keyAlias), nil
}

// retrieveFromSecretsManager retrieves secrets from AWS Secrets Manager
func (sm *SecretManager) retrieveFromSecretsManager(ctx context.Context) (*SecretKeys, error) {
	primarySecretName := fmt.Sprintf("%s_PrimarySecret", sm.stackName)
	secondarySecretName := fmt.Sprintf("%s_SecondarySecret", sm.stackName)

	// Retrieve primary secret
	primaryResp, err := sm.client.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &primarySecretName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve primary secret: %w", err)
	}

	// Retrieve secondary secret
	secondaryResp, err := sm.client.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &secondarySecretName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve secondary secret: %w", err)
	}

	// Parse secrets
	primaryKey, err := sm.parseSecretValue(primaryResp.SecretString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse primary secret: %w", err)
	}

	secondaryKey, err := sm.parseSecretValue(secondaryResp.SecretString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse secondary secret: %w", err)
	}

	return &SecretKeys{
		Primary:   primaryKey,
		Secondary: secondaryKey,
	}, nil
}

// parseSecretValue parses a secret value JSON string
func (sm *SecretManager) parseSecretValue(secretString *string) (*SecretKey, error) {
	if secretString == nil {
		return nil, fmt.Errorf("secret string is nil")
	}

	var secretMap map[string]string
	if err := json.Unmarshal([]byte(*secretString), &secretMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal secret: %w", err)
	}

	// Get the first (and should be only) key-value pair
	for uuid, value := range secretMap {
		return &SecretKey{
			UUID:  uuid,
			Value: value,
		}, nil
	}

	return nil, fmt.Errorf("no key-value pairs found in secret")
}

// validateKeys validates the structure of retrieved keys
func (sm *SecretManager) validateKeys(keys *SecretKeys) error {
	if keys == nil {
		return fmt.Errorf("keys is nil")
	}

	if keys.Primary == nil {
		return fmt.Errorf("primary key is nil")
	}

	if keys.Primary.UUID == "" || keys.Primary.Value == "" {
		return fmt.Errorf("primary key UUID or value is empty")
	}

	if keys.Secondary != nil {
		if keys.Secondary.UUID == "" || keys.Secondary.Value == "" {
			return fmt.Errorf("secondary key UUID or value is empty")
		}
	}

	return nil
}

// filterKeys returns the requested key(s) based on alias
func (sm *SecretManager) filterKeys(keys *SecretKeys, keyAlias string) *SecretKeys {
	switch keyAlias {
	case "primary":
		return &SecretKeys{Primary: keys.Primary}
	case "secondary":
		if keys.Secondary != nil {
			return &SecretKeys{Secondary: keys.Secondary}
		}
		return &SecretKeys{}
	default: // "all" or any other value
		return keys
	}
}

// debugLog logs debug messages if debug mode is enabled
func (sm *SecretManager) debugLog(message string) {
	if sm.debug {
		fmt.Printf("[DEBUG] SecretManager: %s\n", message)
	}
}
