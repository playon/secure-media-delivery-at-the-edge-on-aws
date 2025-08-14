#!/usr/bin/env ruby
# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Basic usage example for AWS Secure Media Delivery Ruby SDK

require_relative '../lib/aws_secure_media_delivery'

# Enable debug logging
AwsSecureMediaDelivery::Secret.set_debug(true)
AwsSecureMediaDelivery::Token.set_debug(true)
AwsSecureMediaDelivery::Session.set_debug(true)

def main
  puts 'AWS Secure Media Delivery Ruby SDK - Basic Usage Example'
  puts '=' * 60
  
  # Initialize secret manager
  puts 'Initializing secret manager...'
  secret = AwsSecureMediaDelivery::Secret.new(stack_name: 'MySecureStreamStack', ttl: 300)
  
  # Initialize AWS Secrets Manager client
  unless secret.init_sm_client
    puts 'Failed to initialize Secrets Manager client'
    return
  end
  
  # Create token generator
  token = AwsSecureMediaDelivery::Token.new(secret)
  
  # Define viewer attributes
  viewer_attributes = {
    ip: '192.168.1.100',
    co: 'US',
    reg: 'CA',
    cty: 'San Francisco',
    headers: {
      'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'referer' => 'https://example.com/player'
    },
    qs: {
      'quality' => '1080p',
      'lang' => 'en'
    }
  }
  
  # Define token policy
  token_policy = {
    ip: true,
    co: true,
    co_fallback: true,
    headers: ['user-agent', 'referer'],
    querystrings: ['quality'],
    paths: ['/video/', '/live/'],
    exc: ['/health', '/status'],
    exp: '+2h',
    ssn: true,
    session_auto_generate: 16
  }
  
  begin
    # Generate token for HLS stream
    puts "\nGenerating token for HLS stream..."
    hls_url = 'https://d1234567890.cloudfront.net/video/stream.m3u8'
    signed_hls_url = token.generate(viewer_attributes, hls_url, token_policy)
    puts "Signed HLS URL: #{signed_hls_url}"
    
    # Generate token for DASH stream
    puts "\nGenerating token for DASH stream..."
    dash_url = 'https://d1234567890.cloudfront.net/video/stream.mpd'
    signed_dash_url = token.generate(viewer_attributes, dash_url, token_policy)
    puts "Signed DASH URL: #{signed_dash_url}"
    
    # Generate token without URL (just the token)
    puts "\nGenerating standalone token..."
    standalone_token = token.generate(viewer_attributes, nil, token_policy)
    puts "Standalone token: #{standalone_token}"
    
  rescue AwsSecureMediaDelivery::Error => e
    puts "Error generating token: #{e.message}"
  end
end

def session_management_example
  puts "\n" + '=' * 50
  puts 'Session Management Example'
  puts '=' * 50
  
  # Initialize session management
  AwsSecureMediaDelivery::Session.initialize('MyRevocationTable', region: 'us-east-1')
  
  # Create a session with auto-generated ID
  session1 = AwsSecureMediaDelivery::Session.new(autogenerate: true)
  puts "Auto-generated session ID: #{session1.id}"
  
  # Create a session with specific ID
  session2 = AwsSecureMediaDelivery::Session.new('user-session-12345')
  puts "Custom session ID: #{session2.id}"
  
  # Create a session with custom length
  session3 = AwsSecureMediaDelivery::Session.new(20, autogenerate: true) # 20 character ID
  puts "Custom length session ID: #{session3.id}"
  
  begin
    # Revoke a session
    puts "\nRevoking session: #{session2.id}"
    success = session2.revoke(expiry_period: 86400, reason: 'SUSPICIOUS_ACTIVITY')
    if success
      puts 'Session revoked successfully'
    else
      puts 'Failed to revoke session'
    end
  rescue AwsSecureMediaDelivery::Error => e
    puts "Error revoking session: #{e.message}"
  end
end

def custom_secret_example
  puts "\n" + '=' * 50
  puts 'Custom Secret Retrieval Example'
  puts '=' * 50
  
  # Custom function to retrieve secrets
  custom_secret_retriever = proc do |stack_name|
    puts "Custom retrieval for stack: #{stack_name}"
    
    # In a real implementation, you might retrieve from:
    # - A different AWS service
    # - A local file
    # - An external API
    # - A database
    
    {
      primary: {
        uuid: 'custom-key-uuid-12345',
        value: 'custom-secret-value-abcdef'
      },
      secondary: {
        uuid: 'custom-key-uuid-67890',
        value: 'custom-secret-value-ghijkl'
      }
    }
  end
  
  # Initialize secret with custom retrieval
  secret = AwsSecureMediaDelivery::Secret.new(
    stack_name: 'MyStack',
    ttl: 300,
    retrieve_mode: :custom,
    retrieve_function: custom_secret_retriever,
    retrieve_function_args: ['MyStack']
  )
  
  begin
    # Retrieve keys using custom function
    keys = secret.retrieve_keys
    puts "Retrieved keys: #{keys.keys}"
    puts "Primary key UUID: #{keys[:primary][:uuid]}"
    
  rescue AwsSecureMediaDelivery::Error => e
    puts "Error with custom secret retrieval: #{e.message}"
  end
end

def token_policy_examples
  puts "\n" + '=' * 50
  puts 'Token Policy Examples'
  puts '=' * 50
  
  # Example 1: Basic IP and country validation
  basic_policy = {
    ip: true,
    co: true,
    paths: ['/video/'],
    exp: '+1h'
  }
  puts "Basic Policy: #{basic_policy}"
  
  # Example 2: Comprehensive validation
  comprehensive_policy = {
    ip: true,
    co: true,
    co_fallback: true,
    reg: true,
    cty: true,
    ssn: true,
    session_auto_generate: 16,
    headers: ['user-agent', 'referer', 'authorization'],
    querystrings: ['quality', 'lang', 'device'],
    paths: ['/video/', '/live/', '/vod/'],
    exc: ['/health', '/status', '/metrics'],
    exp: '+4h',
    nbf: (Time.now.to_i - 300).to_s # Valid 5 minutes ago
  }
  puts "Comprehensive Policy: #{comprehensive_policy}"
  
  # Example 3: Session-based with fallbacks
  session_policy = {
    ip: true,
    co: true,
    co_fallback: true,
    reg: true,
    reg_fallback: true,
    ssn: true,
    headers: ['user-agent'],
    paths: ['/premium/'],
    exp: '+30m' # Short expiration for premium content
  }
  puts "Session Policy: #{session_policy}"
end

# Run examples
if __FILE__ == $PROGRAM_NAME
  main
  session_management_example
  custom_secret_example
  token_policy_examples
end
