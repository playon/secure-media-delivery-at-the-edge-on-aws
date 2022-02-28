import * as Joi from 'joi';
import { apiSchema, IApi } from './api';
import { coreSchema, ICore } from './core';


import { sessionInvalidationSchema, ISessionInvalidation } from './session-invalidation';

/**
 * Describes a configuration associated with the
 * current stack in Typescript.
 */
 export interface IConfiguration {

  core?: ICore;
  sessionInvalidation?: ISessionInvalidation;
  api?: IApi;

}

/**
 * The `Joi` schema for validating the configuration.
 */
export const schema = Joi.object().keys({
  core: coreSchema,
  sessionInvalidation: sessionInvalidationSchema.optional(),
  api: apiSchema.optional()

}).unknown().required();