"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRevocationModule = void 0;
const Joi = require("joi");
const prompts = require("prompts");
const handlers_1 = require("./handlers");
/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const sessionRevocationQuestions = [{
        type: 'text',
        name: 'trigger_workflow_frequency',
        message: '[SESSION REVOCATION] --> At what frequency do you want to trigger the workflow to detect session to invalidate?\n (in minutes between 1 and 1440, type 0 to disable it) ',
        validate: (value) => Joi.number().min(0).required().validate(value).error ?
            'The value must be a number superior or equal to 0' : true
    },
    {
        type: 'text',
        name: 's3_logs_bucket_name',
        message: '[SESSION REVOCATION] --> Name of your existing the S3 Bucket where CloudFront logs are stored',
        validate: (value) => Joi.string().required().validate(value).error ?
            'The name of the bucket is mandatory' : true
    }];
class SessionRevocationModule {
    /**
     * Implements the logic to prompt questions to the user
     * and to fill the given configuration with the provided responses.
     * @param configuration an object in which the configuration must be stored.
     */
    async prompt(configuration) {
        console.log("\n--------------------- SESSION REVOCATION Module -------------------\n");
        configuration.sessionRevocation = await prompts.prompt(sessionRevocationQuestions, { onCancel: handlers_1.onCancel });
        return (configuration);
    }
}
exports.SessionRevocationModule = SessionRevocationModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi1yZXZvY2F0aW9uLW1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2Jpbi93aXphcmQvbGliL3Nlc3Npb24tcmV2b2NhdGlvbi1tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsMkJBQTJCO0FBQzNCLG1DQUFtQztBQUduQyx5Q0FBc0M7QUFJdEM7OztHQUdHO0FBQ0gsTUFBTSwwQkFBMEIsR0FBRyxDQUFDO1FBQ2xDLElBQUksRUFBRSxNQUFNO1FBQ1osSUFBSSxFQUFFLDRCQUE0QjtRQUNsQyxPQUFPLEVBQUUsMEtBQTBLO1FBQ25MLFFBQVEsRUFBRSxDQUFDLEtBQWEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakYsbURBQW1ELENBQUMsQ0FBQyxDQUFDLElBQUk7S0FDN0Q7SUFDRDtRQUNFLElBQUksRUFBRSxNQUFNO1FBQ1osSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixPQUFPLEVBQUUsK0ZBQStGO1FBQ3hHLFFBQVEsRUFBRSxDQUFDLEtBQWEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxRSxxQ0FBcUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUMvQyxDQUFDLENBQUM7QUFFSCxNQUFhLHVCQUF1QjtJQUVsQzs7OztPQUlHO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxhQUE2QjtRQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLHlFQUF5RSxDQUFDLENBQUE7UUFDdEYsYUFBYSxDQUFDLGlCQUFpQixHQUF3QixNQUFNLE9BQU8sQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsRUFBRSxRQUFRLEVBQVIsbUJBQVEsRUFBRSxDQUFDLENBQUM7UUFDdEgsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQVpELDBEQVlDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgSm9pIGZyb20gJ2pvaSc7XHJcbmltcG9ydCAqIGFzIHByb21wdHMgZnJvbSAncHJvbXB0cyc7XHJcblxyXG5pbXBvcnQgeyBQcm9tcHRDb21wb25lbnQgfSBmcm9tICcuL3Byb21wdC1jb21wb25lbnQnO1xyXG5pbXBvcnQgeyBvbkNhbmNlbCB9IGZyb20gJy4vaGFuZGxlcnMnO1xyXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9jb25maWd1cmF0aW9uJztcclxuaW1wb3J0IHsgSVNlc3Npb25SZXZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaGVscGVycy92YWxpZGF0b3JzL3Nlc3Npb24tcmV2b2NhdGlvbic7XHJcblxyXG4vKipcclxuICogQSBxdWVzdGlvbiBwcm9tcHRpbmcgdGhlIHVzZXIgZm9yIHRoZSBzZXNzaW9uIGludmFsaWRhdGlvblxyXG4gKiB0byBhbGxvY2F0ZSB0byBhIHByb3RvdHlwZS5cclxuICovXHJcbmNvbnN0IHNlc3Npb25SZXZvY2F0aW9uUXVlc3Rpb25zID0gW3tcclxuICB0eXBlOiAndGV4dCcsXHJcbiAgbmFtZTogJ3RyaWdnZXJfd29ya2Zsb3dfZnJlcXVlbmN5JyxcclxuICBtZXNzYWdlOiAnW1NFU1NJT04gUkVWT0NBVElPTl0gLS0+IEF0IHdoYXQgZnJlcXVlbmN5IGRvIHlvdSB3YW50IHRvIHRyaWdnZXIgdGhlIHdvcmtmbG93IHRvIGRldGVjdCBzZXNzaW9uIHRvIGludmFsaWRhdGU/XFxuIChpbiBtaW51dGVzIGJldHdlZW4gMSBhbmQgMTQ0MCwgdHlwZSAwIHRvIGRpc2FibGUgaXQpICcsXHJcbiAgdmFsaWRhdGU6ICh2YWx1ZTogc3RyaW5nKSA9PiBKb2kubnVtYmVyKCkubWluKDApLnJlcXVpcmVkKCkudmFsaWRhdGUodmFsdWUpLmVycm9yID9cclxuICAgICdUaGUgdmFsdWUgbXVzdCBiZSBhIG51bWJlciBzdXBlcmlvciBvciBlcXVhbCB0byAwJyA6IHRydWVcclxufSxcclxue1xyXG4gIHR5cGU6ICd0ZXh0JyxcclxuICBuYW1lOiAnczNfbG9nc19idWNrZXRfbmFtZScsXHJcbiAgbWVzc2FnZTogJ1tTRVNTSU9OIFJFVk9DQVRJT05dIC0tPiBOYW1lIG9mIHlvdXIgZXhpc3RpbmcgdGhlIFMzIEJ1Y2tldCB3aGVyZSBDbG91ZEZyb250IGxvZ3MgYXJlIHN0b3JlZCcsXHJcbiAgdmFsaWRhdGU6ICh2YWx1ZTogc3RyaW5nKSA9PiBKb2kuc3RyaW5nKCkucmVxdWlyZWQoKS52YWxpZGF0ZSh2YWx1ZSkuZXJyb3IgP1xyXG4gICAgJ1RoZSBuYW1lIG9mIHRoZSBidWNrZXQgaXMgbWFuZGF0b3J5JyA6IHRydWVcclxufV07XHJcblxyXG5leHBvcnQgY2xhc3MgU2Vzc2lvblJldm9jYXRpb25Nb2R1bGUgaW1wbGVtZW50cyBQcm9tcHRDb21wb25lbnQge1xyXG5cclxuICAvKipcclxuICAgKiBJbXBsZW1lbnRzIHRoZSBsb2dpYyB0byBwcm9tcHQgcXVlc3Rpb25zIHRvIHRoZSB1c2VyXHJcbiAgICogYW5kIHRvIGZpbGwgdGhlIGdpdmVuIGNvbmZpZ3VyYXRpb24gd2l0aCB0aGUgcHJvdmlkZWQgcmVzcG9uc2VzLlxyXG4gICAqIEBwYXJhbSBjb25maWd1cmF0aW9uIGFuIG9iamVjdCBpbiB3aGljaCB0aGUgY29uZmlndXJhdGlvbiBtdXN0IGJlIHN0b3JlZC5cclxuICAgKi9cclxuICBhc3luYyBwcm9tcHQoY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElDb25maWd1cmF0aW9uPiB7XHJcbiAgICBjb25zb2xlLmxvZyhcIlxcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLSBTRVNTSU9OIFJFVk9DQVRJT04gTW9kdWxlIC0tLS0tLS0tLS0tLS0tLS0tLS1cXG5cIilcclxuICAgIGNvbmZpZ3VyYXRpb24uc2Vzc2lvblJldm9jYXRpb24gPSA8SVNlc3Npb25SZXZvY2F0aW9uPiBhd2FpdCBwcm9tcHRzLnByb21wdChzZXNzaW9uUmV2b2NhdGlvblF1ZXN0aW9ucywgeyBvbkNhbmNlbCB9KTtcclxuICAgIHJldHVybiAoY29uZmlndXJhdGlvbik7XHJcbiAgfVxyXG59Il19