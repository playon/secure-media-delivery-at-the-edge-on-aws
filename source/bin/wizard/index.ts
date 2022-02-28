#!/usr/bin/env node
import * as prompts from 'prompts';
import * as fs from 'fs';
import * as path from 'path';

import { IConfiguration } from '../../helpers/validators/configuration';
import { SessionInvalidationModule } from './lib/session-invalidation-module';
import { PromptComponent } from './lib/prompt-component';
import { onCancel } from './lib/handlers';
import { CoreModule } from './lib/core-module';
import { ApiModule } from './lib/api-module';

/**
 * A question prompting for the components of the Prototype
 * Engagement Pack to deploy to the sandbox account.
 */
const componentQuestion = {
  type: 'multiselect',
  name: 'value',
  message: 'Which optional component(s) would you like to deploy ?',
  min: 1,
  instructions: false,
  hint: '- Space to select. Return to submit. \'a\' to toggle all.',
  choices: [
    { title: 'Session invalidation', 'value': 'session-invalidation' },
    { title: 'Rest APIs', 'value': 'api' },
  ]
};

/**
 * Prompts the user whether the configuration is valid
 * and should be written.
 */
 const confirmConfigurationQuestion = {
  type: 'confirm',
  name: 'value',
  message: 'This is the generated configuration based on your choices. Would you like to use it ?'
};

/**
 * A map between component identifiers and their instance.
 */
const moduleMap: { [key: string]: PromptComponent } = {
  'core': new CoreModule(),
  'session-invalidation': new SessionInvalidationModule(),
  'api': new ApiModule(),
};


/**
 * Prompts the user for different information and
 * returns the gathered configuration.
 */
const getConfiguration = async (): Promise<IConfiguration> => {
  const configuration: IConfiguration = {};

  const coreComponent = new Array('core');

  const components: Array<string>     = (await prompts.prompt(componentQuestion, { onCancel })).value;
  const allComponents = coreComponent.concat(components);

  // Iterating over the component prompts.
  for (const item of allComponents) {
    const moduleImpl = moduleMap[item];

    if (moduleImpl) {
      try {
        await moduleImpl.prompt(configuration);
      } catch (e) {
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

  // Displaying the content of the configuration file.
  console.log(data);

  // Prompting the user to confirm.
  const confirmation = await prompts.prompt(confirmConfigurationQuestion);

  if (!confirmation.value) {
    console.log(`The configuration has been rejected, exiting.`);
    process.exit(0);
  }

  // The path to the configuration file.
  const filePath = path.resolve(__dirname, '..', '..', '..', 'prototype.context.json');

  // Writing the configuration.
  fs.writeFileSync(filePath, data);
  console.log(`\nThe configuration has been successfully written to ${filePath}.\nYou can now deploy the Prototype Engagement Pack by running :\n\nnpx cdk deploy`);
})();