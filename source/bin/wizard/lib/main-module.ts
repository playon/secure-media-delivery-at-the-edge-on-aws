import * as Joi from 'joi';
import * as prompts from 'prompts';

import { PromptComponent } from './prompt-component';
import { onCancel } from './handlers';
import { IConfiguration } from '../../../helpers/validators/configuration';
import { IMain } from '../../../helpers/validators/main';
import { date } from 'joi';

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
},
{
  type: 'select',
  name: 'rotate_secrets_frequency',
  message: '[Base configuration] --> At what frequency do you want to rotate the secrets?',
  choices: [
    { title: 'Manual', value: '0' },
    { title: 'Every day', value: '24h'  },
    { title: 'Every week', value: '1w'  },
    { title: 'Monthly', value: '1m'  },
  ],
  initial: 1
}
];
const rotation_day_of_the_week_question = [
  {
    type: 'select',
    name: 'value',
    message: '[Base configuration] --> On which day of the week you would like to trigger it',
    choices: [
      { title: 'Monday', value: '1' },
      { title: 'Tuesday', value: '2'  },
      { title: 'Wednesday', value: '3'  },
      { title: 'Thursday', value: '4'  },
      { title: 'Friday', value: '5'  },
      { title: 'Saturday', value: '6'  },
      { title: 'Sunday', value: '7'  },
    ],
    initial: 1
  }
]

const rotation_day_of_month_question = [
  {
    type: 'text',
    name: 'value',
    message: '[Base configuration] --> On which day of the month you would like to trigger it',
    validate: (value: string) => Joi.number().min(1).validate(value).error  && Joi.number().max(31).validate(value).error?
    'The day of the month must be between 1 and 31' : true
  }
]

const rotation_datetime_question = [
  {
    type: 'text',
    name: 'value',
    message: '[Base configuration] --> At what time of the day should take place \n (use the format HH:mm)',
    validate: (value: string) => Joi.string().regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/).validate(value).error ?
      'The expected format is HH:mm' : true
  }
]



export class MainModule implements PromptComponent {

  /**
   * Implements the logic to prompt questions to the user
   * and to fill the given configuration with the provided responses.
   * @param configuration an object in which the configuration must be stored.
   */
  async prompt(configuration: IConfiguration): Promise<IConfiguration> {
    console.log("\n--------------------- Base configuration -------------------\n")
    configuration.main = <IMain> await prompts.prompt(coreQuestions, { onCancel });

    if(configuration.main.rotate_secrets_frequency!=='0'){
      //Minutes	Hours	Day_of_month	Month	Day_of_week	Year
      //MIN HOUR * * DAY *
      var day_of_the_week = '*';
      var day_of_the_month = '?';

      if(configuration.main.rotate_secrets_frequency==='1w'){
        const day = await prompts.prompt(rotation_day_of_the_week_question, { onCancel });
        day_of_the_week = day.value;
        day_of_the_month = '?';
      }else if(configuration.main.rotate_secrets_frequency==='1m'){
        //1m
        const answer_datetime = await prompts.prompt(rotation_day_of_month_question, { onCancel });
        day_of_the_month = answer_datetime.value;
        day_of_the_week = '?';
      }

      const answer_datetime = await prompts.prompt(rotation_datetime_question, { onCancel });
      const datetime = answer_datetime.value.split(':')
      configuration.main.rotate_secrets_pattern = datetime[1] + ' ' + datetime[0] + ' ' + day_of_the_month + ' * ' + day_of_the_week + ' *'

    }

    return (configuration);
  }
}