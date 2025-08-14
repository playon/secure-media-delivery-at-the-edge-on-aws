# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

RSpec.describe AwsSecureMediaDelivery::Session do
  describe '#initialize' do
    context 'with default parameters' do
      let(:session) { described_class.new }
      
      it 'creates a session with auto-generated ID' do
        expect(session.id).to be_a(String)
        expect(session.id.length).to eq(12)
        expect(session.suspicion_score).to eq(0)
      end
    end
    
    context 'with custom session ID' do
      let(:session_id) { 'custom-session-123' }
      let(:session) { described_class.new(session_id) }
      
      it 'creates a session with the provided ID' do
        expect(session.id).to eq(session_id)
      end
    end
    
    context 'with auto-generation' do
      let(:session) { described_class.new(16, autogenerate: true) }
      
      it 'creates a session with auto-generated ID of specified length' do
        expect(session.id).to be_a(String)
        expect(session.id.length).to eq(16)
        expect(session.id).to match(/\A[A-Za-z0-9]+\z/)
      end
    end
    
    context 'with invalid auto-generation length' do
      it 'raises ValidationError for length <= 6' do
        expect { described_class.new(5, autogenerate: true) }
          .to raise_error(AwsSecureMediaDelivery::ValidationError)
      end
    end
    
    context 'with suspicion score' do
      let(:session) { described_class.new('test-id', suspicion_score: 75) }
      
      it 'sets the suspicion score' do
        expect(session.suspicion_score).to eq(75)
      end
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
  
  describe '.auto_generate' do
    it 'generates a string of specified length' do
      result = described_class.auto_generate(20)
      
      expect(result).to be_a(String)
      expect(result.length).to eq(20)
      expect(result).to match(/\A[A-Za-z0-9]+\z/)
    end
    
    it 'generates different strings on multiple calls' do
      result1 = described_class.auto_generate(10)
      result2 = described_class.auto_generate(10)
      
      expect(result1).not_to eq(result2)
    end
  end
  
  describe '.initialize' do
    let(:table_name) { 'TestRevocationTable' }
    
    it 'sets the revocation table name' do
      allow(described_class).to receive(:init_db_client).and_return(true)
      
      described_class.initialize(table_name)
      
      expect(described_class.class_variable_get(:@@revocation_table)).to eq(table_name)
    end
  end
  
  describe '.init_db_client' do
    it 'initializes the DynamoDB client' do
      allow(Aws::DynamoDB::Client).to receive(:new).and_return(double)
      
      result = described_class.init_db_client
      expect(result).to be true
    end
    
    it 'handles initialization errors' do
      allow(Aws::DynamoDB::Client).to receive(:new).and_raise(StandardError.new('Test error'))
      
      result = described_class.init_db_client
      expect(result).to be false
    end
  end
  
  describe '#revoke' do
    let(:session) { described_class.new('test-session') }
    let(:mock_client) { double('DynamoDB Client') }
    
    before do
      described_class.class_variable_set(:@@ddb_client, mock_client)
      described_class.class_variable_set(:@@revocation_table, 'TestTable')
    end
    
    it 'successfully revokes a session' do
      allow(mock_client).to receive(:put_item).and_return(true)
      
      result = session.revoke(expiry_period: 3600, reason: 'TEST_REASON')
      
      expect(result).to be true
      expect(mock_client).to have_received(:put_item) do |params|
        expect(params[:item]['session_id']['S']).to eq('test-session')
        expect(params[:item]['reason']['S']).to eq('TEST_REASON')
        expect(params[:table_name]).to eq('TestTable')
      end
    end
    
    it 'handles DynamoDB errors' do
      allow(mock_client).to receive(:put_item).and_raise(StandardError.new('DynamoDB error'))
      
      result = session.revoke
      
      expect(result).to be false
    end
    
    it 'raises error when client not initialized' do
      described_class.class_variable_set(:@@ddb_client, nil)
      
      expect { session.revoke }.to raise_error(AwsSecureMediaDelivery::SessionError)
    end
    
    it 'raises error when table name not set' do
      described_class.class_variable_set(:@@revocation_table, '')
      
      expect { session.revoke }.to raise_error(AwsSecureMediaDelivery::SessionError)
    end
  end
end
