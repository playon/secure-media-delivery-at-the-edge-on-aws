// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const s3 = require("automation/aws/s3");
const timeoutUtils = require('automation/utils/utils');
const listRegions = require("automation/aws/listregions");
const profile = require("automation/aws/aws_profiles");
const { getCredentials } = require('automation/aws/aws-profiles');

// Setup the AWS profile to be used.
const TEST_ACCOUNT_ROLE_ARN = `arn:aws:iam::${process.env.TEST_ACCOUNT_IDS}:role/NightsWatchTestPipelinesIamRole`;

async function cleanWAFGroups() {
    const { WAFV2Client, ListRuleGroupsCommand, DeleteRuleGroupCommand } = require('@aws-sdk/client-wafv2');

    const credentials = await getCredentials(TEST_ACCOUNT_ROLE_ARN);
    // waf will be interacting with the GLOBAL region and it requires region to be set to us-east-1
    const client = new WAFV2Client({ region: 'us-east-1', credentials });

    console.log("Fetching WAF Rule Groups")
    const listCommand = new ListRuleGroupsCommand({ Scope: "CLOUDFRONT" });
    const response = await client.send(listCommand)
    console.log(`Deleting ${response.RuleGroups.length} Rule groups`)
    for (const ruleGroup of response.RuleGroups) {
        const ruleGroupName = ruleGroup["Name"];
        const ruleGroupId = ruleGroup["Id"];
        const ruleGroupLockToken = ruleGroup["LockToken"];

        console.log(`Deleting Rule group with Name ${ruleGroupName}\nId ${ruleGroupId}`);
        const deleteCommand = new DeleteRuleGroupCommand({
            Scope: 'CLOUDFRONT',
            Name: ruleGroupName,
            Id: ruleGroupId,
            LockToken: ruleGroupLockToken,
        });
        await client.send(deleteCommand);

        // Wait until fresh resources stabilize e.g. VOD CloudFront
        console.log('5 seconds timeout before deleting next rule group');
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofSeconds(5).getMilliseconds(),
        );

        console.log(`Deleted Rule group with Name ${ruleGroupName}\nId ${ruleGroupId}`);
    }
}

async function cleanSSMParameters(region) {
    const { SSMClient, DescribeParametersCommand, DeleteParametersCommand } = require('@aws-sdk/client-ssm');

    const credentials = await getCredentials(TEST_ACCOUNT_ROLE_ARN);
    const client = new SSMClient({ region, credentials });

    let nextToken = null;

    console.log('Started SSM parameters cleanup');
    const describeParametersCommand = new DescribeParametersCommand();
    do {
        nextToken = null // reset nextToken
        console.log('Fetching SSM Parameters to delete')
        const response = await client.send(describeParametersCommand);
        // Filter parameters created by NW tests
        const parameterNames = response.Parameters.map(p => p.Name).filter(pName => pName.toLowerCase().startsWith('tcat') === true);

        if (parameterNames.length === 0) {
            console.log('All parameters deleted')
            break;
        }

        console.log(`Deleting ${parameterNames.length} parameters`);
        const deleteParametersCommand = new DeleteParametersCommand({
            Names: parameterNames,
        });
        await client.send(deleteParametersCommand)
        console.log(`Deleted ${parameterNames.length} parameters`);
        nextToken = response.NextToken;
        console.log('5 seconds timeout before deleting next set of parameters');
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofSeconds(5).getMilliseconds(),
        );
    } while (nextToken)
    console.log('Finished SSM parameters cleanup');
}

async function init() {
    // Clean up S3 buckets generated with NW tests
    console.log("Started S3 buckets cleanup");
    await s3.deleteS3BucketStartsWith("tcat-");
    console.log("Finished S3 buckets cleanup");

    // Clean up WAF Rule Groups
    console.log("Started WAF cleanup");
    await cleanWAFGroups();
    console.log("Finished WAF cleanup");


    // Setup the AWS profile to be used.
    await profile.setDefaultAccountCredentials(TEST_ACCOUNT_ROLE_ARN);
    // Execute for each region
    const regions = await listRegions.getRegions();
    for (const region of regions) {
        console.log(`Cleaning up for ${region} region`)
        // Clean up SSM Parameters
        await cleanSSMParameters(region);
        console.log('60 seconds timeout before deleting parameters in next region');
        await timeoutUtils.delay(
            timeoutUtils.Duration.ofSeconds(60).getMilliseconds(),
        );
    }
}

init();
