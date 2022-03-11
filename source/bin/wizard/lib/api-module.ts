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
  message: 'Choose the programming language for the AWS Lambda',
  choices: [
    { title: 'NodeJs', value: 'nodejs' },
    { title: 'Python', value: 'python'  },


  ],
  initial: 1
},
{
  type: 'toggle',
  name: 'demo',
  message: 'Do you want to deploy a demo website?',
  initial: true,
  active: 'yes',
  inactive: 'no'
}];

const demoQuestions = [
  {
    type: 'text',
    name: 'username',
    message: 'Username used to authenticate',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Username is mandatory' : true
  },
  {
    type: 'text',
    name: 'password',
    message: 'Password used to authenticate',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Password is mandatory' : true
  },
  {
    type: 'text',
    name: 'hostname',
    message: 'Existing hostname used for asset delivery',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Hostname is mandatory' : true
  },
  {
    type: 'text',
    name: 'url_path',
    message: 'Path for an existing playable asset',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Url path is mandatory' : true
  },
  {
    type: 'text',
    name: 'ttl',
    message: 'TTL for the token',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'TTL path is mandatory' : true
  }];


export class ApiModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    configuration.api = <IApi> await prompts.prompt(apiQuestions, { onCancel });
    if(configuration.api.demo){
      configuration.demo = <IDemo> await prompts.prompt(demoQuestions, { onCancel });
    }
    console.log(configuration);
    return (configuration);
  }
}