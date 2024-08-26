const axios = require('axios');
const timeoutUtils = require('automation/utils/utils');
const profile = require("automation/aws/aws_profiles");
const { TIMEOUT_5_MIN, TIMEOUT_TESTSUITE, TIMEOUT_20_MIN, TIMEOUT_45_MIN } = require('automation/utils/constants');
const testHelper = require('./helper');

// To hold information about the deployed stacks (vod and smd) 
let StackData = null;

/**
 * This test case has its dedicated function since it is used multiple times 
 * throughout the test suite
 */
const validTestCase = async (StackData) => {
    const demoUrl = testHelper.getSMDDemoUrl(StackData.smdStackOutputs);
    // this is the same video asset which we updated in the `beforeAll` hook above
    const tokenGenerateResult = await axios.get(`${demoUrl}/tokengenerate?id=1`);
    expect(tokenGenerateResult).toBeDefined();
    expect(tokenGenerateResult.status).toEqual(200);
    expect(tokenGenerateResult.data.playback_url).toBeDefined();

    const playbackUrl = tokenGenerateResult.data.playback_url;
    console.log(`playback url: ${playbackUrl}`);
    // Store the playback url to be re-used in next test case
    StackData.lastPlaybackUrl = playbackUrl;
    const videoPlaybackResult = await axios.get(playbackUrl);
    expect(videoPlaybackResult).toBeDefined();
    expect(videoPlaybackResult.status).toEqual(200);
}

