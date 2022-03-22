import * as Joi from 'joi';
/**
 * A description of the Api configuration
 * in Typescript.
 */
export interface IApi {
    /**
     * The limit (in dollars) at which a notification is
     * to be sent when the actual budget is superior
     * to the limit value.
     */
    language: string;
}
/**
 * The `Joi` schema for validating the api configuration.
 */
export declare const apiSchema: Joi.ObjectSchema<any>;
