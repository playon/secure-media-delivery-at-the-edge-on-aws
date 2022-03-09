import * as Joi from 'joi';
import { apiSchema, IApi } from './api';
import { coreSchema, ICore } from './core';
import { IDemo } from './demo';


import { sessionRevocationSchema, ISessionRevocation } from './session-revocation';

/**
 * Describes a configuration associated with the
 * current stack in Typescript.
 */
 export interface IConfiguration {

  core?: ICore;
  sessionRevocation?: ISessionRevocation;
  api?: IApi;
  demo?: IDemo;

}

/**
 * The `Joi` schema for validating the configuration.
 */
export const schema = Joi.object().keys({
  core: coreSchema,
  sessionRevocation: sessionRevocationSchema.optional(),
  api: apiSchema.optional()

}).unknown().required();