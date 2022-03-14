import * as Joi from 'joi';
import * as prompts from 'prompts';

import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { IMain } from '../../../helpers/validators/main';

/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const coreQuestions = [{
  type: 'text',
  name: 'stack_name',
  message: '[Base configuration] --> Stack name',
  validate: (value: string) => Joi.string().required().validate(value).error ?
    'The name of the stack is mandatory' : true
},{
  type: 'text',
  name: 'rotate_secrets_frequency',
  message: '[Base configuration] --> At what frequency do you want to rotate the secrets?\n (in minutes between 1 and 1440, type 0 to disable it)',
  validate: (value: string) => Joi.number().min(0).required().validate(value).error ?
    'The value must be a number superior or equal to 0' : true
}];

export class MainModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    console.log("\n--------------------- Base configuration -------------------\n")
    configuration.main = <IMain> await prompts.prompt(coreQuestions, { onCancel });
    return (configuration);
  }
}