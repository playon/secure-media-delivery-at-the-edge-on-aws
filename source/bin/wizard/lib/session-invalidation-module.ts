import * as Joi from 'joi';
import * as prompts from 'prompts';

import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { ISessionInvalidation } from '../../../helpers/validators/session-invalidation';

/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const sessionInvalidateQuestions = [{
  type: 'text',
  name: 'trigger_workflow_frequency',
  message: 'At what frequency (in minutes) do you want to trigger the workflow to detect session to invalidate?',
  validate: (value: string) => Joi.number().min(1).required().validate(value).error ?
    'The value must be a number superior or equal to 1' : true
}];

export class SessionInvalidationModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    configuration.sessionInvalidation = <ISessionInvalidation> await prompts.prompt(sessionInvalidateQuestions, { onCancel });
    return (configuration);
  }
}