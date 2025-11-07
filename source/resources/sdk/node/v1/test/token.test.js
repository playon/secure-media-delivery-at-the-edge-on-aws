// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const awsSMD = require('../aws-secure-media-delivery');

describe('Token Class', () => {
    let mockSecret;
    let token;
    let testKeys;

    beforeEach(() => {
        testKeys = {
            primary: {
                uuid: 'test-key-uuid',
                value: 'test-secret-key-value'
            }
        };

        mockSecret = {
            retrieveKeys: sinon.stub().resolves(testKeys)
        };

        token = new awsSMD.Token(mockSecret);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Constructor', () => {
        it('should create a new Token instance', () => {
            expect(token.secret).to.equal(mockSecret);
            expect(token.defaultTokenPolicy).to.be.null;
        });

        it('should create a new Token instance with default policy', () => {
            const defaultPolicy = { ip: true, paths: ['/video/'] };
            const tokenWithPolicy = new awsSMD.Token(mockSecret, defaultPolicy);
            expect(tokenWithPolicy.defaultTokenPolicy).to.equal(defaultPolicy);
        });
    });

    describe('setDEBUG', () => {
        it('should set debug mode to true', () => {
            expect(() => awsSMD.Token.setDEBUG(true)).to.not.throw();
        });

        it('should set debug mode to false', () => {
            expect(() => awsSMD.Token.setDEBUG(false)).to.not.throw();
        });
    });

    describe('generate', () => {
        const viewerAttributes = {
            ip: '192.168.1.1',
            co: 'US'
        };

        const tokenPolicy = {
            ip: true,
            co: true,
            paths: ['/video/'],
            exp: '+1h'
        };

        beforeEach(() => {
            // Mock JWT signing
            sinon.stub(jwt, 'sign').returns('mock.jwt.token');
        });

        afterEach(() => {
            jwt.sign.restore();
        });

        it('should generate a standalone token without playback URL', async () => {
            const result = await token.generate(viewerAttributes, null, tokenPolicy);
            
            expect(result).to.be.a('string');
            expect(result).to.equal('mock.jwt.token');
            expect(mockSecret.retrieveKeys.calledOnce).to.be.true;
        });

        it('should generate a signed URL with playback URL', async () => {
            const playbackUrl = 'https://example.cloudfront.net/video/stream.m3u8';
            const result = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
            
            expect(result).to.be.a('string');
            expect(result).to.include('mock.jwt.token');
            expect(result).to.include('example.cloudfront.net');
        });

        it('should include session ID in token when policy requires it', async () => {
            const tokenPolicyWithSession = {
                ...tokenPolicy,
                ssn: true,
                session_auto_generate: 16
            };

            // Mock Session constructor
            const mockSessionId = 'test-session-id';
            sinon.stub(awsSMD, 'Session').returns({ id: mockSessionId });

            const result = await token.generate(viewerAttributes, null, tokenPolicyWithSession);
            
            expect(result).to.include(mockSessionId);
            expect(result).to.include('mock.jwt.token');
            
            awsSMD.Session.restore();
        });

        it('should throw error for invalid secret alias', async () => {
            try {
                await token.generate(viewerAttributes, null, tokenPolicy, 'invalid');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include("can't be found in the retrieved secret");
            }
        });

        it('should throw error when no token policy provided and no default', async () => {
            try {
                await token.generate(viewerAttributes);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('No token policy provided and no default policy set');
            }
        });

        it('should use default policy when no policy provided', async () => {
            const tokenWithDefault = new awsSMD.Token(mockSecret, tokenPolicy);
            
            const result = await tokenWithDefault.generate(viewerAttributes);
            
            expect(result).to.be.a('string');
            expect(mockSecret.retrieveKeys.calledOnce).to.be.true;
        });
    });

    describe('IP address handling', () => {
        const tokenPolicy = { ip: true, paths: ['/video/'], exp: '+1h' };

        beforeEach(() => {
            sinon.stub(jwt, 'sign').returns('mock.jwt.token');
        });

        afterEach(() => {
            jwt.sign.restore();
        });

        it('should handle IPv4 addresses', async () => {
            const viewerAttributes = { ip: '192.168.1.1' };
            
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
        });

        it('should handle IPv6 addresses', async () => {
            const viewerAttributes = { ip: '2001:db8::1' };
            
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
        });

        it('should throw error for invalid IP addresses', async () => {
            const viewerAttributes = { ip: 'invalid-ip' };
            
            try {
                await token.generate(viewerAttributes, null, tokenPolicy);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include("Invalid viewer's IP format");
            }
        });
    });

    describe('Expiration handling', () => {
        const viewerAttributes = { ip: '192.168.1.1' };

        beforeEach(() => {
            sinon.stub(jwt, 'sign').returns('mock.jwt.token');
        });

        afterEach(() => {
            jwt.sign.restore();
        });

        it('should handle relative hours expiration', async () => {
            const tokenPolicy = { ip: true, paths: ['/video/'], exp: '+2h' };
            
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
        });

        it('should handle relative minutes expiration', async () => {
            const tokenPolicy = { ip: true, paths: ['/video/'], exp: '+30m' };
            
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
        });

        it('should handle absolute timestamp expiration', async () => {
            const tokenPolicy = { ip: true, paths: ['/video/'], exp: '1640995200' };
            
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
        });

        it('should throw error for invalid expiration format', async () => {
            const tokenPolicy = { ip: true, paths: ['/video/'], exp: 'invalid' };
            
            try {
                await token.generate(viewerAttributes, null, tokenPolicy);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid exp format');
            }
        });
    });

    describe('Header and query string validation', () => {
        const viewerAttributes = {
            ip: '192.168.1.1',
            headers: {
                'user-agent': 'Mozilla/5.0...',
                'referer': 'https://example.com'
            },
            qs: {
                'quality': '1080p',
                'lang': 'en'
            }
        };

        const tokenPolicy = {
            ip: true,
            headers: ['user-agent', 'referer'],
            querystrings: ['quality'],
            paths: ['/video/'],
            exp: '+1h'
        };

        beforeEach(() => {
            sinon.stub(jwt, 'sign').returns('mock.jwt.token');
        });

        afterEach(() => {
            jwt.sign.restore();
        });

        it('should include headers and query strings in token generation', async () => {
            await expect(token.generate(viewerAttributes, null, tokenPolicy))
                .to.eventually.be.a('string');
            
            // Verify JWT was called with correct payload structure
            expect(jwt.sign.calledOnce).to.be.true;
            const jwtCall = jwt.sign.getCall(0);
            const payload = jwtCall.args[0];
            
            expect(payload.headers).to.include('user-agent');
            expect(payload.headers).to.include('referer');
            expect(payload.qs).to.include('quality');
        });
    });

    describe('URL modification', () => {
        const viewerAttributes = { ip: '192.168.1.1' };
        const tokenPolicy = { ip: true, paths: ['/video/'], exp: '+1h' };

        beforeEach(() => {
            sinon.stub(jwt, 'sign').returns('mock.jwt.token');
        });

        afterEach(() => {
            jwt.sign.restore();
        });

        it('should correctly insert token into playback URL', async () => {
            const playbackUrl = 'https://example.cloudfront.net/video/stream.m3u8';
            const result = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
            
            const urlParts = result.split('/');
            expect(urlParts[3]).to.equal('mock.jwt.token');
            expect(result).to.include('https://example.cloudfront.net');
            expect(result).to.include('video/stream.m3u8');
        });

        it('should handle URLs with query parameters', async () => {
            const playbackUrl = 'https://example.cloudfront.net/video/stream.m3u8?quality=1080p';
            const result = await token.generate(viewerAttributes, playbackUrl, tokenPolicy);
            
            expect(result).to.include('mock.jwt.token');
            expect(result).to.include('quality=1080p');
        });
    });

    describe('Integration tests', () => {
        it('should work with real JWT signing', async () => {
            // Don't mock JWT for this test
            const viewerAttributes = { ip: '192.168.1.1' };
            const tokenPolicy = { ip: true, paths: ['/video/'], exp: '+1h' };
            
            const result = await token.generate(viewerAttributes, null, tokenPolicy);
            
            expect(result).to.be.a('string');
            expect(result.split('.').length).to.equal(3); // JWT has 3 parts
            
            // Verify the token can be decoded
            const decoded = jwt.decode(result, { complete: true });
            expect(decoded.header.kid).to.equal(testKeys.primary.uuid);
            expect(decoded.payload.ip).to.be.true;
        });
    });
});
