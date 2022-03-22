import { IConfiguration } from './validators/configuration';
/**
 * Returns the options to pass to the Prototype Engagement Pack.
 * This function will validate the confioguration read from the CDK context
 * file, and will pass the resulted value to the caller.
 * @throws an exception if the configuration is not valid.
 */
export declare const getOpts: () => Promise<IConfiguration>;
