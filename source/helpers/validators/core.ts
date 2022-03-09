import * as Joi from 'joi';

/**
 * A description of the Core configuration
 * in Typescript.
 */
export interface ICore {

  /**
   * The limit (in dollars) at which a notification is
   * to be sent when the actual budget is superior
   * to the limit value.
   */
   stack_name: string;
   rotate_secrets_frequency: number;
}

/**
 * The `Joi` schema for validating the core configuration.
 */
export const coreSchema = Joi.object().keys({
  stack_name:Joi.string().required(),
  rotate_secrets_frequency: Joi.number().min(0).required()
});