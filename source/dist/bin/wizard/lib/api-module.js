"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiModule = void 0;
const prompts = require("prompts");
const Joi = require("joi");
const handlers_1 = require("./handlers");
/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const apiQuestions = [
    {
        type: 'select',
        name: 'language',
        message: '[API] --> Choose the programming language for API code',
        choices: [
            { title: 'NodeJs', value: 'nodejs' },
            { title: 'Python', value: 'python' },
        ],
        initial: 1
    }
];
const selectAssetHosting = [{
        type: 'toggle',
        name: 'hosting',
        message: '[API] --> Do you want to configure your existing hosting used for asset delivery?',
        initial: true,
        active: 'yes',
        inactive: 'no'
    }];
const selectVideoStreamType = [{
        type: 'multiselect',
        name: 'value',
        message: '[API] --> Which video stream type would you like to configure?',
        min: 1,
        instructions: false,
        hint: '- Space to select. Return to submit. \'a\' to toggle all.',
        choices: [
            { title: 'HLS', value: 'hls' },
            { title: 'DASH', value: 'dash' },
        ]
    }];
function hostQuestions(type) {
    return [
        {
            type: 'text',
            name: 'hostname',
            message: '[API][' + type + '] --> Hostname used for asset delivery',
            validate: (value) => Joi.string().required().validate(value).error ?
                'Hostname is mandatory' : true
        },
        {
            type: 'text',
            name: 'url_path',
            message: '[API][' + type + '] --> URL path for existing playable asset',
            validate: (value) => Joi.string().required().validate(value).error ?
                'URL path for existing playable asset is mandatory' : true
        },
        {
            type: 'text',
            name: 'ttl',
            message: '[API][' + type + '] --> TTL for the token',
            validate: (value) => Joi.number().required().validate(value).error ?
                'TTL for the token is mandatory' : true
        }
    ];
}
const selectDemoWebsite = [{
        type: 'toggle',
        name: 'demo',
        message: '[API][Demo website] --> Do you want to deploy a demo website?',
        initial: true,
        active: 'yes',
        inactive: 'no'
    }];
