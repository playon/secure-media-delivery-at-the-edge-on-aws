# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require_relative 'aws_secure_media_delivery/version'
require_relative 'aws_secure_media_delivery/secret'
require_relative 'aws_secure_media_delivery/token'
require_relative 'aws_secure_media_delivery/session'

# Ruby SDK for AWS Secure Media Delivery at the Edge solution
#
# This module provides Ruby classes for generating secure tokens for media delivery
# at the edge using AWS CloudFront.
#
# @example Basic usage
#   secret = AwsSecureMediaDelivery::Secret.new(stack_name: 'MyStack', ttl: 300)
#   secret.init_sm_client
#   token = AwsSecureMediaDelivery::Token.new(secret)
#   
#   viewer_attributes = { ip: '192.168.1.1', co: 'US' }
#   token_policy = { ip: true, co: true, paths: ['/video/'], exp: '+2h' }
#   
#   signed_url = token.generate(viewer_attributes, playback_url, token_policy)
#
module AwsSecureMediaDelivery
  class Error < StandardError; end
  class ValidationError < Error; end
  class SecretRetrievalError < Error; end
  class TokenGenerationError < Error; end
  class SessionError < Error; end
end
