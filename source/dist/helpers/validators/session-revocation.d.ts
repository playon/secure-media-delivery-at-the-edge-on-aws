import * as Joi from 'joi';
/**
 * A description of the Session Invalidation configuration
 * in Typescript.
 */
export interface ISessionRevocation {
    /**
     * The limit (in dollars) at which a notification is
     * to be sent when the actual budget is superior
     * to the limit value.
     */
    trigger_workflow_frequency: number;
    s3_logs_bucket_name: string;
}
/**
 * The `Joi` schema for validating the session invalidation configuration.
 */
export declare const sessionRevocationSchema: Joi.ObjectSchema<any>;
