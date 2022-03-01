import * as Joi from 'joi';
import * as prompts from 'prompts';

import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { ICore } from '../../../helpers/validators/core';

/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const coreQuestions = [{
  type: 'text',
  name: 'rotate_secrets_frequency',
  message: 'At what frequency (in hours) do you want to rotate the secrets?\n (in minutes between 1 and 1440, type 0 to disable it)',
  validate: (value: string) => Joi.number().min(0).required().validate(value).error ?
    'The value must be a number superior or equal to 0' : true
}];

export class CoreModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    configuration.core = <ICore> await prompts.prompt(coreQuestions, { onCancel });
    return (configuration);
  }
}