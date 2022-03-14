import * as prompts from 'prompts';
import * as Joi from 'joi';
import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { IApi } from '../../../helpers/validators/api';
import { IDemo } from '../../../helpers/validators/demo';
import { IHosting } from '../../../helpers/validators/hosting';

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
}
];

const selectAssetHosting = [{
  type: 'toggle',
  name: 'hosting',
  message: '[API] --> Do you want to configure your existing hosting used for asset delivery?',
  initial: true,
  active: 'yes',
  inactive: 'no'
}]

const hostQuestions = [
  {
    type: 'text',
    name: 'hostname',
    message: '[API] --> Hostname used for asset delivery',
    validate: (value: string) => Joi.string().required().validate(value).error ?
    'Hostname is mandatory' : true
  },
  {
    type: 'text',
    name: 'url_path',
    message: '[API] --> URL path for existing playable asset',
    validate: (value: string) => Joi.string().required().validate(value).error ?
    'URL path for existing playable asset is mandatory' : true
  },
  {
    type: 'text',
    name: 'ttl',
    message: '[API] --> TTL for the token',
    validate: (value: string) => Joi.number().required().validate(value).error ?
    'TTL for the token is mandatory' : true
  }
]

const selectDemoWebsite = [{
  type: 'toggle',
  name: 'demo',
  message: '[API][Demo website] --> Do you want to deploy a demo website?',
  initial: true,
  active: 'yes',
  inactive: 'no'
}]



const demoQuestions = [

  {
    type: 'text',
    name: 'username',
    message: '[API][Demo website] --> Username used to authenticate demo viewer',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Username is mandatory' : true
  },
  {
    type: 'text',
    name: 'password',
    message: '[API][Demo website] --> Password used to authenticate demo viewer',
    validate: (value: string) => Joi.string().required().validate(value).error ?
      'Password is mandatory' : true
  },
];


export class ApiModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    console.log("\n--------------------- API Module -------------------\n")
    configuration.api = <IApi> await prompts.prompt(apiQuestions, { onCancel });

    if(configuration.hosting){
      configuration.api = <IApi> await prompts.prompt(hostQuestions, { onCancel });
    }

    const configureHosting =  await prompts.prompt(selectAssetHosting, { onCancel });
    if(configureHosting.hosting){
      configuration.hosting = <IHosting> await prompts.prompt(hostQuestions, { onCancel });
    }

    const configureDemo =  await prompts.prompt(selectDemoWebsite, { onCancel });
    if(configureDemo.demo){
      configuration.demo = <IDemo> await prompts.prompt(demoQuestions, { onCancel });
    }

    return (configuration);
  }
}