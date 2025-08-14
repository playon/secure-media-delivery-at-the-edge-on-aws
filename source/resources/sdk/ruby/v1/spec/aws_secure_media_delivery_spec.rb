# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

RSpec.describe AwsSecureMediaDelivery do
  it 'has a version number' do
    expect(AwsSecureMediaDelivery::VERSION).not_to be nil
  end

  describe 'module structure' do
    it 'defines the main classes' do
      expect(defined?(AwsSecureMediaDelivery::Secret)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::Token)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::Session)).to be_truthy
    end

    it 'defines custom error classes' do
      expect(defined?(AwsSecureMediaDelivery::Error)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::ValidationError)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::SecretRetrievalError)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::TokenGenerationError)).to be_truthy
      expect(defined?(AwsSecureMediaDelivery::SessionError)).to be_truthy
    end
  end
end
