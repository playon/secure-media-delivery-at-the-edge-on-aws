import * as Joi from 'joi';
import { apiSchema, IApi } from './api';
import { coreSchema, IMain } from './main';
import { demoSchema, IDemo } from './demo';
import { hostingSchema, IHosting } from './hosting';


import { sessionRevocationSchema, ISessionRevocation } from './auto_session_revocation';

/**
 * Describes a configuration associated with the
 * current stack in Typescript.
 */
 export interface IConfiguration {

  main?: IMain;
  sessionRevocation?: ISessionRevocation;
  api?: IApi;
  hls?: IHosting;
  dash?: IHosting;
  demo?: IDemo;
}

/**
 * The `Joi` schema for validating the configuration.
 */
export const schema = Joi.object().keys({
  main: coreSchema,
  sessionRevocation: sessionRevocationSchema.optional(),
  api: apiSchema.optional(),
  hosting: hostingSchema.optional(),
  demo: demoSchema.optional(),

}).unknown().required();

