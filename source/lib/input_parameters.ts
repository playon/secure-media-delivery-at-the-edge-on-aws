/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  Aws,
  CfnOutput,
  aws_secretsmanager as secretsmanager,
  CfnParameter,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";

export class GetInputParameters extends Construct {
  public readonly customInputParameters = {} as IConfiguration;

  constructor(scope: Construct, id: string, configuration: IConfiguration) {
    super(scope, id);

    console.log("configuration=" + JSON.stringify(configuration));

    const returnObject: IConfiguration = {
      main: {
        rotate_secrets_frequency: "24h",
        rotate_secrets_pattern: "00 12 ? * * *",
      },
    };

    if (configuration.demo) {
      const username = new CfnParameter(this, "username", {
        type: "String",
        description:
          "[API][Demo website] Username used to authenticate demo viewer",
      });

      const password = new CfnParameter(this, "password", {
        type: "String",
        description:
          "[API][Demo website] Password used to authenticate demo viewer",
      });

      returnObject.demo = {
        username: username.valueAsString,
        password: password.valueAsString,
      };
    }
    if (configuration.dash) {
      const dash_hostname = new CfnParameter(this, "dash_hostname", {
        type: "String",
        description: "[API][DASH] Hostname used for asset delivery",
      });

      const dash_url_path = new CfnParameter(this, "dash_url_path", {
        type: "String",
        description: "[API][DASH] URL path for existing playable asset",

      });

      const dash_ttl = new CfnParameter(this, "dash_ttl", {
        type: "String",
        description: "[API][DASH] TTL for the token",
        allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],
        default: configuration.dash?.ttl,
      });

      returnObject.dash = {
        hostname: dash_hostname.valueAsString,
        url_path: dash_url_path.valueAsString,
        ttl: dash_ttl.valueAsString,
      };
    }

    if (configuration.hls) {

      const hls_hostname = new CfnParameter(this, "hls_hostname", {
        type: "String",
        description: "[API][HLS] Hostname used for asset delivery",
      });

      const hls_url_path = new CfnParameter(this, "hls_url_path", {
        type: "String",
        description: "[API][HLS] URL path for existing playable asset",
      });

      const hls_ttl = new CfnParameter(this, "hls_ttl", {
        type: "String",
        description: "[API][DASH] TTL for the token",
        allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],
        default: configuration.hls?.ttl,
      });

      returnObject.hls = {
        hostname: hls_hostname.valueAsString,
        url_path: hls_url_path.valueAsString,
        ttl: hls_ttl.valueAsString,
      };
    }

    if (configuration.api) {
      console.log(configuration.api.language);
      const api_language = new CfnParameter(this, "api_language", {
        type: "String",
        description: "[API] Choose the programming language for API code ",
        allowedValues: ["nodejs", "python"],
        default: configuration.api.language,
      });

      console.log("api_language 👉 ", api_language.valueAsString);

      returnObject.api = {
        language: api_language.valueAsString,
      };
    }

    console.log("returnObject=" + JSON.stringify(returnObject));
    this.customInputParameters = returnObject;
  }
}
