import * as Joi from 'joi';

/**
 * A description of the Session Invalidation configuration
 * in Typescript.
 */
export interface ISessionInvalidation {

  /**
   * The limit (in dollars) at which a notification is
   * to be sent when the actual budget is superior
   * to the limit value.
   */
   trigger_workflow_frequency: number;
}

/**
 * The `Joi` schema for validating the session invalidation configuration.
 */
export const sessionInvalidationSchema = Joi.object().keys({
  trigger_workflow_frequency: Joi.number().min(1).required()
});