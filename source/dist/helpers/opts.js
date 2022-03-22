"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpts = void 0;
const configuration_1 = require("./validators/configuration");
/**
 * A reference to the configuration file.
 */
let config = null;
/**
 * Returns the options to pass to the Prototype Engagement Pack.
 * This function will validate the confioguration read from the CDK context
 * file, and will pass the resulted value to the caller.
 * @throws an exception if the configuration is not valid.
 */
exports.getOpts = async () => {
    try {
        config = require('../solution.context.json');
    }
    catch (e) {
        console.error(`
      The 'solution.context.json' configuration file could not be found.
      Please run 'npm run wizard' to generate a configuration before deploying.
    `);
        process.exit(1);
    }
    // Validating the project configuration.
    const result = configuration_1.schema.validate(config);
    // Verifying whether the configuration is valid.
    if (result.error) {
        throw new Error(result.error.message);
    }
    // Returning validated options.
    return (result.value);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2hlbHBlcnMvb3B0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBcUU7QUFFckU7O0dBRUc7QUFDSCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFFbEI7Ozs7O0dBS0c7QUFDVSxRQUFBLE9BQU8sR0FBRyxLQUFLLElBQTZCLEVBQUU7SUFFekQsSUFBSTtRQUNGLE1BQU0sR0FBRyxPQUFPLENBQUMsMEJBQTBCLENBQUMsQ0FBQztLQUM5QztJQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsT0FBTyxDQUFDLEtBQUssQ0FBQzs7O0tBR2IsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNqQjtJQUVELHdDQUF3QztJQUN4QyxNQUFNLE1BQU0sR0FBRyxzQkFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUV2QyxnREFBZ0Q7SUFDaEQsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFO1FBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztLQUN2QztJQUVELCtCQUErQjtJQUMvQixPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3hCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHNjaGVtYSwgSUNvbmZpZ3VyYXRpb24gfSAgZnJvbSAnLi92YWxpZGF0b3JzL2NvbmZpZ3VyYXRpb24nO1xuXG4vKipcbiAqIEEgcmVmZXJlbmNlIHRvIHRoZSBjb25maWd1cmF0aW9uIGZpbGUuXG4gKi9cbmxldCBjb25maWcgPSBudWxsO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG9wdGlvbnMgdG8gcGFzcyB0byB0aGUgUHJvdG90eXBlIEVuZ2FnZW1lbnQgUGFjay5cbiAqIFRoaXMgZnVuY3Rpb24gd2lsbCB2YWxpZGF0ZSB0aGUgY29uZmlvZ3VyYXRpb24gcmVhZCBmcm9tIHRoZSBDREsgY29udGV4dFxuICogZmlsZSwgYW5kIHdpbGwgcGFzcyB0aGUgcmVzdWx0ZWQgdmFsdWUgdG8gdGhlIGNhbGxlci5cbiAqIEB0aHJvd3MgYW4gZXhjZXB0aW9uIGlmIHRoZSBjb25maWd1cmF0aW9uIGlzIG5vdCB2YWxpZC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdldE9wdHMgPSBhc3luYyAoKTogUHJvbWlzZTxJQ29uZmlndXJhdGlvbj4gPT4ge1xuXG4gIHRyeSB7XG4gICAgY29uZmlnID0gcmVxdWlyZSgnLi4vc29sdXRpb24uY29udGV4dC5qc29uJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcbiAgICAgIFRoZSAnc29sdXRpb24uY29udGV4dC5qc29uJyBjb25maWd1cmF0aW9uIGZpbGUgY291bGQgbm90IGJlIGZvdW5kLlxuICAgICAgUGxlYXNlIHJ1biAnbnBtIHJ1biB3aXphcmQnIHRvIGdlbmVyYXRlIGEgY29uZmlndXJhdGlvbiBiZWZvcmUgZGVwbG95aW5nLlxuICAgIGApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRpbmcgdGhlIHByb2plY3QgY29uZmlndXJhdGlvbi5cbiAgY29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlKGNvbmZpZyk7XG5cbiAgLy8gVmVyaWZ5aW5nIHdoZXRoZXIgdGhlIGNvbmZpZ3VyYXRpb24gaXMgdmFsaWQuXG4gIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IocmVzdWx0LmVycm9yLm1lc3NhZ2UpO1xuICB9XG5cbiAgLy8gUmV0dXJuaW5nIHZhbGlkYXRlZCBvcHRpb25zLlxuICByZXR1cm4gKHJlc3VsdC52YWx1ZSk7XG59O1xuIl19