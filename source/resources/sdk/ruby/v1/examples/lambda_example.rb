#!/usr/bin/env ruby
# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# AWS Lambda function example using the Secure Media Delivery Ruby SDK
#
# This example shows how to create a Lambda function that generates secure tokens
# for video playback, similar to the Node.js version in the solution.

require 'json'
require 'aws-sdk-dynamodb'
require_relative '../lib/aws_secure_media_delivery'

# Initialize outside handler for connection reuse
$secret = nil
$token = nil
$dynamodb = nil

def init_sdk
  stack_name = ENV['STACK_NAME'] || 'MySecureStreamStack'
  
  # Initialize secret manager
  $secret = AwsSecureMediaDelivery::Secret.new(stack_name: stack_name, ttl: 300)
  $secret.init_sm_client
  
  # Initialize token generator
  $token = AwsSecureMediaDelivery::Token.new($secret)
  
  # Initialize DynamoDB client
  $dynamodb = Aws::DynamoDB::Resource.new
end

# Populate country, region, and city from CloudFront headers
#
# @param token_policy [Hash] Token generation policy
# @param headers [Hash] Request headers
# @return [Hash] Viewer attributes hash
# @raise [AwsSecureMediaDelivery::ValidationError] if required headers missing
#
def populate_country_region_city(token_policy, headers)
  viewer_attributes = {}
  
  if token_policy[:co] || token_policy['co']
    if headers['cloudfront-viewer-country']
      viewer_attributes[:co] = headers['cloudfront-viewer-country']
    elsif !(token_policy[:co_fallback] || token_policy['co_fallback'])
      raise AwsSecureMediaDelivery::ValidationError, 'Country header missing and no fallback enabled'
    end
  end
  
  if token_policy[:reg] || token_policy['reg']
    if headers['cloudfront-viewer-country-region']
      viewer_attributes[:reg] = headers['cloudfront-viewer-country-region']
    elsif !(token_policy[:reg_fallback] || token_policy['reg_fallback'])
      raise AwsSecureMediaDelivery::ValidationError, 'Region header missing and no fallback enabled'
    end
  end
  
  if token_policy[:cty] || token_policy['cty']
    if headers['cloudfront-viewer-city']
      viewer_attributes[:cty] = headers['cloudfront-viewer-city']
    elsif !(token_policy[:cty_fallback] || token_policy['cty_fallback'])
      raise AwsSecureMediaDelivery::ValidationError, 'City header missing and no fallback enabled'
    end
  end
  
  viewer_attributes
end

# Populate all viewer attributes based on token policy
#
# @param token_policy [Hash] Token generation policy
# @param viewer_ip [String] Viewer's IP address
# @param headers [Hash] Request headers
# @param query_params [Hash] Query string parameters
# @return [Hash] Complete viewer attributes
#
def populate_viewer_attributes(token_policy, viewer_ip, headers, query_params)
  viewer_attributes = populate_country_region_city(token_policy, headers)
  
  viewer_attributes[:ip] = viewer_ip if token_policy[:ip] || token_policy['ip']
  
  headers_policy = token_policy[:headers] || token_policy['headers']
  if headers_policy && !headers_policy.empty?
    viewer_attributes[:headers] = headers
  end
  
  qs_policy = token_policy[:querystrings] || token_policy['querystrings']
  if qs_policy && !qs_policy.empty?
    viewer_attributes[:qs] = query_params
  end
  
  viewer_attributes
end

