// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const awsSMD = require('../aws-secure-media-delivery');

describe('Session Class', () => {
    let mockDDBClient;

    beforeEach(() => {
        mockDDBClient = {
            putItem: sinon.stub()
        };
        awsSMD.Session._ddbClient = mockDDBClient;
        awsSMD.Session.revocationTable = 'TestTable';
    });

    afterEach(() => {
        sinon.restore();
        awsSMD.Session._ddbClient = null;
        awsSMD.Session.revocationTable = '';
    });

    describe('Constructor', () => {
        it('should create a session with default parameters', () => {
            const session = new awsSMD.Session();
            expect(session.id).to.be.a('string');
            expect(session.id.length).to.equal(12);
            expect(session.suspicion_score).to.equal(0);
        });

        it('should create a session with custom ID', () => {
            const sessionId = 'custom-session-123';
            const session = new awsSMD.Session(sessionId);
            expect(session.id).to.equal(sessionId);
        });

        it('should create a session with auto-generated ID of specified length', () => {
            const session = new awsSMD.Session(16, true);
            expect(session.id).to.be.a('string');
            expect(session.id.length).to.equal(16);
            expect(session.id).to.match(/^[A-Za-z0-9]+$/);
        });

        it('should throw error for invalid auto-generation length', () => {
            expect(() => new awsSMD.Session(5, true)).to.throw('Invalid id input while autogenerate set to true');
        });

        it('should set suspicion score', () => {
            const session = new awsSMD.Session('test-id', false, 75);
            expect(session.suspicion_score).to.equal(75);
        });
    });

    describe('setDEBUG', () => {
        it('should set debug mode to true', () => {
            expect(() => awsSMD.Session.setDEBUG(true)).to.not.throw();
        });

        it('should set debug mode to false', () => {
            expect(() => awsSMD.Session.setDEBUG(false)).to.not.throw();
        });
    });

    describe('_autoGenerate', () => {
        it('should generate a string of specified length', () => {
            const result = awsSMD.Session._autoGenerate(20);
            expect(result).to.be.a('string');
            expect(result.length).to.equal(20);
            expect(result).to.match(/^[A-Za-z0-9]+$/);
        });

        it('should generate different strings on multiple calls', () => {
            const result1 = awsSMD.Session._autoGenerate(10);
            const result2 = awsSMD.Session._autoGenerate(10);
            expect(result1).to.not.equal(result2);
        });
    });

    describe('initialize', () => {
        it('should set the revocation table name', () => {
            const tableName = 'TestRevocationTable';
            // Mock initDBClient to avoid AWS SDK calls
            const initDBClientStub = sinon.stub(awsSMD.Session, 'initDBClient').returns(true);
            
            awsSMD.Session.initialize(tableName);
            
            expect(awsSMD.Session.revocationTable).to.equal(tableName);
            expect(initDBClientStub.calledOnce).to.be.true;
            
            initDBClientStub.restore();
        });
    });

    describe('revoke', () => {
        it('should successfully revoke a session', async () => {
            const session = new awsSMD.Session('test-session');
            mockDDBClient.putItem.resolves({});

            const result = await session.revoke(3600, 'TEST_REASON');

            expect(result).to.be.true;
            expect(mockDDBClient.putItem.calledOnce).to.be.true;
            
            const putItemCall = mockDDBClient.putItem.getCall(0);
            const params = putItemCall.args[0];
            expect(params.Item.session_id.S).to.equal('test-session');
            expect(params.Item.reason.S).to.equal('TEST_REASON');
            expect(params.TableName).to.equal('TestTable');
        });

        it('should handle DynamoDB errors', async () => {
            const session = new awsSMD.Session('test-session');
            mockDDBClient.putItem.rejects(new Error('DynamoDB error'));

            const result = await session.revoke();

            expect(result).to.be.false;
        });

        it('should throw error when client not initialized', async () => {
            awsSMD.Session._ddbClient = null;
            const session = new awsSMD.Session('test-session');

            try {
                await session.revoke();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include("DynamoDB client hasn't been initialized");
            }
        });

        it('should throw error when table name not set', async () => {
            awsSMD.Session.revocationTable = '';
            const session = new awsSMD.Session('test-session');

            try {
                await session.revoke();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Revocation Table name must be set');
            }
        });

        it('should include correct TTL and timestamps', async () => {
            const session = new awsSMD.Session('test-session', false, 50);
            mockDDBClient.putItem.resolves({});
            
            const expiryPeriod = 7200; // 2 hours
            const beforeTime = Math.floor(Date.now() / 1000);
            
            await session.revoke(expiryPeriod, 'SUSPICIOUS');
            
            const putItemCall = mockDDBClient.putItem.getCall(0);
            const params = putItemCall.args[0];
            
            expect(params.Item.score.N).to.equal('50');
            expect(params.Item.type.S).to.equal('MANUAL');
            
            const lastUpdated = parseInt(params.Item.last_updated.N);
            const ttl = parseInt(params.Item.ttl.N);
            
            expect(lastUpdated).to.be.at.least(beforeTime);
            expect(ttl).to.equal(lastUpdated + expiryPeriod);
        });
    });

    describe('Session ID validation', () => {
        it('should accept string session IDs', () => {
            const session = new awsSMD.Session('abc123');
            expect(session.id).to.equal('abc123');
        });

        it('should accept numeric session IDs for auto-generation', () => {
            const session = new awsSMD.Session(15, true);
            expect(session.id.length).to.equal(15);
        });

        it('should handle edge cases in auto-generation', () => {
            const session = new awsSMD.Session(7, true); // Minimum valid length
            expect(session.id.length).to.equal(7);
        });
    });

    describe('Integration with Token class', () => {
        it('should work with token generation that includes sessions', async () => {
            // This would be an integration test
            // For now, just verify that Session can be instantiated for token use
            const session = new awsSMD.Session(null, true);
            expect(session.id).to.be.a('string');
            expect(session.id.length).to.equal(12);
        });
    });
});
