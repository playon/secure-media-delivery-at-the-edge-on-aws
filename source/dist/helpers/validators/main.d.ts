import * as Joi from 'joi';
/**
 * A description of the Core configuration
 * in Typescript.
 */
export interface IMain {
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
export declare const coreSchema: Joi.ObjectSchema<any>;
