import * as Joi from 'joi';
import { IApi } from './api';
import { IMain } from './main';
import { IDemo } from './demo';
import { IHosting } from './hosting';
import { ISessionRevocation } from './session-revocation';
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
export declare const schema: Joi.ObjectSchema<any>;
