const AWS = require('aws-sdk');
const cloudformation = require('automation/aws/cloudformation');
const dynamodb = require('automation/aws/dynamodb');
const waf = require('automation/aws/waf');
const stepFunction = require('automation/aws/step_functions');
const timeoutUtils = require('automation/utils/utils');
const profile = require('automation/aws/aws_profiles');

let cloudfront; // variable will populated after test AWS account authentication

/**
 * Authenticates against test AWS Account
 */
const authenticateWithTestAccount = async () => {
    const roleARN = `arn:aws:iam::${process.env.TEST_ACCOUNT_IDS}:role/NightsWatchTestPipelinesIamRole`;
    await profile.setDefaultAccountCredentials(roleARN);
    cloudfront = new AWS.CloudFront(); // Creating new CloudFront instance here due to bug in NW Framework around cloudfront
    console.log('Authentication successful');
};

/**
 * Finds the VOD stack name from the list of stacks deployed
 * 
 * @param {*} stacks - list of stacks deployed in the test AWS account
 * @returns 
 */
const findVideoOnDemandStackName = (stacks) => {
    // substring to look for in list of stacks
    const substring = 'video-on-demand-on-aws';
    for (const stack of stacks) {
        if (stack.StackName.includes(substring)) {
            return stack.StackName;
        }
    }
    return null;
};

/**
 * Fetch VOD and SMD stack resources
 * 
 * @returns {
 *     vodStackResources: [*] - The vod stack resources,
 *     smdStackResources: [*] - The smd stack resources,
 * }
 */
const fetchDeployedStackData = async () => {
    // deployed stacks in account
    console.log('Fetching Deployed Stacks');
    const stacks = await cloudformation.listStacks();
    console.log(`Deployed Stacks: ${JSON.stringify(stacks, null, 2)}`);
    // find the vod stack and grab its stackName
    const vodStackName = findVideoOnDemandStackName(stacks);
    // list resources for vod stack
    const vodStackResources = await cloudformation.getStackResources(vodStackName, process.env.CURRENT_STACK_REGION);
    // list outputs for vod stack
    const vodStackOutputs = await cloudformation.readOutputsTab(vodStackName);
    // list resources for smd stack
    const smdStackResources = await cloudformation.getStackResources(process.env.CURRENT_STACK_NAME, process.env.CURRENT_STACK_REGION);
    // list outputs for smd stack
    const smdStackOutputs = await cloudformation.readOutputsTab(process.env.CURRENT_STACK_NAME);
    return {
        vodStackResources,
        vodStackOutputs,
        smdStackResources,
        smdStackOutputs,
    }
};

const filterResourcesByType = (resources, resourceType) => {
    return resources.filter(resource => resource.ResourceType === resourceType);
};

/**
 * Associate VOD Cloudfront Distribution with JWT Token Check function from SMD
 * 
 * @param {[*]} vodResources - VOD Stack Resources
 * @param {[*]} smdResources - SMD Stack Resources
 */
const associateSMDFunctionToVodCloudfront = async (vodResources, smdResources) => {
    // Find the cloudfront distribution resource from the full resource list in stack (there is only one such resource)
    const [{ PhysicalResourceId: vodCloudfrontDistributionId}] = filterResourcesByType(vodResources, 'AWS::CloudFront::Distribution');
    // Get functionArn for SMD cloudfront function (there is only one such resource)
    const [{ PhysicalResourceId: smdCheckTokenFunctionArn}] = filterResourcesByType(smdResources, 'AWS::CloudFront::Function');
    // Fetch cloudfront distribution details
    console.log(`VOD CloudFront Id: ${vodCloudfrontDistributionId}`);
    console.log(`SMD CloudFront Function ARN: ${smdCheckTokenFunctionArn}`);
    const vodCloudfrontDistribution = await cloudfront.getDistribution({ Id: vodCloudfrontDistributionId }).promise();
    
    // Following steps will associate Secure Media Delivery Cloudfront Function with VOD cloudfront distribution

    // There is only a single cache behavior for VOD cloudfront distribution
    vodCloudfrontDistribution.Distribution.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Quantity = 1;
    vodCloudfrontDistribution.Distribution.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items = [{
        FunctionARN: smdCheckTokenFunctionArn,
        EventType: 'viewer-request',
    }];
    // Update VOD Cloudfront Distribution
    await cloudfront.updateDistribution({
        Id: vodCloudfrontDistribution.Distribution.Id,
        DistributionConfig: vodCloudfrontDistribution.Distribution.DistributionConfig,
        IfMatch: vodCloudfrontDistribution.ETag,
    }).promise();
};

