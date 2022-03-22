#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prompts = require("prompts");
const fs = require("fs");
const path = require("path");
const session_revocation_module_1 = require("./lib/session-revocation-module");
const handlers_1 = require("./lib/handlers");
const main_module_1 = require("./lib/main-module");
const api_module_1 = require("./lib/api-module");
/**
 * A question prompting for the components of the Prototype
 * Engagement Pack to deploy to the sandbox account.
 */
const componentQuestion = {
    type: 'multiselect',
    name: 'value',
    message: 'Which optional module would you like to deploy ?',
    min: 0,
    instructions: false,
    hint: '- Space to select. Return to submit. \'a\' to toggle all.',
    choices: [
        { title: '[SESSION REVOCATION]', 'value': 'session-revocation' },
        { title: '[API]', 'value': 'api' },
    ]
};
/**
 * Prompts the user whether the configuration is valid
 * and should be written.
 */
const confirmConfigurationQuestion = {
    type: 'confirm',
    name: 'value',
    message: 'Please check your choices before saving the current configuration. Would you like to use it ?'
};
/**
 * A map between component identifiers and their instance.
 */
const moduleMap = {
    'main': new main_module_1.MainModule(),
    'session-revocation': new session_revocation_module_1.SessionRevocationModule(),
    'api': new api_module_1.ApiModule(),
};
/**
 * Prompts the user for different information and
 * returns the gathered configuration.
 */
