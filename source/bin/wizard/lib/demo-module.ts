import * as prompts from 'prompts';

import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { IApi } from '../../../helpers/validators/api';

/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
const language = new Array('nodejs','python')

const apiQuestions = [{
  type: 'text',
  name: 'language',
  message: 'Specify the programming language for the AWS Lambda (nodejs/python)?',
  validate: (value: string) => !language.includes(value)  ?
    'The value must be typescript or python' : true
}];

export class ApiModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    configuration.api = <IApi> await prompts.prompt(apiQuestions, { onCancel });
    return (configuration);
  }
}