const demoQuestions = [
    {
        type: 'text',
        name: 'username',
        message: '[API][Demo website] --> Username used to authenticate demo viewer',
        validate: (value) => Joi.string().required().validate(value).error ?
            'Username is mandatory' : true
    },
    {
        type: 'text',
        name: 'password',
        message: '[API][Demo website] --> Password used to authenticate demo viewer',
        validate: (value) => Joi.string().required().validate(value).error ?
            'Password is mandatory' : true
    },
];
class ApiModule {
    /**
     * Implements the logic to prompt questions to the user
     * and to fill the given configuration with the provided responses.
     * @param configuration an object in which the configuration must be stored.
     */
    async prompt(configuration) {
        console.log("\n--------------------- API Module -------------------\n");
        configuration.api = await prompts.prompt(apiQuestions, { onCancel: handlers_1.onCancel });
        const configureHosting = await prompts.prompt(selectAssetHosting, { onCancel: handlers_1.onCancel });
        if (configureHosting.hosting) {
            const streamType = await prompts.prompt(selectVideoStreamType, { onCancel: handlers_1.onCancel });
            if (streamType.value.includes('hls')) {
                configuration.hls = await prompts.prompt(hostQuestions('HLS'), { onCancel: handlers_1.onCancel });
            }
            if (streamType.value.includes('dash')) {
                configuration.dash = await prompts.prompt(hostQuestions('DASH'), { onCancel: handlers_1.onCancel });
            }
            console.log(configuration);
        }
        const configureDemo = await prompts.prompt(selectDemoWebsite, { onCancel: handlers_1.onCancel });
        if (configureDemo.demo) {
            configuration.demo = await prompts.prompt(demoQuestions, { onCancel: handlers_1.onCancel });
        }
        return (configuration);
    }
}
exports.ApiModule = ApiModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLW1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2Jpbi93aXphcmQvbGliL2FwaS1tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDJCQUEyQjtBQUUzQix5Q0FBc0M7QUFNdEM7OztHQUdHO0FBQ0gsTUFBTSxZQUFZLEdBQUc7SUFFckI7UUFDRSxJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxVQUFVO1FBQ2hCLE9BQU8sRUFBRSx3REFBd0Q7UUFDakUsT0FBTyxFQUFFO1lBQ1AsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUU7WUFDcEMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUc7U0FDdEM7UUFDRCxPQUFPLEVBQUUsQ0FBQztLQUNYO0NBQ0EsQ0FBQztBQUVGLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQztRQUMxQixJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLG1GQUFtRjtRQUM1RixPQUFPLEVBQUUsSUFBSTtRQUNiLE1BQU0sRUFBRSxLQUFLO1FBQ2IsUUFBUSxFQUFFLElBQUk7S0FDZixDQUFDLENBQUE7QUFFRixNQUFNLHFCQUFxQixHQUFHLENBQUM7UUFDN0IsSUFBSSxFQUFFLGFBQWE7UUFDbkIsSUFBSSxFQUFFLE9BQU87UUFDYixPQUFPLEVBQUUsZ0VBQWdFO1FBQ3pFLEdBQUcsRUFBRSxDQUFDO1FBQ04sWUFBWSxFQUFFLEtBQUs7UUFDbkIsSUFBSSxFQUFFLDJEQUEyRDtRQUNqRSxPQUFPLEVBQUU7WUFDUCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtZQUM5QixFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRztTQUNsQztLQUNGLENBQUMsQ0FBQTtBQUVGLFNBQVMs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T0FBTyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLFFBQVEsRUFBUixtQkFBUSxFQUFFLENBQUMsQ0FBQztZQUU5RSxJQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFDO2dCQUNsQyxhQUFhLENBQUMsR0FBRyxHQUFjLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQVIsbUJBQVEsRUFBRSxDQUFDLENBQUM7YUFDekY7WUFFRCxJQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFDO2dCQUNuQyxhQUFhLENBQUMsSUFBSSxHQUFjLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQVIsbUJBQVEsRUFBRSxDQUFDLENBQUM7YUFDM0Y7WUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1NBRTVCO1FBRUQsTUFBTSxhQUFhLEdBQUksTUFBTSxPQUFPLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsUUFBUSxFQUFSLG1CQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLElBQUcsYUFBYSxDQUFDLElBQUksRUFBQztZQUNwQixhQUFhLENBQUMsSUFBSSxHQUFXLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxRQUFRLEVBQVIsbUJBQVEsRUFBRSxDQUFDLENBQUM7U0FDaEY7UUFFRCxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDekIsQ0FBQztDQUNGO0FBcENELDhCQW9DQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHByb21wdHMgZnJvbSAncHJvbXB0cyc7XHJcbmltcG9ydCAqIGFzIEpvaSBmcm9tICdqb2knO1xyXG5pbXBvcnQgeyBQcm9tcHRDb21wb25lbnQgfSBmcm9tICcuL3Byb21wdC1jb21wb25lbnQnO1xyXG5pbXBvcnQgeyBvbkNhbmNlbCB9IGZyb20gJy4vaGFuZGxlcnMnO1xyXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9jb25maWd1cmF0aW9uJztcclxuaW1wb3J0IHsgSUFwaSB9IGZyb20gJy4uLy4uLy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9hcGknO1xyXG5pbXBvcnQgeyBJRGVtbyB9IGZyb20gJy4uLy4uLy4uL2hlbHBlcnMvdmFsaWRhdG9ycy9kZW1vJztcclxuaW1wb3J0IHsgSUhvc3RpbmcgfSBmcm9tICcuLi8uLi8uLi9oZWxwZXJzL3ZhbGlkYXRvcnMvaG9zdGluZyc7XHJcblxyXG4vKipcclxuICogQSBxdWVzdGlvbiBwcm9tcHRpbmcgdGhlIHVzZXIgZm9yIHRoZSBzZXNzaW9uIGludmFsaWRhdGlvblxyXG4gKiB0byBhbGxvY2F0ZSB0byBhIHByb3RvdHlwZS5cclxuICovXHJcbmNvbnN0IGFwaVF1ZXN0aW9ucyA9IFtcclxuXHJcbntcclxuICB0eXBlOiAnc2VsZWN0JyxcclxuICBuYW1lOiAnbGFuZ3VhZ2UnLFxyXG4gIG1lc3NhZ2U6ICdbQVBJXSAtLT4gQ2hvb3NlIHRoZSBwcm9ncmFtbWluZyBsYW5ndWFnZSBmb3IgQVBJIGNvZGUnLFxyXG4gIGNob2ljZXM6IFtcclxuICAgIHsgdGl0bGU6ICdOb2RlSnMnLCB2YWx1ZTogJ25vZGVqcycgfSxcclxuICAgIHsgdGl0bGU6ICdQeXRob24nLCB2YWx1ZTogJ3B5dGhvbicgIH0sXHJcbiAgXSxcclxuICBpbml0aWFsOiAxXHJcbn1cclxuXTtcclxuXHJcbmNvbnN0IHNlbGVjdEFzc2V0SG9zdGluZyA9IFt7XHJcbiAgdHlwZTogJ3RvZ2dsZScsXHJcbiAgbmFtZTogJ2hvc3RpbmcnLFxyXG4gIG1lc3NhZ2U6ICdbQVBJXSAtLT4gRG8geW91IHdhbnQgdG8gY29uZmlndXJlIHlvdXIgZXhpc3RpbmcgaG9zdGluZyB1c2VkIGZvciBhc3NldCBkZWxpdmVyeT8nLFxyXG4gIGluaXRpYWw6IHRydWUsXHJcbiAgYWN0aXZlOiAneWVzJyxcclxuICBpbmFjdGl2ZTogJ25vJ1xyXG59XVxyXG5cclxuY29uc3Qgc2VsZWN0VmlkZW9TdHJlYW1UeXBlID0gW3tcclxuICB0eXBlOiAnbXVsdGlzZWxlY3QnLFxyXG4gIG5hbWU6ICd2YWx1ZScsXHJcbiAgbWVzc2FnZTogJ1tBUEldIC0tPiBXaGljaCB2aWRlbyBzdHJlYW0gdHlwZSB3b3VsZCB5b3UgbGlrZSB0byBjb25maWd1cmU/JyxcclxuICBtaW46IDEsXHJcbiAgaW5zdHJ1Y3Rpb25zOiBmYWxzZSxcclxuICBoaW50OiAnLSBTcGFjZSB0byBzZWxlY3QuIFJldHVybiB0byBzdWJtaXQuIFxcJ2FcXCcgdG8gdG9nZ2xlIGFsbC4nLFxyXG4gIGNob2ljZXM6IFtcclxuICAgIHsgdGl0bGU6ICdITFMnLCB2YWx1ZTogJ2hscycgfSxcclxuICAgIHsgdGl0bGU6ICdEQVNIJywgdmFsdWU6ICdkYXNoJyAgfSxcclxuICBdXHJcbn1dXHJcblxyXG5mdW5jdGlvbiBob3N0UXVlc3Rpb25zICh0eXBlOiBzdHJpbmcpIHtcclxuICByZXR1cm4gIFtcclxuICAgIHtcclxuICAgICAgdHlwZTogJ3RleHQnLFxyXG4gICAgICBuYW1lOiAnaG9zdG5hbWUnLFxyXG4gICAgICBtZXNzYWdlOiAnW0FQSV1bJyArIHR5cGUgKyAnXSAtLT4gSG9zdG5hbWUgdXNlZCBmb3IgYXNzZXQgZGVsaXZlcnknLFxyXG4gICAgICB2YWxpZGF0ZTogKHZhbHVlOiBzdHJpbmcpID0+IEpvaS5zdHJpbmcoKS5yZXF1aXJlZCgpLnZhbGlkYXRlKHZhbHVlKS5lcnJvciA/XHJcbiAgICAgICdIb3N0bmFtZSBpcyBtYW5kYXRvcnknIDogdHJ1ZVxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgdHlwZTogJ3RleHQnLFxyXG4gICAgICBuYW1lOiAndXJsX3BhdGgnLFxyXG4gICAgICBtZXNzYWdlOiAnW0FQSV1bJyArIHR5cGUgKyAnXSAtLT4gVVJMIHBhdGggZm9yIGV4aXN0aW5nIHBsYXlhYmxlIGFzc2V0JyxcclxuICAgICAgdmFsaWRhdGU6ICh2YWx1ZTogc3RyaW5nKSA9PiBKb2kuc3RyaW5nKCkucmVxdWlyZWQoKS52YWxpZGF0ZSh2YWx1ZSkuZXJyb3IgP1xyXG4gICAgICAnVVJMIHBhdGggZm9yIGV4aXN0aW5nIHBsYXlhYmxlIGFzc2V0IGlzIG1hbmRhdG9yeScgOiB0cnVlXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICB0eXBlOiAndGV4dCcsXHJcbiAgICAgIG5hbWU6ICd0dGwnLFxyXG4gICAgICBtZXNzYWdlOiAnW0FQSV1bJyArIHR5cGUgKyAnXSAtLT4gVFRMIGZvciB0aGUgdG9rZW4nLFxyXG4gICAgICB2YWxpZGF0ZTogKHZhbHVlOiBzdHJpbmcpID0+IEpvaS5udW1iZXIoKS5yZXF1aXJlZCgpLnZhbGlkYXRlKHZhbHVlKS5lcnJvciA/XHJcbiAgICAgICdUVEwgZm9yIHRoZSB0b2tlbiBpcyBtYW5kYXRvcnknIDogdHJ1ZVxyXG4gICAgfVxyXG4gIF1cclxufVxyXG5cclxuY29uc3Qgc2VsZWN0RGVtb1dlYnNpdGUgPSBbe1xyXG4gIHR5cGU6ICd0b2dnbGUnLFxyXG4gIG5hbWU6ICdkZW1vJyxcclxuICBtZXNzYWdlOiAnW0FQSV1bRGVtbyB3ZWJzaXRlXSAtLT4gRG8geW91IHdhbnQgdG8gZGVwbG95IGEgZGVtbyB3ZWJzaXRlPycsXHJcbiAgaW5pdGlhbDogdHJ1ZSxcclxuICBhY3RpdmU6ICd5ZXMnLFxyXG4gIGluYWN0aXZlOiAnbm8nXHJcbn1dXHJcblxyXG5jb25zdCBkZW1vUXVlc3Rpb25zID0gW1xyXG5cclxuICB7XHJcbiAgICB0eXBlOiAndGV4dCcsXHJcbiAgICBuYW1lOiAndXNlcm5hbWUnLFxyXG4gICAgbWVzc2FnZTogJ1tBUEldW0RlbW8gd2Vic2l0ZV0gLS0+IFVzZXJuYW1lIHVzZWQgdG8gYXV0aGVudGljYXRlIGRlbW8gdmlld2VyJyxcclxuICAgIHZhbGlkYXRlOiAodmFsdWU6IHN0cmluZykgPT4gSm9pLnN0cmluZygpLnJlcXVpcmVkKCkudmFsaWRhdGUodmFsdWUpLmVycm9yID9cclxuICAgICAgJ1VzZXJuYW1lIGlzIG1hbmRhdG9yeScgOiB0cnVlXHJcbiAgfSxcclxuICB7XHJcbiAgICB0eXBlOiAndGV4dCcsXHJcbiAgICBuYW1lOiAncGFzc3dvcmQnLFxyXG4gICAgbWVzc2FnZTogJ1tBUEldW0RlbW8gd2Vic2l0ZV0gLS0+IFBhc3N3b3JkIHVzZWQgdG8gYXV0aGVudGljYXRlIGRlbW8gdmlld2VyJyxcclxuICAgIHZhbGlkYXRlOiAodmFsdWU6IHN0cmluZykgPT4gSm9pLnN0cmluZygpLnJlcXVpcmVkKCkudmFsaWRhdGUodmFsdWUpLmVycm9yID9cclxuICAgICAgJ1Bhc3N3b3JkIGlzIG1hbmRhdG9yeScgOiB0cnVlXHJcbiAgfSxcclxuXTtcclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQXBpTW9kdWxlIGltcGxlbWVudHMgUHJvbXB0Q29tcG9uZW50IHtcclxuXHJcbiAgLyoqXHJcbiAgICogSW1wbGVtZW50cyB0aGUgbG9naWMgdG8gcHJvbXB0IHF1ZXN0aW9ucyB0byB0aGUgdXNlclxyXG4gICAqIGFuZCB0byBmaWxsIHRoZSBnaXZlbiBjb25maWd1cmF0aW9uIHdpdGggdGhlIHByb3ZpZGVkIHJlc3BvbnNlcy5cclxuICAgKiBAcGFyYW0gY29uZmlndXJhdGlvbiBhbiBvYmplY3QgaW4gd2hpY2ggdGhlIGNvbmZpZ3VyYXRpb24gbXVzdCBiZSBzdG9yZWQuXHJcbiAgICovXHJcbiAgYXN5bmMgcHJvbXB0KGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJQ29uZmlndXJhdGlvbj4ge1xyXG4gICAgY29uc29sZS5sb2coXCJcXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQVBJIE1vZHVsZSAtLS0tLS0tLS0tLS0tLS0tLS0tXFxuXCIpXHJcbiAgICBjb25maWd1cmF0aW9uLmFwaSA9IDxJQXBpPiBhd2FpdCBwcm9tcHRzLnByb21wdChhcGlRdWVzdGlvbnMsIHsgb25DYW5jZWwgfSk7XHJcblxyXG4gICAgY29uc3QgY29uZmlndXJlSG9zdGluZyA9ICBhd2FpdCBwcm9tcHRzLnByb21wdChzZWxlY3RBc3NldEhvc3RpbmcsIHsgb25DYW5jZWwgfSk7XHJcblxyXG4gICAgaWYoY29uZmlndXJlSG9zdGluZy5ob3N0aW5nKXtcclxuXHJcbiAgICAgIGNvbnN0IHN0cmVhbVR5cGUgPSAgYXdhaXQgcHJvbXB0cy5wcm9tcHQoc2VsZWN0VmlkZW9TdHJlYW1UeXBlLCB7IG9uQ2FuY2VsIH0pO1xyXG5cclxuICAgICAgaWYoc3RyZWFtVHlwZS52YWx1ZS5pbmNsdWRlcygnaGxzJykpe1xyXG4gICAgICAgIGNvbmZpZ3VyYXRpb24uaGxzID0gPElIb3N0aW5nPiBhd2FpdCBwcm9tcHRzLnByb21wdChob3N0UXVlc3Rpb25zKCdITFMnKSwgeyBvbkNhbmNlbCB9KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYoc3RyZWFtVHlwZS52YWx1ZS5pbmNsdWRlcygnZGFzaCcpKXtcclxuICAgICAgICBjb25maWd1cmF0aW9uLmRhc2ggPSA8SUhvc3Rpbmc+IGF3YWl0IHByb21wdHMucHJvbXB0KGhvc3RRdWVzdGlvbnMoJ0RBU0gnKSwgeyBvbkNhbmNlbCB9KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc29sZS5sb2coY29uZmlndXJhdGlvbik7XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbmZpZ3VyZURlbW8gPSAgYXdhaXQgcHJvbXB0cy5wcm9tcHQoc2VsZWN0RGVtb1dlYnNpdGUsIHsgb25DYW5jZWwgfSk7XHJcbiAgICBpZihjb25maWd1cmVEZW1vLmRlbW8pe1xyXG4gICAgICBjb25maWd1cmF0aW9uLmRlbW8gPSA8SURlbW8+IGF3YWl0IHByb21wdHMucHJvbXB0KGRlbW9RdWVzdGlvbnMsIHsgb25DYW5jZWwgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIChjb25maWd1cmF0aW9uKTtcclxuICB9XHJcbn0iXX0=