# AWS Lambda handler for generating secure media tokens
#
# Expected event structure:
# {
#   "queryStringParameters": {
#     "id": "video_asset_id"
#   },
#   "headers": {
#     "cloudfront-viewer-address": "192.168.1.1:12345",
#     "cloudfront-viewer-country": "US",
#     "user-agent": "Mozilla/5.0...",
#     "referer": "https://example.com"
#   },
#   "requestContext": {
#     "http": {
#       "sourceIp": "192.168.1.1"
#     }
#   }
# }
#
# @param event [Hash] Lambda event
# @param context [Object] Lambda context
# @return [Hash] Lambda response
#
def lambda_handler(event:, context:)
  # Initialize SDK if not already done
  init_sdk unless $secret && $token && $dynamodb
  
  puts JSON.generate(event)
  
  begin
    # Extract parameters
    query_params = event['queryStringParameters'] || {}
    headers = event['headers'] || {}
    
    # Validate required parameters
    video_id = query_params['id']
    unless video_id
      return {
        statusCode: 400,
        body: JSON.generate({ error: 'Missing required parameter: id' })
      }
    end
    
    # Validate video ID format
    unless video_id.match?(/^\w+$/) && video_id.length <= 200
      return {
        statusCode: 400,
        body: JSON.generate({ error: 'Invalid video ID format' })
      }
    end
    
    # Remove 'id' from query params for token generation
    token_query_params = query_params.reject { |k, _| k == 'id' }
    
    # Extract viewer IP
    viewer_ip = nil
    if headers['cloudfront-viewer-address']
      # Extract IP from "IP:PORT" format
      viewer_ip = headers['cloudfront-viewer-address'].split(':').first
    else
      viewer_ip = event.dig('requestContext', 'http', 'sourceIp')
    end
    
    unless viewer_ip
      return {
        statusCode: 400,
        body: JSON.generate({ error: 'Unable to determine viewer IP' })
      }
    end
    
    # Get video metadata from DynamoDB
    table_name = ENV['TABLE_NAME']
    unless table_name
      return {
        statusCode: 500,
        body: JSON.generate({ error: 'TABLE_NAME environment variable not set' })
      }
    end
    
    table = $dynamodb.table(table_name)
    response = table.get_item(key: { 'id' => video_id })
    video_metadata = response.item
    
    unless video_metadata
      return {
        statusCode: 404,
        body: JSON.generate({ error: 'No video asset found for the given ID' })
      }
    end
    
    # Extract video metadata
    endpoint_hostname = video_metadata['endpoint_hostname']
    video_url = video_metadata['url_path']
    token_policy = video_metadata['token_policy'] || {}
    
    # Convert string keys to symbols for consistency
    token_policy = token_policy.transform_keys(&:to_sym) if token_policy.respond_to?(:transform_keys)
    
    # Build original URL
    original_url = nil
    if endpoint_hostname && video_url
      original_url = "#{endpoint_hostname}#{video_url}"
    end
    
    # Populate viewer attributes
    viewer_attributes = populate_viewer_attributes(
      token_policy, viewer_ip, headers, token_query_params
    )
    
    # Generate secure token
    playback_url = $token.generate(viewer_attributes, original_url, token_policy)
    
    # Build response body
    response_body = {
      playback_url: playback_url,
      token_policy: {
        ip: (token_policy[:ip] || token_policy['ip']) ? 1 : 0,
        ip_value: viewer_ip,
        ua: (token_policy[:headers] || token_policy['headers'] || []).include?('user-agent') ? 1 : 0,
        ua_value: headers['user-agent'],
        referer: (token_policy[:headers] || token_policy['headers'] || []).include?('referer') ? 1 : 0,
        referer_value: headers['referer']
      }
    }
    
    {
      statusCode: 200,
      body: JSON.generate(response_body),
      headers: {
        'Content-Type' => 'application/json'
      }
    }
    
  rescue AwsSecureMediaDelivery::ValidationError => e
    {
      statusCode: 400,
      body: JSON.generate({ error: e.message })
    }
  rescue StandardError => e
    puts "Error: #{e.message}"
    puts e.backtrace
    {
      statusCode: 500,
      body: JSON.generate({ error: 'Internal server error' })
    }
  end
end

# For local testing
if __FILE__ == $PROGRAM_NAME
  # Mock event for testing
  test_event = {
    'queryStringParameters' => {
      'id' => 'test-video-123',
      'quality' => '1080p'
    },
    'headers' => {
      'cloudfront-viewer-address' => '192.168.1.100:12345',
      'cloudfront-viewer-country' => 'US',
      'cloudfront-viewer-country-region' => 'CA',
      'cloudfront-viewer-city' => 'San Francisco',
      'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'referer' => 'https://example.com/player'
    },
    'requestContext' => {
      'http' => {
        'sourceIp' => '192.168.1.100'
      }
    }
  }
  
  # Set environment variables for testing
  ENV['STACK_NAME'] = 'TestStack'
  ENV['TABLE_NAME'] = 'TestTable'
  
  # Run test
  result = lambda_handler(event: test_event, context: nil)
  puts JSON.pretty_generate(result)
end