/**
 * Disassociate VOD Cloudfront Distribution with JWT Token Check function from SMD
 * 
 * @param {[*]} vodResources - VOD Stack Resources
 */
const disAssociateSMDFunctionToVodCloudfront = async (vodResources) => {
    // Find the cloudfront distribution resource from the full resource list in stack (there is only one such resource)
    const [{ PhysicalResourceId: vodCloudfrontDistributionId}] = filterResourcesByType(vodResources, 'AWS::CloudFront::Distribution');
    console.log(`VOD CloudFront Id: ${vodCloudfrontDistributionId}`);
    // Fetch cloudfront distribution details
    const vodCloudfrontDistribution = await cloudfront.getDistribution({ Id: vodCloudfrontDistributionId }).promise();
    // Clear out FunctionAssociations
    vodCloudfrontDistribution.Distribution.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Quantity = 0;
    vodCloudfrontDistribution.Distribution.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items = [];
    // Update VOD Cloudfront Distribution
    // Update VOD Cloudfront Distribution
    await cloudfront.updateDistribution({
        Id: vodCloudfrontDistribution.Distribution.Id,
        DistributionConfig: vodCloudfrontDistribution.Distribution.DistributionConfig,
        IfMatch: vodCloudfrontDistribution.ETag,
    }).promise();
};

/**
 * Returns the video url from VOD's results in DynamoDB
 * 
 * @param {*} vodResources  - VOD Stack Resources
 */
const findVODProcessedVideoUrl = async (vodResources) => {
    const [dynamoDBTable] = filterResourcesByType(vodResources, 'AWS::DynamoDB::Table');
    const { Items } = await dynamodb.scanTable(dynamoDBTable.PhysicalResourceId);
    if (Items && Items.length > 0) {
        const vodVideoUrlString = Items[0].hlsUrl.S;
        const vodVideoUrl = new URL(vodVideoUrlString);
        return {
            host: `${vodVideoUrl.protocol}//${vodVideoUrl.hostname}`,
            path: vodVideoUrl.pathname,
        };
    }
    throw new Error('VOD HLS Video not found. Please process a video with VOD before running the SMD functional tests...');
}

const findSMDVideoAssetsTable = (smdResources) => {
    const [{ PhysicalResourceId }] = filterResourcesByType(smdResources, 'AWS::DynamoDB::Table')
        .filter(dynamoDBTable => dynamoDBTable.PhysicalResourceId.includes('ApiDemoTable'));
    return PhysicalResourceId;
}

/**
 * Updates SMD HLS Video url with VOD's generated video url
 */
const updateSMDVideoAssetWithVODGeneratedVideo = async (vodResources, smdResources) => {
    const {host, path} = await findVODProcessedVideoUrl(vodResources);
    const smdVideoAssetDynamoDbTableName = findSMDVideoAssetsTable(smdResources);
    // Update SMD HLS video asset url
    await dynamodb.updateItem(
        smdVideoAssetDynamoDbTableName,
        { id: { S: '1' } },
        {
            ExpressionAttributeValues: {
                ':host': { S: host },
                ':path': { S: path }
            },
            UpdateExpression: `SET endpoint_hostname = :host, url_path = :path`
        },
    );
};

