"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainModule = void 0;
const Joi = require("joi");
const prompts = require("prompts");
const handlers_1 = require("./handlers");
/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const coreQuestions = [{
        type: 'text',
        name: 'stack_name',
        message: '[Base configuration] --> Stack name',
        validate: (value) => Joi.string().required().validate(value).error ?
            'The name of the stack is mandatory' : true
    }, {
        type: 'text',
        name: 'rotate_secrets_frequency',
        message: '[Base configuration] --> At what frequency do you want to rotate the secrets?\n (in minutes between 1 and 1440, type 0 to disable it)',
        validate: (value) => Joi.number().min(0).required().validate(value).error ?
            'The value must be a number superior or equal to 0' : true
    }];
class MainModule {
    /**
     * Implements the logic to prompt questions to the user
     * and to fill the given configuration with the provided responses.
     * @param configuration an object in which the configuration must be stored.
     */
    async prompt(configuration) {
        console.log("\n--------------------- Base configuration -------------------\n");
        configuration.main = await prompts.prompt(coreQuestions, { onCancel: handlers_1.onCancel });
        return (configuration);
    }
}
exports.MainModule = MainModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1tb2R1bGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9iaW4vd2l6YXJkL2xpYi9tYWluLW1vZHVsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwyQkFBMkI7QUFDM0IsbUNBQW1DO0FBR25DLHlDQUFzQztBQUl0Qzs7O0dBR0c7QUFDSCxNQUFNLGFBQWEsR0FBRyxDQUFDO1FBQ3JCLElBQUksRUFBRSxNQUFNO1FBQ1osSUFBSSxFQUFFLFlBQVk7UUFDbEIsT0FBTyxFQUFFLHFDQUFxQztRQUM5QyxRQUFRLEVBQUUsQ0FBQyxLQUFhLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUUsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLElBQUk7S0FDOUMsRUFBQztRQUNBLElBQUksRUFBRSxNQUFNO1FBQ1osSUFBSSxFQUFFLDBCQUEwQjtRQUNoQyxPQUFPLEVBQUUsdUlBQXVJO1FBQ2hKLFFBQVEsRUFBRSxDQUFDLEtBQWEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakYsbURBQW1ELENBQUMsQ0FBQyxDQUFDLElBQUk7S0FDN0QsQ0FBQyxDQUFDO0FBRUgsTUFBYSxVQUFVO0lBRXJCOzs7O09BSUc7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGFBQTZCO1FBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0VBQWtFLENBQUMsQ0FBQTtRQUMvRSxhQUFhLENBQUMsSUFBSSxHQUFXLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxRQUFRLEVBQVIsbUJBQVEsRUFBRSxDQUFDLENBQUM7UUFDL0UsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQVpELGdDQVlDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgSm9pIGZyb20gJ2pvaSc7XHJcbmltcG9ydCAqIGFzIHByb21wdHMgZnJvbSAncHJvbXB0cyc7XHJcblxyXG5pbXBvcnQgeyBQcm9tcHRDb21wb25lbnQgfSBmcm9tICcuL3Byb21wdC1jb21wb25lbnQnO1xyXG5pbXBvcnQgeyBvbkNhbmNlbCB9IGZyb20gJy4vaGFuZGxlcnMnO1xyXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9jb25maWd1cmF0aW9uJztcclxuaW1wb3J0IHsgSU1haW4gfSBmcm9tICcuLi8uLi8uLi9oZWxwZXJzL3ZhbGlkYXRvcnMvbWFpbic7XHJcblxyXG4vKipcclxuICogQSBxdWVzdGlvbiBwcm9tcHRpbmcgdGhlIHVzZXIgZm9yIHRoZSBzZXNzaW9uIGludmFsaWRhdGlvblxyXG4gKiB0byBhbGxvY2F0ZSB0byBhIHByb3RvdHlwZS5cclxuICovXHJcbmNvbnN0IGNvcmVRdWVzdGlvbnMgPSBbe1xyXG4gIHR5cGU6ICd0ZXh0JyxcclxuICBuYW1lOiAnc3RhY2tfbmFtZScsXHJcbiAgbWVzc2FnZTogJ1tCYXNlIGNvbmZpZ3VyYXRpb25dIC0tPiBTdGFjayBuYW1lJyxcclxuICB2YWxpZGF0ZTogKHZhbHVlOiBzdHJpbmcpID0+IEpvaS5zdHJpbmcoKS5yZXF1aXJlZCgpLnZhbGlkYXRlKHZhbHVlKS5lcnJvciA/XHJcbiAgICAnVGhlIG5hbWUgb2YgdGhlIHN0YWNrIGlzIG1hbmRhdG9yeScgOiB0cnVlXHJcbn0se1xyXG4gIHR5cGU6ICd0ZXh0JyxcclxuICBuYW1lOiAncm90YXRlX3NlY3JldHNfZnJlcXVlbmN5JyxcclxuICBtZXNzYWdlOiAnW0Jhc2UgY29uZmlndXJhdGlvbl0gLS0+IEF0IHdoYXQgZnJlcXVlbmN5IGRvIHlvdSB3YW50IHRvIHJvdGF0ZSB0aGUgc2VjcmV0cz9cXG4gKGluIG1pbnV0ZXMgYmV0d2VlbiAxIGFuZCAxNDQwLCB0eXBlIDAgdG8gZGlzYWJsZSBpdCknLFxyXG4gIHZhbGlkYXRlOiAodmFsdWU6IHN0cmluZykgPT4gSm9pLm51bWJlcigpLm1pbigwKS5yZXF1aXJlZCgpLnZhbGlkYXRlKHZhbHVlKS5lcnJvciA/XHJcbiAgICAnVGhlIHZhbHVlIG11c3QgYmUgYSBudW1iZXIgc3VwZXJpb3Igb3IgZXF1YWwgdG8gMCcgOiB0cnVlXHJcbn1dO1xyXG5cclxuZXhwb3J0IGNsYXNzIE1haW5Nb2R1bGUgaW1wbGVtZW50cyBQcm9tcHRDb21wb25lbnQge1xyXG5cclxuICAvKipcclxuICAgKiBJbXBsZW1lbnRzIHRoZSBsb2dpYyB0byBwcm9tcHQgcXVlc3Rpb25zIHRvIHRoZSB1c2VyXHJcbiAgICogYW5kIHRvIGZpbGwgdGhlIGdpdmVuIGNvbmZpZ3VyYXRpb24gd2l0aCB0aGUgcHJvdmlkZWQgcmVzcG9uc2VzLlxyXG4gICAqIEBwYXJhbSBjb25maWd1cmF0aW9uIGFuIG9iamVjdCBpbiB3aGljaCB0aGUgY29uZmlndXJhdGlvbiBtdXN0IGJlIHN0b3JlZC5cclxuICAgKi9cclxuICBhc3luYyBwcm9tcHQoY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElDb25maWd1cmF0aW9uPiB7XHJcbiAgICBjb25zb2xlLmxvZyhcIlxcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLSBCYXNlIGNvbmZpZ3VyYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLVxcblwiKVxyXG4gICAgY29uZmlndXJhdGlvbi5tYWluID0gPElNYWluPiBhd2FpdCBwcm9tcHRzLnByb21wdChjb3JlUXVlc3Rpb25zLCB7IG9uQ2FuY2VsIH0pO1xyXG4gICAgcmV0dXJuIChjb25maWd1cmF0aW9uKTtcclxuICB9XHJcbn0iXX0=