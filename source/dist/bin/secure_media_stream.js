#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const opts_1 = require("../helpers/opts");
require("source-map-support/register");
const secure_media_stream_stack_1 = require("../lib/secure_media_stream_stack");
const session_revocation_1 = require("../lib/session_revocation");
const app = new cdk.App();
// The stack environment.
//const cdkEnv = {
//    account: process.env.CDK_DEFAULT_ACCOUNT,
//    region: process.env.CDK_DEFAULT_REGION
//  };
(async () => {
    var _a, _b;
    // The stack configuration.
    const config = await opts_1.getOpts();
    new secure_media_stream_stack_1.SecureMediaStreamingStack(app, (_a = config.main) === null || _a === void 0 ? void 0 : _a.stack_name, config);
    if (config.sessionRevocation) {
        new session_revocation_1.SessionRevocationStack(app, ((_b = config.main) === null || _b === void 0 ? void 0 : _b.stack_name) + 'SessionRevocation', config);
    }
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlX21lZGlhX3N0cmVhbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2Jpbi9zZWN1cmVfbWVkaWFfc3RyZWFtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFtQztBQUNuQywwQ0FBMEM7QUFFMUMsdUNBQXFDO0FBQ3JDLGdGQUE2RTtBQUM3RSxrRUFBbUU7QUFFbkUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDMUIseUJBQXlCO0FBQ3pCLGtCQUFrQjtBQUNsQiwrQ0FBK0M7QUFDL0MsNENBQTRDO0FBQzVDLE1BQU07QUFFTixDQUFDLEtBQUssSUFBSSxFQUFFOztJQUNSLDJCQUEyQjtJQUMzQixNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQU8sRUFBRSxDQUFDO0lBRS9CLElBQUkscURBQXlCLENBQUMsR0FBRyxFQUFFLE1BQUEsTUFBTSxDQUFDLElBQUksMENBQUUsVUFBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLElBQUcsTUFBTSxDQUFDLGlCQUFpQixFQUFDO1FBQ3hCLElBQUksMkNBQXNCLENBQUMsR0FBRyxFQUFFLENBQUEsTUFBQSxNQUFNLENBQUMsSUFBSSwwQ0FBRSxVQUFXLElBQUcsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDM0Y7QUFHTCxDQUFDLENBQUMsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IGdldE9wdHMgfSBmcm9tICcuLi9oZWxwZXJzL29wdHMnO1xuXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XG5pbXBvcnQgeyBTZWN1cmVNZWRpYVN0cmVhbWluZ1N0YWNrIH0gZnJvbSAnLi4vbGliL3NlY3VyZV9tZWRpYV9zdHJlYW1fc3RhY2snO1xuaW1wb3J0IHsgU2Vzc2lvblJldm9jYXRpb25TdGFjayB9IGZyb20gJy4uL2xpYi9zZXNzaW9uX3Jldm9jYXRpb24nO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuLy8gVGhlIHN0YWNrIGVudmlyb25tZW50LlxuLy9jb25zdCBjZGtFbnYgPSB7XG4vLyAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuLy8gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT05cbi8vICB9O1xuXG4oYXN5bmMgKCkgPT4ge1xuICAgIC8vIFRoZSBzdGFjayBjb25maWd1cmF0aW9uLlxuICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IGdldE9wdHMoKTtcblxuICAgIG5ldyBTZWN1cmVNZWRpYVN0cmVhbWluZ1N0YWNrKGFwcCwgY29uZmlnLm1haW4/LnN0YWNrX25hbWUhLCBjb25maWcpO1xuICAgIGlmKGNvbmZpZy5zZXNzaW9uUmV2b2NhdGlvbil7XG4gICAgICAgIG5ldyBTZXNzaW9uUmV2b2NhdGlvblN0YWNrKGFwcCwgY29uZmlnLm1haW4/LnN0YWNrX25hbWUhICsgJ1Nlc3Npb25SZXZvY2F0aW9uJywgY29uZmlnKTtcbiAgICB9XG5cblxufSkoKTsiXX0=