/**
 * Get url for SMD's test dashboard
 */
const getSMDDemoUrl = (smdOutputs) => {
    const [{ OutputValue }] = smdOutputs.filter(output => output.Description === 'Demo Website');
    return OutputValue;
};

/**
 * Create a Web ACL with the SMD Rule Group to deny viewers access if their session is revoked.
 */
const createWebACL = async (vodResources, smdOutputs) => {
    // Find the SMC Rule Group ARN
    const [{ OutputValue: smdRuleGroupArn}] = smdOutputs.filter(output => output.Description === 'WAF RuleGroup Name Arn');
    const createWebACLParams = {
        Name: 'smd-nw-test-web-acl' + process.env.CURRENT_STACK_NAME,
        Scope: 'CLOUDFRONT',
        DefaultAction: {
            Allow: {}, // action when rules do not match. Meaning, session is not in the block list
        },
        VisibilityConfig: {
            SampledRequestsEnabled: false, // disabling to save unused resources
            CloudWatchMetricsEnabled: true, // disabling to save unused resources
            MetricName: 'smd-nw-test-web-acl-cw',
        },
        Rules: [{
            Name: 'smd-nw-test-rule',
            Priority: 0,
            OverrideAction: {
                None: {},
            },
            Statement: {
                RuleGroupReferenceStatement: {
                    ARN: smdRuleGroupArn, // SMD rule group
                    ExcludedRules: [],
                }
            },
            VisibilityConfig: {
                SampledRequestsEnabled: false, // disabling to save unused resources
                CloudWatchMetricsEnabled: true, // disabling to save unused resources
                MetricName: 'smd-nw-test-web-acl-rule',
            }
        }]
    };
    // Make the request to Create Web ACL
    const { Summary: createdWebAcl } = await waf.createWebACL(createWebACLParams, 'us-east-1'); // waf region must be us-east-1 for cloudfront scope
    // Associate Web ACL with VOD CloudFront
    await associateWebACLWithCloudFront(vodResources, createdWebAcl.ARN);
    return createdWebAcl;
};

/**
 * Delete Web ACL
 */
const deleteWebACL = async (webACL) => {
    const deleteParams = {
        Name: webACL.Name,
        Scope: 'CLOUDFRONT',
        Id: webACL.Id,
        LockToken: webACL.LockToken,
    };
    // Make the request to Create Web ACL
    return waf.deleteWebACL(deleteParams, 'us-east-1'); // waf region must be us-east-1 for cloudfront scope
};

/**
 * Associate VOD CloudFront with SMD Web ACL
 * 
 * @param {*} vodResources 
 * @param {*} webAclArn 
 */
const associateWebACLWithCloudFront = async (vodResources, webAclArn) => {
    // Find the VOD CloudFront ARN
    const [{ PhysicalResourceId: vodCloudfrontDistributionId}] = filterResourcesByType(vodResources, 'AWS::CloudFront::Distribution');
    // Fetch cloudfront distribution details
    const vodCloudfrontDistribution = await cloudfront.getDistribution({ Id: vodCloudfrontDistributionId }).promise();
    // Clear out FunctionAssociations
    vodCloudfrontDistribution.Distribution.DistributionConfig.WebACLId = webAclArn;
    // Update VOD Cloudfront Distribution
    await cloudfront.updateDistribution({
        Id: vodCloudfrontDistribution.Distribution.Id,
        DistributionConfig: vodCloudfrontDistribution.Distribution.DistributionConfig,
        IfMatch: vodCloudfrontDistribution.ETag,
    }).promise();
};

/**
 * Disassociate VOD CloudFront with SMD Web ACL
 * 
 * @param {*} vodResources
 */
