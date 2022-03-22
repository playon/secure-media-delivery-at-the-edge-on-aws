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
export declare const demoSchema: Joi.ObjectSchema<any>;
