// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package smd

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ViewerAttributes represents the attributes of a viewer
type ViewerAttributes struct {
	IP        string            `json:"ip"`
	Country   string            `json:"co,omitempty"`
	Region    string            `json:"reg,omitempty"`
	City      string            `json:"cty,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	QueryVars map[string]string `json:"qs,omitempty"`
	SessionID string            `json:"sessionId,omitempty"`
}

// TokenPolicy defines the policy for token generation
type TokenPolicy struct {
	IP                    bool     `json:"ip"`
	Country               bool     `json:"co"`
	CountryFallback       bool     `json:"co_fallback,omitempty"`
	Region                bool     `json:"reg"`
	RegionFallback        bool     `json:"reg_fallback,omitempty"`
	City                  bool     `json:"cty"`
	Session               bool     `json:"ssn"`
	SessionAutoGenerate   int      `json:"session_auto_generate,omitempty"`
	Headers               []string `json:"headers,omitempty"`
	QueryStrings          []string `json:"querystrings,omitempty"`
	Paths                 []string `json:"paths"`
	Exclusions            []string `json:"exc,omitempty"`
	Exp                   string   `json:"exp"`
	NotBefore             string   `json:"nbf,omitempty"`
}

// TokenGenerator generates JWT tokens for secure media delivery
type TokenGenerator struct {
	secretManager      *SecretManager
	defaultTokenPolicy *TokenPolicy
	debug              bool
}

// TokenGeneratorOption configures TokenGenerator
type TokenGeneratorOption func(*TokenGenerator)

// WithDefaultPolicy sets a default token policy
func WithDefaultPolicy(policy *TokenPolicy) TokenGeneratorOption {
	return func(tg *TokenGenerator) {
		tg.defaultTokenPolicy = policy
	}
}

// WithTokenDebug enables debug logging for token generation
func WithTokenDebug(debug bool) TokenGeneratorOption {
	return func(tg *TokenGenerator) {
		tg.debug = debug
	}
}

// NewTokenGenerator creates a new TokenGenerator
func NewTokenGenerator(secretManager *SecretManager, opts ...TokenGeneratorOption) *TokenGenerator {
	tg := &TokenGenerator{
		secretManager: secretManager,
	}

	for _, opt := range opts {
		opt(tg)
	}

	return tg
}

// Generate generates a secure JWT token
func (tg *TokenGenerator) Generate(ctx context.Context, viewerAttrs *ViewerAttributes, playbackURL string, policy *TokenPolicy, secretAlias ...string) (string, error) {
	// Use provided policy or default
	if policy == nil {
		if tg.defaultTokenPolicy == nil {
			return "", fmt.Errorf("no token policy provided and no default policy set")
		}
		policy = tg.defaultTokenPolicy
	}

	// Determine secret alias
	alias := "primary"
	if len(secretAlias) > 0 {
		alias = secretAlias[0]
	}

	// Retrieve keys
	keys, err := tg.secretManager.RetrieveKeys(ctx, "all")
	if err != nil {
		return "", fmt.Errorf("failed to retrieve keys: %w", err)
	}

	var secretKey *SecretKey
	switch alias {
	case "primary":
		secretKey = keys.Primary
	case "secondary":
		secretKey = keys.Secondary
	default:
		return "", fmt.Errorf("invalid secret alias: %s", alias)
	}

	if secretKey == nil {
		return "", fmt.Errorf("secret key %s not found", alias)
	}

	// Parse playback URL query parameters
	var playbackURLQS map[string]string
	if playbackURL != "" {
		parsedURL, err := url.Parse(playbackURL)
		if err != nil {
			return "", fmt.Errorf("failed to parse playback URL: %w", err)
		}
		playbackURLQS = make(map[string]string)
		for key, values := range parsedURL.Query() {
			if len(values) > 0 {
				playbackURLQS[key] = values[0]
			}
		}
	}

	// Build JWT payload
	payload, sessionID, err := tg.buildJWTPayload(policy, viewerAttrs, playbackURLQS, secretKey)
	if err != nil {
		return "", fmt.Errorf("failed to build JWT payload: %w", err)
	}

	// Create JWT token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, payload)
	token.Header["kid"] = secretKey.UUID

	tokenString, err := token.SignedString([]byte(secretKey.Value))
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT token: %w", err)
	}

	// Handle URL modification or return token
	if playbackURL != "" {
		return tg.insertTokenIntoURL(playbackURL, tokenString, sessionID), nil
	}

	if sessionID != "" {
		return fmt.Sprintf("%s.%s", sessionID, tokenString), nil
	}

	return tokenString, nil
}

// buildJWTPayload builds the JWT payload based on policy and viewer attributes
func (tg *TokenGenerator) buildJWTPayload(policy *TokenPolicy, viewerAttrs *ViewerAttributes, playbackURLQS map[string]string, secretKey *SecretKey) (jwt.MapClaims, string, error) {
	payload := jwt.MapClaims{
		"ip":      false,
		"co":      false,
		"cty":     false,
		"reg":     false,
		"ssn":     false,
		"exp":     "",
		"headers": []string{},
		"qs":      []string{},
		"intsig":  "",
		"paths":   policy.Paths,
		"exc":     policy.Exclusions,
	}

	var intsigInput strings.Builder
	var sessionID string

	// Handle IP validation
	if policy.IP {
		ipVersion, fullIP, err := tg.processIP(viewerAttrs.IP)
		if err != nil {
			return nil, "", fmt.Errorf("failed to process IP: %w", err)
		}
		payload["ip"] = true
		payload["ip_ver"] = ipVersion
		intsigInput.WriteString(fullIP + ":")
	}

	// Handle geolocation
	if policy.Country {
		payload["co"] = true
		if viewerAttrs.Country != "" {
			intsigInput.WriteString(viewerAttrs.Country + ":")
		}
		if policy.CountryFallback {
			payload["co_fallback"] = true
		}
	}

	if policy.Region {
		payload["reg"] = true
		if viewerAttrs.Region != "" {
			intsigInput.WriteString(viewerAttrs.Region + ":")
		}
		if policy.RegionFallback {
			payload["reg_fallback"] = true
		}
	}

	if policy.City {
		payload["cty"] = true
		if viewerAttrs.City != "" {
			intsigInput.WriteString(viewerAttrs.City + ":")
		}
	}

	// Handle session
	if policy.Session {
		payload["ssn"] = true
		if viewerAttrs.SessionID != "" {
			sessionID = viewerAttrs.SessionID
		} else {
			length := policy.SessionAutoGenerate
			if length == 0 {
				length = 12
			}
			var err error
			sessionID, err = generateRandomString(length)
			if err != nil {
				return nil, "", fmt.Errorf("failed to generate session ID: %w", err)
			}
		}
		intsigInput.WriteString(sessionID + ":")
	}

	// Handle headers
	if len(policy.Headers) > 0 {
		payload["headers"] = policy.Headers
		for _, header := range policy.Headers {
			if value, exists := viewerAttrs.Headers[header]; exists {
				intsigInput.WriteString(value + ":")
			}
		}
	}

	// Handle query strings
	if len(policy.QueryStrings) > 0 {
		payload["qs"] = policy.QueryStrings
		for _, qs := range policy.QueryStrings {
			var value string
			if playbackURLQS != nil {
				if v, exists := playbackURLQS[qs]; exists {
					value = v
				}
			}
			if value == "" && viewerAttrs.QueryVars != nil {
				if v, exists := viewerAttrs.QueryVars[qs]; exists {
					value = v
				}
			}
			if value != "" {
				intsigInput.WriteString(value + ":")
			}
		}
	}

	// Generate internal signature
	if intsigInput.Len() > 0 {
		input := strings.TrimSuffix(intsigInput.String(), ":")
		tg.debugLog(fmt.Sprintf("Input for internal signature: %s", input))
		signature := tg.sign(input, secretKey.Value)
		payload["intsig"] = signature
	} else {
		delete(payload, "intsig")
	}

	// Handle expiration
	exp, err := tg.parseExpiration(policy.Exp)
	if err != nil {
		return nil, "", fmt.Errorf("failed to parse expiration: %w", err)
	}
	payload["exp"] = exp

	// Handle not before
	if policy.NotBefore != "" {
		nbf, err := strconv.ParseInt(policy.NotBefore, 10, 64)
		if err != nil {
			return nil, "", fmt.Errorf("failed to parse not before: %w", err)
		}
		payload["nbf"] = nbf
	}

	return payload, sessionID, nil
}

// processIP processes and validates IP address
func (tg *TokenGenerator) processIP(ipStr string) (int, string, error) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return 0, "", fmt.Errorf("invalid IP address: %s", ipStr)
	}

	if ip.To4() != nil {
		return 4, ip.String(), nil
	}

	// IPv6 - expand to full format
	return 6, tg.expandIPv6(ip.String()), nil
}

// expandIPv6 expands IPv6 address to full format
func (tg *TokenGenerator) expandIPv6(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return ipStr
	}
	return ip.String()
}

// sign creates HMAC-SHA256 signature
func (tg *TokenGenerator) sign(input, key string) string {
	h := hmac.New(sha256.New, []byte(key))
	h.Write([]byte(input))
	signature := h.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(signature)
}

// parseExpiration parses expiration string
func (tg *TokenGenerator) parseExpiration(exp string) (int64, error) {
	if strings.HasPrefix(exp, "+") {
		// Relative expiration
		if strings.HasSuffix(exp, "h") {
			hours, err := strconv.Atoi(exp[1 : len(exp)-1])
			if err != nil {
				return 0, fmt.Errorf("invalid expiration format: %s", exp)
			}
			return time.Now().Unix() + int64(hours*3600), nil
		} else if strings.HasSuffix(exp, "m") {
			minutes, err := strconv.Atoi(exp[1 : len(exp)-1])
			if err != nil {
				return 0, fmt.Errorf("invalid expiration format: %s", exp)
			}
			return time.Now().Unix() + int64(minutes*60), nil
		}
		return 0, fmt.Errorf("invalid expiration format: %s", exp)
	}

	// Absolute expiration
	timestamp, err := strconv.ParseInt(exp, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid expiration format: %s", exp)
	}
	if timestamp <= 0 {
		return 0, fmt.Errorf("invalid expiration timestamp: %d", timestamp)
	}
	return timestamp, nil
}

// insertTokenIntoURL inserts the token into the playback URL
func (tg *TokenGenerator) insertTokenIntoURL(playbackURL, token, sessionID string) string {
	parts := strings.Split(playbackURL, "/")
	if len(parts) < 4 {
		return playbackURL
	}

	tokenPart := token
	if sessionID != "" {
		tokenPart = fmt.Sprintf("%s.%s", sessionID, token)
	}

	// Insert token after protocol://domain
	result := make([]string, 0, len(parts)+1)
	result = append(result, parts[:3]...)
	result = append(result, tokenPart)
	result = append(result, parts[3:]...)

	return strings.Join(result, "/")
}

// debugLog logs debug messages if debug mode is enabled
func (tg *TokenGenerator) debugLog(message string) {
	if tg.debug {
		fmt.Printf("[DEBUG] TokenGenerator: %s\n", message)
	}
}
