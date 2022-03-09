import * as Joi from 'joi';

/**
 * A description of the Api configuration
 * in Typescript.
 */
export interface IDemo {

  /**
   * The limit (in dollars) at which a notification is
   * to be sent when the actual budget is superior
   * to the limit value.
   */
   username: string;
   password: string;
   hostname: string;
   url_path: string;
   ttl: string;

}

/**
 * The `Joi` schema for validating the api configuration.
 */
export const apiSchema = Joi.object().keys({
  username: Joi.string().required(),
  password: Joi.string().required(),
  hostname: Joi.string().required(),
  url_path: Joi.string().required(),
  ttl: Joi.string().required()
});