const disAssociateWebACLWithCloudFront = async (vodResources) => {
    // Find the VOD CloudFront ARN
    const [{ PhysicalResourceId: vodCloudfrontDistributionId}] = filterResourcesByType(vodResources, 'AWS::CloudFront::Distribution');
    // Fetch cloudfront distribution details
    const vodCloudfrontDistribution = await cloudfront.getDistribution({ Id: vodCloudfrontDistributionId }).promise();
    // Clear out FunctionAssociations
    vodCloudfrontDistribution.Distribution.DistributionConfig.WebACLId = '';
    // Update VOD Cloudfront Distribution
    await cloudfront.updateDistribution({
        Id: vodCloudfrontDistribution.Distribution.Id,
        DistributionConfig: vodCloudfrontDistribution.Distribution.DistributionConfig,
        IfMatch: vodCloudfrontDistribution.ETag,
    }).promise();
};

/**
 * Updates VOD CloudFront Distribution to enable/disable it.
 * 
 * @param {*} resources - stack resources to look for cloudfront distribution
 * @param {*} value - boolean value
 */
const updateCloudFrontDistributionStatus = async (resources, value) => {
    // Find the VOD CloudFront ARN
    const [{ PhysicalResourceId: cloudfrontDistributionId}] = filterResourcesByType(resources, 'AWS::CloudFront::Distribution');
    // Fetch cloudfront distribution details
    const vodCloudfrontDistribution = await cloudfront.getDistribution({ Id: cloudfrontDistributionId }).promise();
    // Enable Distribution
    vodCloudfrontDistribution.Distribution.DistributionConfig.Enabled = value;
    // Update VOD Cloudfront Distribution
    await cloudfront.updateDistribution({
        Id: vodCloudfrontDistribution.Distribution.Id,
        DistributionConfig: vodCloudfrontDistribution.Distribution.DistributionConfig,
        IfMatch: vodCloudfrontDistribution.ETag,
    }).promise();
};

/**
 * Find the SMD Rotate Secret Step Function Arn
 * 
 * @param {*} smdOutputs 
 */
const findSMDRorateSecretStepFunctionArn = async (smdOutputs) => {
    const [{ OutputValue: smdRotateSecretFunctionName }] = smdOutputs.filter(output => output.Description === 'The name of the Step Function to rotate secrets');
    const functions = await stepFunction.listStepFunctions();
    const [smdSecretRotateFunction] = functions.stateMachines.filter(stateMachine => stateMachine.name === smdRotateSecretFunctionName);
    return smdSecretRotateFunction.stateMachineArn;
}

/**
 * Executes the SMD step function to rotate secrets
 */
const rotateSMDSecrets = async (smdOutputs) => {
    const randomInteger = Math.floor(Math.random() * 1000); // randon number from 1 to 1000 to name the execution uniquely
    const smdRotateSecretFunctionArn = await findSMDRorateSecretStepFunctionArn(smdOutputs);
    const { executionArn } = await stepFunction.startExecution(
        smdRotateSecretFunctionArn,
        `NW_TEST_EXECUTION_${randomInteger}`,
    );
    const stepFunctionSdk = new AWS.StepFunctions();
    do {
        console.log('checking step function execution status');
        const { status } = await stepFunctionSdk.describeExecution({
            executionArn,
        }).promise();
        console.log(`step function status: ${status}`);
        if (status === 'SUCCEEDED') {
            console.log('step function finished running');
            break;
        }
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofSeconds(60).getMilliseconds(),
        );
    } while (true)
};

module.exports = {
    authenticateWithTestAccount,
    fetchDeployedStackData,
    associateSMDFunctionToVodCloudfront,
    disAssociateSMDFunctionToVodCloudfront,
    updateSMDVideoAssetWithVODGeneratedVideo,
    getSMDDemoUrl,
    findVODProcessedVideoUrl,
    createWebACL,
    disAssociateWebACLWithCloudFront,
    deleteWebACL,
    rotateSMDSecrets,
    updateCloudFrontDistributionStatus,
};
