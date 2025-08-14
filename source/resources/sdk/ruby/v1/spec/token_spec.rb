# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

RSpec.describe AwsSecureMediaDelivery::Token do
  let(:mock_secret) { double('Secret') }
  let(:token) { described_class.new(mock_secret) }
  
  let(:test_keys) do
    {
      primary: {
        uuid: 'test-key-uuid',
        value: 'test-secret-key-value'
      }
    }
  end
  
  describe '#initialize' do
    it 'creates a new Token instance' do
      expect(token.secret).to eq(mock_secret)
      expect(token.default_token_policy).to be_nil
    end
    
    it 'creates a new Token instance with default policy' do
      default_policy = { ip: true, paths: ['/video/'] }
      token_with_policy = described_class.new(mock_secret, default_policy)
      
      expect(token_with_policy.default_token_policy).to eq(default_policy)
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
  
  describe '#generate' do
    let(:viewer_attributes) do
      {
        ip: '192.168.1.1',
        co: 'US'
      }
    end
    
    let(:token_policy) do
      {
        ip: true,
        co: true,
        paths: ['/video/'],
        exp: '+1h'
      }
    end
    
    before do
      allow(mock_secret).to receive(:retrieve_keys).and_return(test_keys)
      allow(JWT).to receive(:encode).and_return('mock.jwt.token')
    end
    
    context 'without playback URL' do
      it 'generates a standalone token' do
        result = token.generate(viewer_attributes, nil, token_policy)
        
        expect(result).to be_a(String)
        expect(result).to eq('mock.jwt.token')
      end
    end
    
    context 'with playback URL' do
      let(:playback_url) { 'https://example.cloudfront.net/video/stream.m3u8' }
      
      it 'generates a signed URL' do
        result = token.generate(viewer_attributes, playback_url, token_policy)
        
        expect(result).to be_a(String)
        expect(result).to include('mock.jwt.token')
        expect(result).to include('example.cloudfront.net')
      end
    end
    
    context 'with session ID' do
      let(:token_policy_with_session) do
        token_policy.merge(ssn: true, session_auto_generate: 16)
      end
      
      it 'includes session ID in token' do
        allow(AwsSecureMediaDelivery::Session).to receive(:new).and_return(double(id: 'test-session-id'))
        
        result = token.generate(viewer_attributes, nil, token_policy_with_session)
        
        expect(result).to include('test-session-id')
        expect(result).to include('mock.jwt.token')
      end
    end
    
    context 'with invalid secret alias' do
      it 'raises ValidationError' do
        expect { token.generate(viewer_attributes, nil, token_policy, :invalid) }
          .to raise_error(AwsSecureMediaDelivery::ValidationError)
      end
    end
    
    context 'without token policy' do
      it 'raises ValidationError when no default policy' do
        expect { token.generate(viewer_attributes) }
          .to raise_error(AwsSecureMediaDelivery::ValidationError)
      end
      
      it 'uses default policy when available' do
        token_with_default = described_class.new(mock_secret, token_policy)
        
        result = token_with_default.generate(viewer_attributes)
        
        expect(result).to be_a(String)
      end
    end
  end
  
  describe 'IP address handling' do
    let(:viewer_attributes_ipv4) { { ip: '192.168.1.1' } }
    let(:viewer_attributes_ipv6) { { ip: '2001:db8::1' } }
    let(:viewer_attributes_invalid) { { ip: 'invalid-ip' } }
    
    let(:token_policy) { { ip: true, paths: ['/video/'], exp: '+1h' } }
    
    before do
      allow(mock_secret).to receive(:retrieve_keys).and_return(test_keys)
      allow(JWT).to receive(:encode).and_return('mock.jwt.token')
    end
    
    it 'handles IPv4 addresses' do
      expect { token.generate(viewer_attributes_ipv4, nil, token_policy) }
        .not_to raise_error
    end
    
    it 'handles IPv6 addresses' do
      expect { token.generate(viewer_attributes_ipv6, nil, token_policy) }
        .not_to raise_error
    end
    
    it 'raises error for invalid IP addresses' do
      expect { token.generate(viewer_attributes_invalid, nil, token_policy) }
        .to raise_error(AwsSecureMediaDelivery::TokenGenerationError)
    end
  end
  
  describe 'expiration handling' do
    let(:viewer_attributes) { { ip: '192.168.1.1' } }
    
    before do
      allow(mock_secret).to receive(:retrieve_keys).and_return(test_keys)
      allow(JWT).to receive(:encode).and_return('mock.jwt.token')
    end
    
    context 'with relative hours' do
      let(:token_policy) { { ip: true, paths: ['/video/'], exp: '+2h' } }
      
      it 'generates token with relative expiration' do
        expect { token.generate(viewer_attributes, nil, token_policy) }
          .not_to raise_error
      end
    end
    
    context 'with relative minutes' do
      let(:token_policy) { { ip: true, paths: ['/video/'], exp: '+30m' } }
      
      it 'generates token with relative expiration' do
        expect { token.generate(viewer_attributes, nil, token_policy) }
          .not_to raise_error
      end
    end
    
    context 'with absolute timestamp' do
      let(:token_policy) { { ip: true, paths: ['/video/'], exp: '1640995200' } }
      
      it 'generates token with absolute expiration' do
        expect { token.generate(viewer_attributes, nil, token_policy) }
          .not_to raise_error
      end
    end
    
    context 'with invalid expiration format' do
      let(:token_policy) { { ip: true, paths: ['/video/'], exp: 'invalid' } }
      
      it 'raises TokenGenerationError' do
        expect { token.generate(viewer_attributes, nil, token_policy) }
          .to raise_error(AwsSecureMediaDelivery::TokenGenerationError)
      end
    end
  end
  
  describe 'header and query string validation' do
    let(:viewer_attributes) do
      {
        ip: '192.168.1.1',
        headers: {
          'user-agent' => 'Mozilla/5.0...',
          'referer' => 'https://example.com'
        },
        qs: {
          'quality' => '1080p',
          'lang' => 'en'
        }
      }
    end
    
    let(:token_policy) do
      {
        ip: true,
        headers: ['user-agent', 'referer'],
        querystrings: ['quality'],
        paths: ['/video/'],
        exp: '+1h'
      }
    end
    
    before do
      allow(mock_secret).to receive(:retrieve_keys).and_return(test_keys)
      allow(JWT).to receive(:encode).and_return('mock.jwt.token')
    end
    
    it 'includes headers and query strings in token generation' do
      expect { token.generate(viewer_attributes, nil, token_policy) }
        .not_to raise_error
    end
  end
end