const getConfiguration = async () => {
    const configuration = {};
    const mainComponent = new Array('main');
    const components = (await prompts.prompt(componentQuestion, { onCancel: handlers_1.onCancel })).value;
    const allComponents = mainComponent.concat(components);
    // Iterating over the component prompts.
    for (const item of allComponents) {
        const moduleImpl = moduleMap[item];
        if (moduleImpl) {
            try {
                await moduleImpl.prompt(configuration);
            }
            catch (e) {
                console.log(e.message);
                process.exit(0);
            }
        }
    }
    return (configuration);
};
(async () => {
    const configuration = await getConfiguration();
    // The pretty-printed version of the configuration.
    const data = JSON.stringify(configuration, null, 2);
    console.log("\n--------------------- Summary -------------------\n");
    // Prompting the user to confirm.
    const confirmation = await prompts.prompt(confirmConfigurationQuestion);
    if (!confirmation.value) {
        console.log(`The configuration has been rejected, exiting.`);
        process.exit(0);
    }
    // The path to the configuration file.
    const filePath = path.resolve(__dirname, '..', '..', '..', 'solution.context.json');
    // Writing the configuration.
    fs.writeFileSync(filePath, data);
    console.log(`\nThe configuration has been successfully written to ${filePath}.\nYou can now deploy the solution by running :\n\nnpx cdk deploy`);
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9iaW4vd2l6YXJkL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFtQztBQUNuQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRzdCLCtFQUEwRTtBQUUxRSw2Q0FBMEM7QUFDMUMsbURBQStDO0FBQy9DLGlEQUE2QztBQUU3Qzs7O0dBR0c7QUFDSCxNQUFNLGlCQUFpQixHQUFHO0lBQ3hCLElBQUksRUFBRSxhQUFhO0lBQ25CLElBQUksRUFBRSxPQUFPO0lBQ2IsT0FBTyxFQUFFLGtEQUFrRDtJQUMzRCxHQUFHLEVBQUUsQ0FBQztJQUNOLFlBQVksRUFBRSxLQUFLO0lBQ25CLElBQUksRUFBRSwyREFBMkQ7SUFDakUsT0FBTyxFQUFFO1FBQ1AsRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFO1FBQ2hFLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO0tBQ25DO0NBQ0YsQ0FBQztBQUVGOzs7R0FHRztBQUNGLE1BQU0sNEJBQTRCLEdBQUc7SUFDcEMsSUFBSSxFQUFFLFNBQVM7SUFDZixJQUFJLEVBQUUsT0FBTztJQUNiLE9BQU8sRUFBRSwrRkFBK0Y7Q0FDekcsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxTQUFTLEdBQXVDO0lBQ3BELE1BQU0sRUFBRSxJQUFJLHdCQUFVLEVBQUU7SUFDeEIsb0JBQW9CLEVBQUUsSUFBSSxtREFBdUIsRUFBRTtJQUNuRCxLQUFLLEVBQUUsSUFBSSxzQkFBUyxFQUFFO0NBQ3ZCLENBQUM7QUFHRjs7O0dBR0c7QUFDSCxNQUFNLGdCQUFnQixHQUFHLEtBQUssSUFBNkIsRUFBRTtJQUMzRCxNQUFNLGFBQWEsR0FBbUIsRUFBRSxDQUFDO0lBRXpDLE1BQU0sYUFBYSxHQUFHLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRXhDLE1BQU0sVUFBVSxHQUFzQixDQUFDLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLFFBQVEsRUFBUixtQkFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUNwRyxNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXZELHdDQUF3QztJQUN4QyxLQUFLLE1BQU0sSUFBSSxJQUFJLGFBQWEsRUFBRTtRQUNoQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbkMsSUFBSSxVQUFVLEVBQUU7WUFDZCxJQUFJO2dCQUNGLE1BQU0sVUFBVSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQzthQUN4QztZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN2QixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2pCO1NBQ0Y7S0FDRjtJQUVELE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN6QixDQUFDLENBQUM7QUFFRixDQUFDLEtBQUssSUFBSSxFQUFFO0lBQ1YsTUFBTSxhQUFhLEdBQUcsTUFBTSxnQkFBZ0IsRUFBRSxDQUFDO0lBRS9DLG1EQUFtRDtJQUNuRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1REFBdUQsQ0FBQyxDQUFBO0lBQ3BFLGlDQUFpQztJQUNqQyxNQUFNLFlBQVksR0FBRyxNQUFNLE9BQU8sQ0FBQyxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUV4RSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRTtRQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDN0QsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNqQjtJQUVELHNDQUFzQztJQUN0QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0lBRXBGLDZCQUE2QjtJQUM3QixFQUFFLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxRQUFRLG1FQUFtRSxDQUFDLENBQUM7QUFDbkosQ0FBQyxDQUFDLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcclxuaW1wb3J0ICogYXMgcHJvbXB0cyBmcm9tICdwcm9tcHRzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9oZWxwZXJzL3ZhbGlkYXRvcnMvY29uZmlndXJhdGlvbic7XHJcbmltcG9ydCB7IFNlc3Npb25SZXZvY2F0aW9uTW9kdWxlIH0gZnJvbSAnLi9saWIvc2Vzc2lvbi1yZXZvY2F0aW9uLW1vZHVsZSc7XHJcbmltcG9ydCB7IFByb21wdENvbXBvbmVudCB9IGZyb20gJy4vbGliL3Byb21wdC1jb21wb25lbnQnO1xyXG5pbXBvcnQgeyBvbkNhbmNlbCB9IGZyb20gJy4vbGliL2hhbmRsZXJzJztcclxuaW1wb3J0IHsgTWFpbk1vZHVsZSB9IGZyb20gJy4vbGliL21haW4tbW9kdWxlJztcclxuaW1wb3J0IHsgQXBpTW9kdWxlIH0gZnJvbSAnLi9saWIvYXBpLW1vZHVsZSc7XHJcblxyXG4vKipcclxuICogQSBxdWVzdGlvbiBwcm9tcHRpbmcgZm9yIHRoZSBjb21wb25lbnRzIG9mIHRoZSBQcm90b3R5cGVcclxuICogRW5nYWdlbWVudCBQYWNrIHRvIGRlcGxveSB0byB0aGUgc2FuZGJveCBhY2NvdW50LlxyXG4gKi9cclxuY29uc3QgY29tcG9uZW50UXVlc3Rpb24gPSB7XHJcbiAgdHlwZTogJ211bHRpc2VsZWN0JyxcclxuICBuYW1lOiAndmFsdWUnLFxyXG4gIG1lc3NhZ2U6ICdXaGljaCBvcHRpb25hbCBtb2R1bGUgd291bGQgeW91IGxpa2UgdG8gZGVwbG95ID8nLFxyXG4gIG1pbjogMCxcclxuICBpbnN0cnVjdGlvbnM6IGZhbHNlLFxyXG4gIGhpbnQ6ICctIFNwYWNlIHRvIHNlbGVjdC4gUmV0dXJuIHRvIHN1Ym1pdC4gXFwnYVxcJyB0byB0b2dnbGUgYWxsLicsXHJcbiAgY2hvaWNlczogW1xyXG4gICAgeyB0aXRsZTogJ1tTRVNTSU9OIFJFVk9DQVRJT05dJywgJ3ZhbHVlJzogJ3Nlc3Npb24tcmV2b2NhdGlvbicgfSxcclxuICAgIHsgdGl0bGU6ICdbQVBJXScsICd2YWx1ZSc6ICdhcGknIH0sXHJcbiAgXVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb21wdHMgdGhlIHVzZXIgd2hldGhlciB0aGUgY29uZmlndXJhdGlvbiBpcyB2YWxpZFxyXG4gKiBhbmQgc2hvdWxkIGJlIHdyaXR0ZW4uXHJcbiAqL1xyXG4gY29uc3QgY29uZmlybUNvbmZpZ3VyYXRpb25RdWVzdGlvbiA9IHtcclxuICB0eXBlOiAnY29uZmlybScsXHJcbiAgbmFtZTogJ3ZhbHVlJyxcclxuICBtZXNzYWdlOiAnUGxlYXNlIGNoZWNrIHlvdXIgY2hvaWNlcyBiZWZvcmUgc2F2aW5nIHRoZSBjdXJyZW50IGNvbmZpZ3VyYXRpb24uIFdvdWxkIHlvdSBsaWtlIHRvIHVzZSBpdCA/J1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEEgbWFwIGJldHdlZW4gY29tcG9uZW50IGlkZW50aWZpZXJzIGFuZCB0aGVpciBpbnN0YW5jZS5cclxuICovXHJcbmNvbnN0IG1vZHVsZU1hcDogeyBba2V5OiBzdHJpbmddOiBQcm9tcHRDb21wb25lbnQgfSA9IHtcclxuICAnbWFpbic6IG5ldyBNYWluTW9kdWxlKCksXHJcbiAgJ3Nlc3Npb24tcmV2b2NhdGlvbic6IG5ldyBTZXNzaW9uUmV2b2NhdGlvbk1vZHVsZSgpLFxyXG4gICdhcGknOiBuZXcgQXBpTW9kdWxlKCksXHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIFByb21wdHMgdGhlIHVzZXIgZm9yIGRpZmZlcmVudCBpbmZvcm1hdGlvbiBhbmRcclxuICogcmV0dXJucyB0aGUgZ2F0aGVyZWQgY29uZmlndXJhdGlvbi5cclxuICovXHJcbmNvbnN0IGdldENvbmZpZ3VyYXRpb24gPSBhc3luYyAoKTogUHJvbWlzZTxJQ29uZmlndXJhdGlvbj4gPT4ge1xyXG4gIGNvbnN0IGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uID0ge307XHJcblxyXG4gIGNvbnN0IG1haW5Db21wb25lbnQgPSBuZXcgQXJyYXkoJ21haW4nKTtcclxuXHJcbiAgY29uc3QgY29tcG9uZW50czogQXJyYXk8c3RyaW5nPiAgICAgPSAoYXdhaXQgcHJvbXB0cy5wcm9tcHQoY29tcG9uZW50UXVlc3Rpb24sIHsgb25DYW5jZWwgfSkpLnZhbHVlO1xyXG4gIGNvbnN0IGFsbENvbXBvbmVudHMgPSBtYWluQ29tcG9uZW50LmNvbmNhdChjb21wb25lbnRzKTtcclxuXHJcbiAgLy8gSXRlcmF0aW5nIG92ZXIgdGhlIGNvbXBvbmVudCBwcm9tcHRzLlxyXG4gIGZvciAoY29uc3QgaXRlbSBvZiBhbGxDb21wb25lbnRzKSB7XHJcbiAgICBjb25zdCBtb2R1bGVJbXBsID0gbW9kdWxlTWFwW2l0ZW1dO1xyXG5cclxuICAgIGlmIChtb2R1bGVJbXBsKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgbW9kdWxlSW1wbC5wcm9tcHQoY29uZmlndXJhdGlvbik7XHJcbiAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhlLm1lc3NhZ2UpO1xyXG4gICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIChjb25maWd1cmF0aW9uKTtcclxufTtcclxuXHJcbihhc3luYyAoKSA9PiB7XHJcbiAgY29uc3QgY29uZmlndXJhdGlvbiA9IGF3YWl0IGdldENvbmZpZ3VyYXRpb24oKTtcclxuXHJcbiAgLy8gVGhlIHByZXR0eS1wcmludGVkIHZlcnNpb24gb2YgdGhlIGNvbmZpZ3VyYXRpb24uXHJcbiAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KGNvbmZpZ3VyYXRpb24sIG51bGwsIDIpO1xyXG5cclxuICBjb25zb2xlLmxvZyhcIlxcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLSBTdW1tYXJ5IC0tLS0tLS0tLS0tLS0tLS0tLS1cXG5cIilcclxuICAvLyBQcm9tcHRpbmcgdGhlIHVzZXIgdG8gY29uZmlybS5cclxuICBjb25zdCBjb25maXJtYXRpb24gPSBhd2FpdCBwcm9tcHRzLnByb21wdChjb25maXJtQ29uZmlndXJhdGlvblF1ZXN0aW9uKTtcclxuXHJcbiAgaWYgKCFjb25maXJtYXRpb24udmFsdWUpIHtcclxuICAgIGNvbnNvbGUubG9nKGBUaGUgY29uZmlndXJhdGlvbiBoYXMgYmVlbiByZWplY3RlZCwgZXhpdGluZy5gKTtcclxuICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICB9XHJcblxyXG4gIC8vIFRoZSBwYXRoIHRvIHRoZSBjb25maWd1cmF0aW9uIGZpbGUuXHJcbiAgY29uc3QgZmlsZVBhdGggPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4nLCAnLi4nLCAnLi4nLCAnc29sdXRpb24uY29udGV4dC5qc29uJyk7XHJcblxyXG4gIC8vIFdyaXRpbmcgdGhlIGNvbmZpZ3VyYXRpb24uXHJcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgZGF0YSk7XHJcbiAgY29uc29sZS5sb2coYFxcblRoZSBjb25maWd1cmF0aW9uIGhhcyBiZWVuIHN1Y2Nlc3NmdWxseSB3cml0dGVuIHRvICR7ZmlsZVBhdGh9LlxcbllvdSBjYW4gbm93IGRlcGxveSB0aGUgc29sdXRpb24gYnkgcnVubmluZyA6XFxuXFxubnB4IGNkayBkZXBsb3lgKTtcclxufSkoKTsiXX0=