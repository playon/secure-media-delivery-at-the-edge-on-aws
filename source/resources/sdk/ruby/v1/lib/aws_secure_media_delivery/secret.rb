# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require 'aws-sdk-secretsmanager'
require 'json'
require 'concurrent'

module AwsSecureMediaDelivery
  # Manages cryptographic secrets for token signing
  #
  # This class handles the retrieval and caching of secrets from AWS Secrets Manager
  # or custom sources for use in JWT token generation.
  #
  # @example Basic usage
  #   secret = Secret.new(stack_name: 'MyStack', ttl: 300)
  #   secret.init_sm_client
  #   keys = secret.retrieve_keys
  #
  # @example Custom secret retrieval
  #   custom_retriever = proc { |stack_name| { primary: { uuid: 'id', value: 'secret' } } }
  #   secret = Secret.new(
  #     stack_name: 'MyStack',
  #     ttl: 300,
  #     retrieve_mode: :custom,
  #     retrieve_function: custom_retriever
  #   )
  #
  class Secret
    # @return [Boolean] debug logging enabled
    @@debug = false
    
    # @return [Hash, nil] cached keys
    attr_reader :keys
    
    # @return [String] CloudFormation stack name
    attr_reader :stack_name
    
    # @return [Integer] time-to-live for cached secrets in seconds
    attr_reader :ttl
    
    # @return [Symbol] retrieve mode (:native or :custom)
    attr_reader :retrieve_mode
    
    # Initialize Secret manager
    #
    # @param stack_name [String] CloudFormation stack name
    # @param ttl [Integer] Time-to-live for cached secrets in seconds
    # @param retrieve_mode [Symbol] :native for AWS Secrets Manager or :custom for custom function
    # @param retrieve_function [Proc] Custom function to retrieve secrets (if retrieve_mode is :custom)
    # @param retrieve_function_args [Array] Arguments for custom retrieve function
    #
    def initialize(stack_name:, ttl:, retrieve_mode: :native, retrieve_function: nil, retrieve_function_args: [])
      @keys = nil
      @last_updated = nil
      @lock = Concurrent::Mutex.new
      @stack_name = stack_name
      @sm_client = nil
      @ttl = ttl
      @retrieve_mode = retrieve_mode
      @retrieve_function = retrieve_function
      @retrieve_function_args = retrieve_function_args
    end
    
    # Enable or disable debug logging
    #
    # @param val [Boolean] enable debug logging
    #
    def self.set_debug(val = true)
      @@debug = val if [true, false].include?(val)
    end
    
    # Initialize AWS Secrets Manager client
    #
    # @param params [Hash] AWS configuration parameters
    # @option params [String] :profile AWS profile name
    # @option params [String] :role AWS role ARN to assume
    # @option params [String] :region AWS region
    # @return [Boolean] true if successful, false otherwise
    #
    def init_sm_client(params = {})
      config = get_credentials_and_region(params)
      @sm_client = Aws::SecretsManager::Client.new(config)
      true
    rescue StandardError => e
      log("Couldn't create SecretsManager client: #{e}")
      false
    end
    
    # Retrieve cryptographic keys
    #
    # @param key_alias [String, Symbol] 'all' for all keys, or specific alias ('primary'/'secondary')
    # @return [Hash] dictionary containing requested keys
    # @raise [SecretRetrievalError] if key retrieval fails
    #
    def retrieve_keys(key_alias = :all)
      key_alias = key_alias.to_sym
      is_expired = check_if_expired
      
      if @last_updated && (!is_expired || @lock.locked?)
        return key_alias == :all ? @keys : @keys[key_alias]
      end
      
      log('Starting key retrieval')
      
      @lock.synchronize do
        # Double-check pattern
        is_expired = check_if_expired
        if @last_updated && !is_expired
          return key_alias == :all ? @keys : @keys[key_alias]
        end
        
        begin
          case @retrieve_mode
          when :native
            provisional_keys = get_sm_secret
          when :custom
            provisional_keys = @retrieve_function.call(*@retrieve_function_args)
          else
            raise SecretRetrievalError, "Invalid retrieve mode: #{@retrieve_mode}"
          end
          
          unless self.class.validate_keys(provisional_keys)
            raise SecretRetrievalError, 'Invalid format of the returned keys'
          end
          
          @keys = provisional_keys
          @last_updated = Time.now.to_i
        rescue StandardError => e
          log("Failed to retrieve the keys: #{e}")
          raise SecretRetrievalError, "Key retrieval failed: #{e}"
        end
      end
      
      if @keys
        return key_alias == :all ? @keys : @keys[key_alias]
      end
      
      raise SecretRetrievalError, 'Key retrieval failed and no previously set key is available'
    end
    
    # Get the value of a specific key
    #
    # @param key_alias [String, Symbol] key alias
    # @return [String] key value
    #
    def get_key_value(key_alias)
      @keys[key_alias.to_sym][:value]
    end
    
    # Get the UUID of a specific key
    #
    # @param key_alias [String, Symbol] key alias
    # @return [String] key UUID
    #
    def get_key_uuid(key_alias)
      @keys[key_alias.to_sym][:uuid]
    end
    
    # Validate the format of retrieved keys
    #
    # @param obj [Hash] keys object to validate
    # @return [Boolean] true if valid format, false otherwise
    #
    def self.validate_keys(obj)
      return false unless obj.is_a?(Hash)
      
      top_level_keys = obj.keys.map(&:to_sym)
      
      case top_level_keys.length
      when 1
        return false unless top_level_keys.include?(:primary)
        
        primary = obj[:primary] || obj['primary']
        return false unless primary.is_a?(Hash)
        
        low_level_keys = primary.keys.map(&:to_s)
        validate_primary(top_level_keys, low_level_keys, primary['uuid'] || primary[:uuid], primary['value'] || primary[:value])
      when 2
        return false unless top_level_keys.include?(:primary) && top_level_keys.include?(:secondary)
        
        validate_secondary(top_level_keys, obj)
      else
        false
      end
    end
    
    private
    
    # Log debug message
    #
    # @param message [String] message to log
    #
    def log(message)
      puts "[DEBUG] #{message}" if @@debug
    end
    
    # Get AWS credentials and region from parameters
    #
    # @param params [Hash] AWS configuration parameters
    # @return [Hash] AWS client configuration
    #
    def get_credentials_and_region(params)
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
    
    # Retrieve secrets from AWS Secrets Manager
    #
    # @return [Hash] dictionary containing primary and secondary secrets
    # @raise [SecretRetrievalError] if secrets cannot be retrieved
    #
    def get_sm_secret
      secret_name_primary = "#{@stack_name}_PrimarySecret"
      secret_name_secondary = "#{@stack_name}_SecondarySecret"
      
      begin
        # Get both secrets
        primary_response = @sm_client.get_secret_value(secret_id: secret_name_primary)
        secondary_response = @sm_client.get_secret_value(secret_id: secret_name_secondary)
        
        primary_secret_json = get_secret_kv(primary_response)
        secondary_secret_json = get_secret_kv(secondary_response)
      rescue StandardError => e
        raise SecretRetrievalError, "Couldn't retrieve SecretsManager secrets: #{e}"
      end
      
      {
        primary: {
          uuid: primary_secret_json.keys.first,
          value: primary_secret_json.values.first
        },
        secondary: {
          uuid: secondary_secret_json.keys.first,
          value: secondary_secret_json.values.first
        }
      }
    end
    
    # Check if cached keys have expired
    #
    # @return [Boolean, nil] true if expired, false if valid, nil if not set
    #
    def check_if_expired
      return nil unless @last_updated
      
      Time.now.to_i - @last_updated > @ttl
    end
    
    # Extract key-value pairs from Secrets Manager response
    #
    # @param sm_response [Aws::SecretsManager::Types::GetSecretValueResponse] response from Secrets Manager
    # @return [Hash] dictionary containing secret key-value pairs
    #
    def get_secret_kv(sm_response)
      if sm_response.secret_string
        secret = sm_response.secret_string
      else
        secret = Base64.decode64(sm_response.secret_binary)
      end
      
      JSON.parse(secret)
    end
    
    # Validate primary key structure
    #
    # @param top_level_keys [Array] top level keys
    # @param low_level_keys [Array] low level keys
    # @param uuid [String] key UUID
    # @param value [String] key value
    # @return [Boolean] true if valid
    #
    def self.validate_primary(top_level_keys, low_level_keys, uuid, value)
      return false unless top_level_keys.include?(:primary)
      return false unless low_level_keys.length == 2
      return false unless low_level_keys.include?('uuid') && low_level_keys.include?('value')
      
      uuid.is_a?(String) && value.is_a?(String)
    end
    
    # Validate secondary key structure
    #
    # @param top_level_keys [Array] top level keys
    # @param obj [Hash] keys object
    # @return [Boolean] true if valid
    #
    def self.validate_secondary(top_level_keys, obj)
      return false unless top_level_keys.include?(:primary) && top_level_keys.include?(:secondary)
      
      [:primary, :secondary].each do |key|
        key_data = obj[key] || obj[key.to_s]
        return false unless key_data.is_a?(Hash)
        
        low_level_keys = key_data.keys.map(&:to_s)
        return false unless low_level_keys.length == 2
        return false unless low_level_keys.include?('uuid') && low_level_keys.include?('value')
        
        uuid = key_data['uuid'] || key_data[:uuid]
        value = key_data['value'] || key_data[:value]
        return false unless uuid.is_a?(String) && value.is_a?(String)
      end
      
      true
    end
  end
end
