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
import { isContext } from "vm";
import { IConfiguration } from "../helpers/validators/configuration";

export class GetInputParameters extends Construct {
  public readonly customInputParameters = {} as IConfiguration;

  constructor(scope: Construct, id: string, configuration: IConfiguration) {
    super(scope, id);

    console.log("configuration=" + JSON.stringify(configuration));
    var returnObject: IConfiguration;

    if (configuration.main?.rotate_secrets_pattern === "P") {
      const hours = new CfnParameter(this, "A", {
        type: "String",
        allowedValues: [
          "00",
          "01",
          "02",
          "03",
          "04",
          "05",
          "06",
          "07",
          "08",
          "09",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15",
          "16",
          "17",
          "18",
          "19",
          "2O",
          "21",
          "22",
          "23",
        ],
        description: "[Base configuration] Hours",
      });

      const minutes = new CfnParameter(this, "B", {
        type: "String",
        allowedValues: [
          "00",
          "01",
          "02",
          "03",
          "04",
          "05",
          "06",
          "07",
          "08",
          "09",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15",
          "16",
          "17",
          "18",
          "19",
          "2O",
          "21",
          "22",
          "23",
          "24",
          "25",
          "26",
          "27",
          "28",
          "29",
          "30",
          "31",
          "32",
          "33",
          "34",
          "35",
          "36",
          "37",
          "38",
          "39",
          "40",
          "41",
          "42",
          "43",
          "44",
          "45",
          "46",
          "47",
          "48",
          "49",
          "50",
          "51",
          "52",
          "53",
          "54",
          "55",
          "56",
          "57",
          "58",
          "59",
        ],
        description: "[Base configuration] Hours",
      });

      const day_of_week = new CfnParameter(this, "C", {
        type: "String",
        allowedValues: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
        description: "[Base configuration] Day of the week",
      });

      const week_of_month = new CfnParameter(this, "D", {
        type: "String",
        allowedValues: ["1", "2", "3", "4"],
        description: "[Base configuration] Day of the week",
      });

      returnObject = {
        main: {
          rotate_secrets_frequency: "1m",
          rotate_secrets_pattern:
            minutes +
            " " +
            hours +
            " ? * " +
            day_of_week +
            "#" +
            week_of_month +
            " *",
        },
      };
    } else {
      returnObject = {
        main: {
          rotate_secrets_frequency: "1m",
          rotate_secrets_pattern: configuration.main?.rotate_secrets_pattern!,
        },
      };
    }

    if(configuration.demo){

        if (configuration.demo?.username === "U") {
            const username = new CfnParameter(this, "E", {
              type: "String",
              description:
                "[API][Demo website] Username used to authenticate demo viewer",
            });

            const password = new CfnParameter(this, "F", {
              type: "String",
              description:
                "[API][Demo website] Password used to authenticate demo viewer",
            });

            returnObject.demo = {
              username: username.valueAsString,
              password: password.valueAsString,
            };
          } else {
            returnObject.demo = {
              username: configuration.demo?.username!,
              password: configuration.demo?.password!,
            };
          }
    }

    if (configuration.dash) {
      if (configuration.dash?.hostname === "H") {
        const dash_hostname = new CfnParameter(this, "G", {
          type: "String",
          description: "[API][DASH] Hostname used for asset delivery",
        });

        const dash_url_path = new CfnParameter(this, "H", {
          type: "String",
          description: "[API][DASH] URL path for existing playable asset",
        });

        const dash_ttl = new CfnParameter(this, "I", {
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
      } else {
        returnObject.dash = {
          hostname: configuration.dash?.hostname!,
          url_path: configuration.dash?.url_path!,
          ttl: configuration.dash?.ttl!,
        };
      }
    }
    console.log("configuration.hls?.hostname=" + configuration.hls?.hostname);

    if (configuration.hls) {
      if (configuration.hls?.hostname === "H") {
        const hls_hostname = new CfnParameter(this, "J", {
          type: "String",
          description: "[API][HLS] Hostname used for asset delivery",
        });

        const hls_url_path = new CfnParameter(this, "K", {
          type: "String",
          description: "[API][HLS] URL path for existing playable asset",
        });

        const hls_ttl = new CfnParameter(this, "L", {
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
      } else {
        returnObject.hls = {
          hostname: configuration.hls?.hostname!,
          url_path: configuration.hls?.url_path!,
          ttl: configuration.hls?.ttl!,
        };
      }
    }
    if(configuration.api){

        if (configuration.api?.language === "A") {
            const api_language = new CfnParameter(this, "M", {
              type: "String",
              description: "[API] Choose the programming language for API code ",
              allowedValues: ["nodejs", "python"],
              default: configuration.api.language,
            });

            returnObject.api = {
              language: api_language.valueAsString,
            };
          } else {
            returnObject.api = {
              language: configuration.api?.language!,
            };
          }
    }


    console.log("returnObject=" + JSON.stringify(returnObject));
    this.customInputParameters = returnObject;
  }
}
