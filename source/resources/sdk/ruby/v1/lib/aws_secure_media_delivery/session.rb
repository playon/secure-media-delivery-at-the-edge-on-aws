# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require 'aws-sdk-dynamodb'
require 'securerandom'

module AwsSecureMediaDelivery
  # Manages session revocation and tracking
  #
  # This class handles session creation, auto-generation, and revocation
  # for the secure media delivery system.
  #
  # @example Basic usage
  #   Session.initialize('MyRevocationTable')
  #   session = Session.new('session123')
  #   success = session.revoke(expiry_period: 86400, reason: 'COMPROMISED')
  #
  # @example Auto-generated session
  #   session = Session.new(16, autogenerate: true)  # 16 character ID
  #   puts session.id
  #
  class Session
    # @return [Boolean] debug logging enabled
    @@debug = false
    
    # @return [Aws::DynamoDB::Client, nil] DynamoDB client
    @@ddb_client = nil
    
    # @return [String] revocation table name
    @@revocation_table = ''
    
    # @return [String] session ID
    attr_reader :id
    
    # @return [Integer] suspicion score
    attr_reader :suspicion_score
    
    # Initialize Session
    #
    # @param session_id [String, Integer, nil] Existing session ID or length for auto-generation
    # @param autogenerate [Boolean] Whether to auto-generate session ID
    # @param suspicion_score [Integer] Suspicion score for the session
    # @raise [ValidationError] if invalid parameters provided
    #
    def initialize(session_id = nil, autogenerate: false, suspicion_score: 0)
      if session_id && autogenerate
        session_length = session_id.to_i
        if session_length > 6
          @id = self.class.auto_generate(session_length)
        else
          raise ValidationError, 'Invalid id input while autogenerate set to true. It must be a number greater than 6'
        end
      elsif session_id
        @id = session_id.to_s
      else
        @id = self.class.auto_generate(12)
      end
      
      @suspicion_score = suspicion_score
    end
    
    # Enable or disable debug logging
    #
    # @param val [Boolean] enable debug logging
    #
    def self.set_debug(val = true)
      @@debug = val if [true, false].include?(val)
    end
    
    # Initialize session management with DynamoDB table
    #
    # @param table_name [String] Name of the DynamoDB revocation table
    # @param params [Hash] AWS configuration parameters
    # @option params [String] :profile AWS profile name
    # @option params [String] :role AWS role ARN to assume
    # @option params [String] :region AWS region
    #
    def self.initialize(table_name, params = {})
      @@revocation_table = table_name
      init_db_client(params)
    end
    
    # Revoke the session by adding it to the revocation table
    #
    # @param expiry_period [Integer] How long the revocation should last (seconds)
    # @param reason [String] Reason for revocation
    # @return [Boolean] true if successful, false otherwise
    # @raise [SessionError] if DynamoDB client not initialized or table name not set
    #
    def revoke(expiry_period: 86400, reason: 'COMPROMISED')
      raise SessionError, "DynamoDB client hasn't been initialized" unless @@ddb_client
      raise SessionError, 'Revocation Table name must be set' if @@revocation_table.empty?
      
      current_timestamp = Time.now.to_i
      expiry_time = current_timestamp + expiry_period
      
      item = {
        'session_id' => { 'S' => @id },
        'type' => { 'S' => 'MANUAL' },
        'score' => { 'N' => @suspicion_score.to_s },
        'reason' => { 'S' => reason },
        'last_updated' => { 'N' => current_timestamp.to_s },
        'ttl' => { 'N' => expiry_time.to_s }
      }
      
      params = {
        item: item,
        table_name: @@revocation_table
      }
      
      begin
        @@ddb_client.put_item(params)
        true
      rescue StandardError => e
        puts "ERROR: #{e}"
        log("Manual session revoke operation failed when updating DynamoDB table: #{e}")
        false
      end
    end
    
    # Initialize DynamoDB client
    #
    # @param params [Hash] AWS configuration parameters
    # @return [Boolean] true if successful, false otherwise
    #
    def self.init_db_client(params = {})
      config = get_credentials_and_region(params)
      @@ddb_client = Aws::DynamoDB::Client.new(config)
      true
    rescue StandardError => e
      log("Couldn't create DynamoDB client: #{e}")
      false
    end
    
    # Auto-generate a random session ID
    #
    # @param output_length [Integer] Length of the generated session ID
    # @return [String] Random session ID string
    #
    def self.auto_generate(output_length)
      chars = ('A'..'Z').to_a + ('a'..'z').to_a + ('0'..'9').to_a
      Array.new(output_length) { chars.sample }.join
    end
    
    private
    
    # Log debug message
    #
    # @param message [String] message to log
    #
    def self.log(message)
      puts "[DEBUG] #{message}" if @@debug
    end
    
    # Instance method for logging
    def log(message)
      self.class.log(message)
    end
    
    # Get AWS credentials and region from parameters
    #
    # @param params [Hash] AWS configuration parameters
    # @return [Hash] AWS client configuration
    #
    def self.get_credentials_and_region(params)
      config = {}
      
      if params[:profile]
        config[:profile] = params[:profile]
      elsif params[:role]
        sts_client = Aws::STS::Client.new
        assumed_role = sts_client.assume_role(
          role_arn: params[:role],
          role_session_name: "SecureMediaDelivery-SDK-#{Time.now.to_i}"
        )
        config[:credentials] = Aws::Credentials.new(
          assumed_role.credentials.access_key_id,
          assumed_role.credentials.secret_access_key,
          assumed_role.credentials.session_token
        )
      end
      
      config[:region] = params[:region] || ENV['AWS_REGION'] || 'us-east-1'
      config
    end
  end
end
