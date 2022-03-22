import * as Joi from 'joi';
export interface IHosting {
    hostname: string;
    url_path: string;
    ttl: string;
}
/**
 * The `Joi` schema for validating the api configuration.
 */
export declare const hostingSchema: Joi.ObjectSchema<any>;
