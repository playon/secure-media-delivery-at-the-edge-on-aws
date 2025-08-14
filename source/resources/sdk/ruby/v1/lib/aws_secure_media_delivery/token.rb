# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require 'jwt'
require 'openssl'
require 'base64'
require 'ipaddr'
require 'uri'
require 'cgi'

module AwsSecureMediaDelivery
  # Generates JWT tokens with various security policies
  #
  # This class creates secure tokens for media delivery with support for
  # IP validation, geolocation, headers, query strings, and session management.
  #
  # @example Basic usage
  #   token = Token.new(secret)
  #   viewer_attributes = { ip: '192.168.1.1', co: 'US' }
  #   token_policy = { ip: true, co: true, paths: ['/video/'], exp: '+2h' }
  #   signed_url = token.generate(viewer_attributes, playback_url, token_policy)
  #
  class Token
    # @return [Boolean] debug logging enabled
    @@debug = false
    
    # @return [Secret] secret manager instance
    attr_reader :secret
    
    # @return [Hash, nil] default token policy
    attr_reader :default_token_policy
    
    # @return [String, nil] encoded JWT token
    attr_reader :encoded_jwt
    
    # @return [String, nil] output playback URL
    attr_reader :output_playback_url
    
    # @return [String, nil] payload session ID
    attr_reader :payload_ssn
    
    # Initialize Token generator
    #
    # @param secret [Secret] Secret manager instance
    # @param default_token_policy [Hash, nil] Default policy for token generation
    #
    def initialize(secret, default_token_policy = nil)
      @secret = secret
      @default_token_policy = default_token_policy
      @encoded_jwt = nil
      @output_playback_url = nil
      @payload_ssn = nil
    end
    
    # Enable or disable debug logging
    #
    # @param val [Boolean] enable debug logging
    #
    def self.set_debug(val = true)
      @@debug = val if [true, false].include?(val)
    end
    
    # Generate a secure JWT token
    #
    # @param viewer_attributes [Hash] Viewer's attributes (IP, location, headers, etc.)
    # @param playback_url [String, nil] Original playback URL to be secured
    # @param token_policy [Hash, nil] Token generation policy
    # @param secret_alias [String, Symbol] Which secret to use ('primary' or 'secondary')
    # @return [String] Signed playback URL or token string
    # @raise [TokenGenerationError] if token generation fails
    # @raise [ValidationError] if invalid parameters provided
    #
    def generate(viewer_attributes, playback_url = nil, token_policy = nil, secret_alias = :primary)
      secret_alias = secret_alias.to_sym
      keys = @secret.retrieve_keys
      
      unless keys[secret_alias]
        raise ValidationError, "Provided secret alias '#{secret_alias}' can't be found in the retrieved secret"
      end
      
      playback_url_qs = {}
      if playback_url
        uri = URI.parse(playback_url)
        playback_url_qs = CGI.parse(uri.query || '')
        # Convert arrays to single values (CGI.parse returns arrays)
        playback_url_qs.transform_values! { |v| v.is_a?(Array) ? v.first : v }
      end
      
      # Use provided policy or default
      policy = token_policy || @default_token_policy
      raise ValidationError, 'No token policy provided and no default policy set' unless policy
      
      jwt_payload = {
        ip: false,
        co: false,
        cty: false,
        reg: false,
        ssn: false,
        exp: '',
        headers: [],
        qs: [],
        intsig: '',
        paths: [],
        exc: []
      }
      
      jwt_payload = populate_jwt_payload(policy, viewer_attributes, jwt_payload, playback_url_qs, keys[secret_alias])
      
      # Generate JWT token
      @encoded_jwt = JWT.encode(
        jwt_payload,
        keys[secret_alias][:value],
        'HS256',
        { kid: keys[secret_alias][:uuid] }
      )
      
      if playback_url
        # Insert token into URL path
        url_parts = playback_url.split('/')
        token_part = @payload_ssn ? "#{@payload_ssn}.#{@encoded_jwt}" : @encoded_jwt
        url_parts.insert(3, token_part) # Insert after protocol://domain
        @output_playback_url = url_parts.join('/')
        return @output_playback_url
      end
      
      # Return token with optional session ID
      @payload_ssn ? "#{@payload_ssn}.#{@encoded_jwt}" : @encoded_jwt
    rescue StandardError => e
      raise TokenGenerationError, "Token generation failed: #{e}"
    end
    
    private
    
    # Log debug message
    #
    # @param message [String] message to log
    #
    def log(message)
      puts "[DEBUG] #{message}" if @@debug
    end
    
    # Create HMAC signature
    #
    # @param input_data [String] Data to sign
    # @param key [String] Signing key
    # @param method [String] Hash method (e.g., 'sha256')
    # @return [String] Base64URL encoded signature
    #
    def sign(input_data, key, method)
      case method
      when 'sha256'
        hash_func = OpenSSL::Digest::SHA256.new
      else
        raise ValidationError, "Unsupported hash method: #{method}"
      end
      
      signature = OpenSSL::HMAC.digest(hash_func, key, input_data)
      Base64.urlsafe_encode64(signature).tr('=', '')
    end
    
    # Populate IP-related fields in JWT payload
    #
    # @param viewer_attributes [Hash] Viewer's attributes including IP
    # @param jwt_payload [Hash] JWT payload being constructed
    # @return [Hash] Hash with :full_ip and :jwt_payload
    # @raise [ValidationError] if IP format is invalid
    #
    def populate_ip(viewer_attributes, jwt_payload)
      ip = viewer_attributes[:ip] || viewer_attributes['ip']
      
      begin
        ip_addr = IPAddr.new(ip)
        if ip_addr.ipv4?
          jwt_payload[:ip_ver] = 4
          full_ip = ip_addr.to_s
        elsif ip_addr.ipv6?
          jwt_payload[:ip_ver] = 6
          full_ip = expand_ipv6(ip_addr.to_s)
        else
          raise ValidationError, 'Invalid IP address format'
        end
      rescue IPAddr::InvalidAddressError
        raise ValidationError, "Invalid viewer's IP format: #{ip}"
      end
      
      { full_ip: full_ip, jwt_payload: jwt_payload }
    end
    
    # Expand IPv6 address to full format
    #
    # @param address [String] IPv6 address string
    # @return [String] Fully expanded IPv6 address
    #
    def expand_ipv6(address)
      # Use IPAddr to properly expand IPv6
      IPAddr.new(address).to_s.downcase
    rescue IPAddr::InvalidAddressError
      # Fallback to manual expansion for edge cases
      hextets_abbrev = address.split(':')
      hextets_abbrev.pop if hextets_abbrev.last == ''
      hextets_abbrev.shift if hextets_abbrev.first == ''
      
      # Add leading zeros and expand :: notation
      hextets = hextets_abbrev.map { |item| item.empty? ? '' : item.rjust(4, '0') }
      
      if hextets.include?('')
        empty_index = hextets.index('')
        missing_count = 9 - hextets.length
        hextets[empty_index, 1] = ['0000'] * missing_count
      end
      
      hextets.join(':')
    end
    
    # Populate boolean policy items in JWT payload
    #
    # @param token_policy [Hash] Token generation policy
    # @param viewer_attributes [Hash] Viewer's attributes
    # @param jwt_payload [Hash] JWT payload being constructed
    # @return [Hash] Hash with :jwt_payload and :intsig_input
    #
    def populate_boolean_items(token_policy, viewer_attributes, jwt_payload)
      intsig_input = ''
      
      if token_policy[:ip] || token_policy['ip']
        populated_ip = populate_ip(viewer_attributes, jwt_payload)
        jwt_payload = populated_ip[:jwt_payload]
        jwt_payload[:ip] = true
        intsig_input += "#{populated_ip[:full_ip]}:"
      end
      
      if token_policy[:co] || token_policy['co']
        jwt_payload[:co] = true
        co_value = viewer_attributes[:co] || viewer_attributes['co']
        intsig_input += "#{co_value}:" if co_value
        jwt_payload[:co_fallback] = true if token_policy[:co_fallback] || token_policy['co_fallback']
      end
      
      if token_policy[:cty] || token_policy['cty']
        jwt_payload[:cty] = true
        cty_value = viewer_attributes[:cty] || viewer_attributes['cty']
        intsig_input += "#{cty_value}:" if cty_value
      end
      
      if token_policy[:reg] || token_policy['reg']
        jwt_payload[:reg] = true
        reg_value = viewer_attributes[:reg] || viewer_attributes['reg']
        intsig_input += "#{reg_value}:" if reg_value
        jwt_payload[:reg_fallback] = true if token_policy[:reg_fallback] || token_policy['reg_fallback']
      end
      
      if token_policy[:ssn] || token_policy['ssn']
        jwt_payload[:ssn] = true
        session_id = viewer_attributes[:sessionId] || viewer_attributes['sessionId']
        if session_id
          @payload_ssn = session_id
        else
          auto_gen_length = token_policy[:session_auto_generate] || token_policy['session_auto_generate'] || 12
          session = Session.new(auto_gen_length, autogenerate: true)
          @payload_ssn = session.id
        end
        intsig_input += "#{@payload_ssn}:"
      end
      
      { jwt_payload: jwt_payload, intsig_input: intsig_input }
    end
    
    # Populate expiration time in JWT payload
    #
    # @param token_policy [Hash] Token generation policy
    # @param jwt_payload [Hash] JWT payload being constructed
    # @return [Hash] Updated JWT payload
    # @raise [ValidationError] if expiration format is invalid
    #
    def populate_exp(token_policy, jwt_payload)
      exp = token_policy[:exp] || token_policy['exp']
      
      if exp.start_with?('+')
        current_time = Time.now.to_i
        if exp.end_with?('h')
          jwt_payload[:exp] = current_time + exp[1..-2].to_i * 3600
        elsif exp.end_with?('m')
          jwt_payload[:exp] = current_time + exp[1..-2].to_i * 60
        else
          raise ValidationError, 'Invalid exp format'
        end
      else
        parsed_exp = exp.to_i
        raise ValidationError, 'Invalid exp format' if parsed_exp <= 0
        
        jwt_payload[:exp] = parsed_exp
      end
      
      jwt_payload
    end
    
    # Populate the complete JWT payload
    #
    # @param token_policy [Hash] Token generation policy
    # @param viewer_attributes [Hash] Viewer's attributes
    # @param jwt_payload [Hash] JWT payload being constructed
    # @param playback_url_qs [Hash] Query string parameters from playback URL
    # @param secret_alias [Hash] Secret key information
    # @return [Hash] Complete JWT payload
    #
    def populate_jwt_payload(token_policy, viewer_attributes, jwt_payload, playback_url_qs, secret_alias)
      boolean_items = populate_boolean_items(token_policy, viewer_attributes, jwt_payload)
      jwt_payload = boolean_items[:jwt_payload]
      intsig_input = boolean_items[:intsig_input]
      
      headers_policy = token_policy[:headers] || token_policy['headers']
      if headers_policy && !headers_policy.empty?
        headers_policy.each do |header|
          jwt_payload[:headers] << header
          viewer_headers = viewer_attributes[:headers] || viewer_attributes['headers'] || {}
          header_value = viewer_headers[header] || viewer_headers[header.to_sym]
          intsig_input += "#{header_value}:" if header_value
        end
      end
      
      qs_policy = token_policy[:querystrings] || token_policy['querystrings']
      if qs_policy && !qs_policy.empty?
        qs_policy.each do |qs_param|
          jwt_payload[:qs] << qs_param
          qs_value = playback_url_qs[qs_param]
          unless qs_value
            viewer_qs = viewer_attributes[:qs] || viewer_attributes['qs'] || {}
            qs_value = viewer_qs[qs_param] || viewer_qs[qs_param.to_sym]
          end
          intsig_input += "#{qs_value}:" if qs_value
        end
      end
      
      if !intsig_input.empty?
        intsig_input = intsig_input.chomp(':')
        log("Input for internal signature: #{intsig_input}")
        jwt_payload[:intsig] = sign(intsig_input, secret_alias[:value], 'sha256')
      else
        jwt_payload.delete(:intsig)
      end
      
      jwt_payload[:paths] = token_policy[:paths] || token_policy['paths'] || []
      
      exc_policy = token_policy[:exc] || token_policy['exc']
      jwt_payload[:exc] = exc_policy if exc_policy
      
      nbf_policy = token_policy[:nbf] || token_policy['nbf']
      jwt_payload[:nbf] = nbf_policy.to_i if nbf_policy
      
      jwt_payload = populate_exp(token_policy, jwt_payload)
      
      jwt_payload
    end
  end
end
