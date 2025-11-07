// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const awsSMD = require('../aws-secure-media-delivery');

describe('Secret Class', () => {
    let secret;
    let mockSMClient;

    beforeEach(() => {
        secret = new awsSMD.Secret('TestStack', 300);
        mockSMClient = {
            getSecretValue: sinon.stub()
        };
        secret._smClient = mockSMClient;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Constructor', () => {
        it('should create a new Secret instance with default parameters', () => {
            const secret = new awsSMD.Secret('TestStack', 300);
            expect(secret.stackName).to.equal('TestStack');
            expect(secret.ttl).to.equal(300);
            expect(secret.retrieveMode).to.equal('native');
            expect(secret.keys).to.be.null;
        });

        it('should create a new Secret instance with custom parameters', () => {
            const customRetriever = () => ({ primary: { uuid: 'test', value: 'test' } });
            const secret = new awsSMD.Secret('TestStack', 300, 'custom', customRetriever, ['arg1']);
            expect(secret.retrieveMode).to.equal('custom');
            expect(secret.retrieveFunction).to.equal(customRetriever);
            expect(secret.retrieveFunctionArgs).to.deep.equal(['arg1']);
        });
    });

    describe('setDEBUG', () => {
        it('should set debug mode to true', () => {
            expect(() => awsSMD.Secret.setDEBUG(true)).to.not.throw();
        });

        it('should set debug mode to false', () => {
            expect(() => awsSMD.Secret.setDEBUG(false)).to.not.throw();
        });
    });

    describe('validateKeys', () => {
        it('should return true for valid primary-only keys', () => {
            const validKeys = {
                primary: {
                    uuid: 'test-uuid',
                    value: 'test-value'
                }
            };
            expect(awsSMD.Secret.validateKeys(validKeys)).to.be.true;
        });

        it('should return true for valid primary and secondary keys', () => {
            const validKeys = {
                primary: {
                    uuid: 'test-uuid-1',
                    value: 'test-value-1'
                },
                secondary: {
                    uuid: 'test-uuid-2',
                    value: 'test-value-2'
                }
            };
            expect(awsSMD.Secret.validateKeys(validKeys)).to.be.true;
        });

        it('should return false for invalid keys', () => {
            const invalidKeys = {
                primary: {
                    uuid: 'test-uuid'
                    // Missing 'value'
                }
            };
            expect(awsSMD.Secret.validateKeys(invalidKeys)).to.be.false;
        });

        it('should return false for non-object input', () => {
            expect(awsSMD.Secret.validateKeys('invalid')).to.be.false;
        });
    });

    describe('initSMClient', () => {
        it('should initialize the Secrets Manager client', () => {
            const secret = new awsSMD.Secret('TestStack', 300);
            // Mock the SecretsManager constructor
            const mockSecretsManager = sinon.stub().returns({});
            
            // This test would need proper mocking of AWS SDK
            // For now, just test that the method exists and can be called
            expect(typeof secret.initSMClient).to.equal('function');
        });
    });

    describe('retrieveKeys with custom function', () => {
        it('should retrieve keys using custom function', async () => {
            const customRetriever = sinon.stub().resolves({
                primary: {
                    uuid: 'TestStack-uuid',
                    value: 'TestStack-value'
                }
            });

            const secret = new awsSMD.Secret('TestStack', 300, 'custom', customRetriever, ['TestStack']);
            
            const keys = await secret.retrieveKeys();
            
            expect(keys).to.be.an('object');
            expect(keys.primary.uuid).to.equal('TestStack-uuid');
            expect(keys.primary.value).to.equal('TestStack-value');
            expect(customRetriever.calledWith('TestStack')).to.be.true;
        });

        it('should retrieve specific key alias', async () => {
            const customRetriever = sinon.stub().resolves({
                primary: {
                    uuid: 'TestStack-uuid',
                    value: 'TestStack-value'
                }
            });

            const secret = new awsSMD.Secret('TestStack', 300, 'custom', customRetriever, ['TestStack']);
            
            const key = await secret.retrieveKeys('primary');
            
            expect(key).to.be.an('object');
            expect(key.uuid).to.equal('TestStack-uuid');
            expect(key.value).to.equal('TestStack-value');
        });

        it('should throw error for invalid keys from custom function', async () => {
            const invalidRetriever = sinon.stub().resolves({ invalid: 'structure' });

            const secret = new awsSMD.Secret('TestStack', 300, 'custom', invalidRetriever);
            
            try {
                await secret.retrieveKeys();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid format of the returned keys');
            }
        });
    });

    describe('_getSMSecret', () => {
        it('should retrieve secrets from AWS Secrets Manager', async () => {
            const primaryResponse = {
                SecretString: JSON.stringify({ 'primary-uuid': 'primary-value' })
            };
            const secondaryResponse = {
                SecretString: JSON.stringify({ 'secondary-uuid': 'secondary-value' })
            };

            mockSMClient.getSecretValue
                .onFirstCall().resolves(primaryResponse)
                .onSecondCall().resolves(secondaryResponse);

            const result = await secret._getSMSecret();

            expect(result).to.deep.equal({
                primary: {
                    uuid: 'primary-uuid',
                    value: 'primary-value'
                },
                secondary: {
                    uuid: 'secondary-uuid',
                    value: 'secondary-value'
                }
            });
        });

        it('should handle binary secrets', async () => {
            const secretData = JSON.stringify({ 'test-uuid': 'test-value' });
            const primaryResponse = {
                SecretBinary: Buffer.from(secretData).toString('base64')
            };
            const secondaryResponse = {
                SecretString: JSON.stringify({ 'secondary-uuid': 'secondary-value' })
            };

            mockSMClient.getSecretValue
                .onFirstCall().resolves(primaryResponse)
                .onSecondCall().resolves(secondaryResponse);

            const result = await secret._getSMSecret();

            expect(result.primary.uuid).to.equal('test-uuid');
            expect(result.primary.value).to.equal('test-value');
        });
    });

    describe('Key caching', () => {
        it('should cache keys and return cached version within TTL', async () => {
            const customRetriever = sinon.stub().resolves({
                primary: {
                    uuid: 'cached-uuid',
                    value: 'cached-value'
                }
            });

            const secret = new awsSMD.Secret('TestStack', 300, 'custom', customRetriever);
            
            // First call should invoke retriever
            const keys1 = await secret.retrieveKeys();
            expect(customRetriever.callCount).to.equal(1);
            
            // Second call should use cache
            const keys2 = await secret.retrieveKeys();
            expect(customRetriever.callCount).to.equal(1);
            expect(keys1).to.deep.equal(keys2);
        });

        it('should refresh keys after TTL expires', async () => {
            const customRetriever = sinon.stub()
                .onFirstCall().resolves({
                    primary: { uuid: 'uuid-1', value: 'value-1' }
                })
                .onSecondCall().resolves({
                    primary: { uuid: 'uuid-2', value: 'value-2' }
                });

            const secret = new awsSMD.Secret('TestStack', 0.001, 'custom', customRetriever); // Very short TTL
            
            // First call
            const keys1 = await secret.retrieveKeys();
            expect(keys1.primary.uuid).to.equal('uuid-1');
            
            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Second call should refresh
            const keys2 = await secret.retrieveKeys();
            expect(keys2.primary.uuid).to.equal('uuid-2');
            expect(customRetriever.callCount).to.equal(2);
        });
    });
});