describe('Secure Media Delivery Functional Tests', () => {
    beforeAll(async () => {
        console.log('Authenticating with test aws account');
        await testHelper.authenticateWithTestAccount();
        // Fetch stack details for Video on Demand on AWS See README.md within the solution's test folder for details
        console.log(`Fetching Deployed Stack Data`);
        StackData = await testHelper.fetchDeployedStackData();

        // test vod and smd stack resources are available
        expect(StackData.vodStackResources).toBeDefined();
        expect(StackData.vodStackResources).not.toBeNull();
        expect(StackData.smdStackResources).toBeDefined();
        expect(StackData.smdStackResources).not.toBeNull();

        // test vod and smd stack outputs are available
        expect(StackData.vodStackOutputs).toBeDefined();
        expect(StackData.vodStackOutputs).not.toBeNull();
        expect(StackData.smdStackOutputs).toBeDefined();
        expect(StackData.smdStackOutputs).not.toBeNull();

        // Associate SMD TokenChecker CloudFront Function with VOD CloudFront
        console.log('Associating SMD TokenChecker with VOD CloudFront');
        await testHelper.associateSMDFunctionToVodCloudfront(StackData.vodStackResources, StackData.smdStackResources);

        // Update SMD HLS video asset with VOD's generated video asset
        console.log('Updating SMD video asset with VOD CloudFront Url');
        await testHelper.updateSMDVideoAssetWithVODGeneratedVideo(StackData.vodStackResources, StackData.smdStackResources);

        // Create Web ACL with SMD solution's Rule Group to block manually revoked session ids
        StackData.WebACL = await testHelper.createWebACL(StackData.vodStackResources, StackData.smdStackOutputs);

        // Enable VOD CloudFront Distribution
        console.log('Enabling VOD CloudFront Distribution');
        await testHelper.updateCloudFrontDistributionStatus(StackData.vodStackResources, true);

        // Wait until fresh resources stabilize e.g. VOD CloudFront
        console.log('2 Minute timeout for AWS resources to stabilize');
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofMinutes(2).getMilliseconds(),
        );
    }, TIMEOUT_5_MIN);

    beforeEach(async () => {
        console.log(`${process.env.CURRENT_STACK_REGION} :: ${process.env.CURRENT_STACK_NAME} :: Started Execution of :: ${expect.getState().currentTestName}`);
    }, TIMEOUT_5_MIN);
  
    afterEach(async () => {
        console.log(`${process.env.CURRENT_STACK_REGION} :: ${process.env.CURRENT_STACK_NAME} :: Finished Execution of :: ${expect.getState().currentTestName}`);
    }, TIMEOUT_5_MIN);

    afterAll(async () => {
        // When tests are finished, disassociate SMD resources from VOD resources
        // Otherwise, NW script won't be able to delete SMD stack properly.
        console.log('Resources Clean up started...');
        await testHelper.disAssociateSMDFunctionToVodCloudfront(StackData.vodStackResources);
        await testHelper.disAssociateWebACLWithCloudFront(StackData.vodStackResources);
        await testHelper.deleteWebACL(StackData.WebACL);
        // Additionally, disable unused resources until next run to save $ (Frugality mode ON)
        await testHelper.updateCloudFrontDistributionStatus(StackData.vodStackResources, false); // disable since won't be used until next test
        console.log('Resources Clean up finished.');
    });

    test('It should block from playing the video when token is invalid', async () => {
        const {host, path} = await testHelper.findVODProcessedVideoUrl(StackData.vodStackResources);
        // Store the results for re-use and avoid re-fetching from DynamoDB
        StackData.videoUrlHost = host;
        StackData.videoUrlPath = path;
        const fakeToken = 'real-fake-token';
        const videoUrl = `${host}/${fakeToken}${path}`;
        console.log(`Video Url with a Fake Token: ${videoUrl}`);
        const videoPlaybackResult = await axios.get(videoUrl, {
            validateStatus: (status) => status < 500,
        });
        expect(videoPlaybackResult).toBeDefined();
        expect(videoPlaybackResult.status).toBeGreaterThanOrEqual(401);
    });

    test('It should play the video when token is valid', async () => {
        await validTestCase(StackData);
    });

    test('It should block from playing when token is revoked', async () => {
        const demoUrl = testHelper.getSMDDemoUrl(StackData.smdStackOutputs);
        // Use the same playbackUrl from the previous test case
        const playbackUrl = StackData.lastPlaybackUrl;
        console.log(`playback url: ${playbackUrl}`);
        // Grab the token within the url (See Implementation guide on token's location in url)
        const token = playbackUrl
            .replace(`${StackData.videoUrlHost}/`, '')
            .replace(StackData.videoUrlPath, '');
        // Grab the sessionId from the token (See Implementation guide on session location in token)
        const sessionId = token.split('.')[0];
        // Revoke the token
        await axios.post(`${demoUrl}/sessionrevoke?sessionid=${sessionId}`);
        // Wait until Cloudfront recognizes the revoked session via WAF integration
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofSeconds(60).getMilliseconds(),
        );
        const videoPlaybackResult = await axios.get(playbackUrl, {
            validateStatus: (status) => status < 500,
        });
        expect(videoPlaybackResult).toBeDefined();
        expect(videoPlaybackResult.status).toEqual(403);
    }, TIMEOUT_5_MIN);
    
    test('It should block from playing when secrets are rotated', async () => {
        // Repeat validTestCase to re-generate a working plabackUrl
        await validTestCase(StackData);
        // rotate secrets used to generate token by executing SMD RotateSecret Step Function
        // secrets are rotated twice. The reason is because CloudFront function keeps track of the
        // old secret as well as the new one. By rotating twice, it will completely forget the old secret
        // which will prevent the token in the playbackUrl to be recognized by the CloudFront Function
        console.log('Rotating SMD secrets... Takes about 10 minutes...');
        for (let i = 0; i < 2; i++)  {
            await testHelper.rotateSMDSecrets(StackData.smdStackOutputs);
        }
        // playbackUrl should return 401
        const playbackUrl = StackData.lastPlaybackUrl;
        const videoPlaybackResult = await axios.get(playbackUrl, {
            validateStatus: (status) => status < 500,
        });
        expect(videoPlaybackResult).toBeDefined();
        expect(videoPlaybackResult.status).toEqual(401);
    }, TIMEOUT_45_MIN);

    test('It should play the video with a new token after secrets are rotated', async () => {
        await validTestCase(StackData);
    }, TIMEOUT_20_MIN);
}, TIMEOUT_TESTSUITE);