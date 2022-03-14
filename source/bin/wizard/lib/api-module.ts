import * as prompts from 'prompts';
import * as Joi from 'joi';
import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { IApi } from '../../../helpers/validators/api';
import { IDemo } from '../../../helpers/validators/demo';

/**
 * A question prompting the user for the session invalidation
 * to allocate to a prototype.
 */
//const language = new Array('nodejs','python');
const apiQuestions = [

{
  type: 'select',
  name: 'language',
  message: '[API] --> Choose the programming language for API code',
  choices: [
    { title: 'NodeJs', value: 'nodejs' },
    { title: 'Python', value: 'python'  },
  ],
  initial: 1
},
{
  type: 'toggle',
  name: 'demo',
  message: '[API] --> Do you want to deploy a demo website?',
  initial: true,
  active: 'yes',
  inactive: 'no'
}];

const apiDemoQuestions = [
  {
    type: 'text',
    name: 'username',
    message: '[API] --> Username used to authenticate',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Username is mandatory' : true
  },
  {
    type: 'text',
    name: 'password',
    message: '[API] --> Password used to authenticate',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Password is mandatory' : true
  },
  {
    type: 'text',
    name: 'hostname',
    message: '[API] --> Existing hostname used for asset delivery (optional)'
  },
  {
    type: 'text',
    name: 'url_path',
    message: '[API] --> URL path for existing for an existing playable asset (optional)'
  },
  {
    type: 'text',
    name: 'ttl',
    message: '[API] --> TTL for the token (optional)',
  }];


export class ApiModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    console.log("\n--------------------- API MODULE -------------------\n")
    configuration.api = <IApi> await prompts.prompt(apiQuestions, { onCancel });
    if(configuration.api.demo){
      configuration.demo = <IDemo> await prompts.prompt(apiDemoQuestions, { onCancel });
    }
    return (configuration);
  }
}