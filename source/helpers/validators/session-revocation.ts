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
   db_name: string;
   table_name: string;
   request_ip_column: string;
   ua_column_name: string;
   referer_column_name: string;
   uri_column_name: string;
   status_column_name: string;
   response_bytes_column_name: string;
   date_column_name: string;
   time_column_name: string;
   lookback_period: string;
   ip_penalty: number;
   referer_penalty: number;
   ua_penalty: number;
   min_sessions_number: number;
   min_session_duration: number;
   score_threshold: number;
}

/**
 * The `Joi` schema for validating the session invalidation configuration.
 */
export const sessionRevocationSchema = Joi.object().keys({
  trigger_workflow_frequency: Joi.number().min(0).required(),
  s3_logs_bucket_name: Joi.string().required(),
});