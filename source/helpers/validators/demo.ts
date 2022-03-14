import * as Joi from 'joi';

/**
 * A description of the Api configuration
 * in Typescript.
 */
export interface IDemo {

  username: string;
  password: string;

}

/**
 * The `Joi` schema for validating the api configuration.
 */
export const demoSchema = Joi.object().keys({
  url_path: Joi.string().required(),
  ttl: Joi.string().required(),

});