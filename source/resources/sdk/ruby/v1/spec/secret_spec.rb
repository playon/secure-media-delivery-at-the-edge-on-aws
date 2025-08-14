# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

RSpec.describe AwsSecureMediaDelivery::Secret do
  let(:stack_name) { 'TestStack' }
  let(:ttl) { 300 }
  
  describe '#initialize' do
    it 'creates a new Secret instance with default parameters' do
      secret = described_class.new(stack_name: stack_name, ttl: ttl)
      
      expect(secret.stack_name).to eq(stack_name)
      expect(secret.ttl).to eq(ttl)
      expect(secret.retrieve_mode).to eq(:native)
      expect(secret.keys).to be_nil
    end
    
    it 'creates a new Secret instance with custom parameters' do
      custom_retriever = proc { |_| { primary: { uuid: 'test', value: 'test' } } }
      
      secret = described_class.new(
        stack_name: stack_name,
        ttl: ttl,
        retrieve_mode: :custom,
        retrieve_function: custom_retriever,
        retrieve_function_args: ['arg1']
      )
      
      expect(secret.retrieve_mode).to eq(:custom)
    end
  end
  
  describe '.set_debug' do
    it 'sets debug mode to true' do
      expect { described_class.set_debug(true) }.not_to raise_error
    end
    
    it 'sets debug mode to false' do
      expect { described_class.set_debug(false) }.not_to raise_error
    end
  end
  
  describe '.validate_keys' do
    context 'with valid primary-only keys' do
      let(:valid_keys) do
        {
          primary: {
            uuid: 'test-uuid',
            value: 'test-value'
          }
        }
      end
      
      it 'returns true' do
        expect(described_class.validate_keys(valid_keys)).to be true
      end
    end
    
    context 'with valid primary and secondary keys' do
      let(:valid_keys) do
        {
          primary: {
            uuid: 'test-uuid-1',
            value: 'test-value-1'
          },
          secondary: {
            uuid: 'test-uuid-2',
            value: 'test-value-2'
          }
        }
      end
      
      it 'returns true' do
        expect(described_class.validate_keys(valid_keys)).to be true
      end
    end
    
    context 'with string keys' do
      let(:valid_keys) do
        {
          'primary' => {
            'uuid' => 'test-uuid',
            'value' => 'test-value'
          }
        }
      end
      
      it 'returns true' do
        expect(described_class.validate_keys(valid_keys)).to be true
      end
    end
    
    context 'with invalid keys' do
      let(:invalid_keys) do
        {
          primary: {
            uuid: 'test-uuid'
            # Missing 'value'
          }
        }
      end
      
      it 'returns false' do
        expect(described_class.validate_keys(invalid_keys)).to be false
      end
    end
    
    context 'with non-hash input' do
      it 'returns false' do
        expect(described_class.validate_keys('invalid')).to be false
      end
    end
  end
  
  describe '#init_sm_client' do
    let(:secret) { described_class.new(stack_name: stack_name, ttl: ttl) }
    
    it 'initializes the Secrets Manager client' do
      allow(Aws::SecretsManager::Client).to receive(:new).and_return(double)
      
      result = secret.init_sm_client
      expect(result).to be true
    end
    
    it 'handles initialization errors' do
      allow(Aws::SecretsManager::Client).to receive(:new).and_raise(StandardError.new('Test error'))
      
      result = secret.init_sm_client
      expect(result).to be false
    end
  end
  
  describe '#retrieve_keys with custom function' do
    let(:custom_retriever) do
      proc do |stack_name|
        {
          primary: {
            uuid: "#{stack_name}-uuid",
            value: "#{stack_name}-value"
          }
        }
      end
    end
    
    let(:secret) do
      described_class.new(
        stack_name: stack_name,
        ttl: ttl,
        retrieve_mode: :custom,
        retrieve_function: custom_retriever,
        retrieve_function_args: [stack_name]
      )
    end
    
    it 'retrieves keys using custom function' do
      keys = secret.retrieve_keys
      
      expect(keys).to be_a(Hash)
      expect(keys[:primary][:uuid]).to eq("#{stack_name}-uuid")
      expect(keys[:primary][:value]).to eq("#{stack_name}-value")
    end
    
    it 'retrieves specific key alias' do
      key = secret.retrieve_keys(:primary)
      
      expect(key).to be_a(Hash)
      expect(key[:uuid]).to eq("#{stack_name}-uuid")
      expect(key[:value]).to eq("#{stack_name}-value")
    end
    
    it 'raises error for invalid keys from custom function' do
      invalid_retriever = proc { { invalid: 'structure' } }
      
      invalid_secret = described_class.new(
        stack_name: stack_name,
        ttl: ttl,
        retrieve_mode: :custom,
        retrieve_function: invalid_retriever
      )
      
      expect { invalid_secret.retrieve_keys }.to raise_error(AwsSecureMediaDelivery::SecretRetrievalError)
    end
  end
end
