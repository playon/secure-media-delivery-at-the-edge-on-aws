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
  CfnParameter, Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { addParameterToInterface } from "./cfn_parameters";

export class GetInputParameters extends Construct {
  public readonly customInputParameters = {} as IConfiguration;

  constructor(scope: Construct, id: string, configuration: IConfiguration, mystack: Stack) {
    super(scope, id);

    var returnObject: IConfiguration;

    if (configuration.main?.rotate_secrets_pattern === "P") {

      const hours = new CfnParameter(this, "AA", {
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
        description: "Specify the how frequently key rotation process will be triggered",
      });

      addParameterToInterface( {
        scope: this,
        parameter: hours,
        groupLabel: "Key rotation frequency",
        parameterLabel: "Hours"
      });

      const minutes = new CfnParameter(this, "BB", {
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
        description: "Specify the how frequently key rotation process will be triggered",
      });

      addParameterToInterface( {
        scope: this,
        parameter: minutes,
        groupLabel: "Key rotation frequency",
        parameterLabel: "Minutes"
      });

      const day_of_week = new CfnParameter(this, "CC", {
        type: "String",
        allowedValues: ["1", "2", "3", "4", "5", "6", "7"],
        description: "Specify the how frequently key rotation process will be triggered",
      });

      addParameterToInterface( {
        scope: this,
        parameter: day_of_week,
        groupLabel: "Key rotation frequency",
        parameterLabel: "Day of the week"
      });

      const week_of_month = new CfnParameter(this, "DD", {
        type: "String",
        allowedValues: ["1", "2", "3", "4"],
        description: "Specify the how frequently key rotation process will be triggered",
      });

      addParameterToInterface( {
        scope: this,
        parameter: week_of_month,
        groupLabel: "Key rotation frequency",
        parameterLabel: "Week of the month"
      });

      returnObject = {
        main: {
          rotate_secrets_frequency: "1m",
          rotate_secrets_pattern:
            minutes.valueAsString +
            " " +
            hours.valueAsString +
            " ? * " +
            day_of_week.valueAsString +
            "#" +
            week_of_month.valueAsString +
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

            const username = new CfnParameter(this, "EE", {
              type: "String",
              description:
                "Username used to authenticate demo viewer",
            });

            const password = new CfnParameter(this, "FF", {
              type: "String",
              description:
                "Password used to authenticate demo viewer",
            });

            addParameterToInterface( {
              scope: this,
              parameter: username,
              groupLabel: "Demo website",
              parameterLabel: "Username"
            });

            addParameterToInterface( {
              scope: this,
              parameter: password,
              groupLabel: "Demo website",
              parameterLabel: "Password"
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
        const dash_hostname = new CfnParameter(this, "GG", {
          type: "String",
          description: "Hostname used for asset delivery for DASH stream",
        });

        const dash_url_path = new CfnParameter(this, "HH", {
          type: "String",
          description: "URL path for existing playable asset for DASH stream",
        });

        const dash_ttl = new CfnParameter(this, "II", {
          type: "String",
          description: "TTL for the token for DASH stream",
          allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],

        });

        addParameterToInterface( {
          scope: this,
          parameter: dash_hostname,
          groupLabel: "DASH stream",
          parameterLabel: "Hostname for asset delivery"
        });

        addParameterToInterface( {
          scope: this,
          parameter: dash_url_path,
          groupLabel: "DASH stream",
          parameterLabel: "Url path for asset delivery"
        });

        addParameterToInterface( {
          scope: this,
          parameter: dash_ttl,
          groupLabel: "DASH stream",
          parameterLabel: "TTL for token"
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

    if (configuration.hls) {
      if (configuration.hls?.hostname === "H") {
        const hls_hostname = new CfnParameter(this, "JJ", {
          type: "String",
          description: "Hostname used for asset delivery for HLS stream",
        });

        const hls_url_path = new CfnParameter(this, "KK", {
          type: "String",
          description: "URL path for existing playable asset for HLS stream",
        });

        const hls_ttl = new CfnParameter(this, "LL", {
          type: "String",
          description: "TTL for the token for HLS stream",
          allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],

        });

        addParameterToInterface( {
          scope: this,
          parameter: hls_hostname,
          groupLabel: "HLS stream",
          parameterLabel: "Hostname for asset delivery"
        });

        addParameterToInterface( {
          scope: this,
          parameter: hls_url_path,
          groupLabel: "HLS stream",
          parameterLabel: "Url path for asset delivery"
        });

        addParameterToInterface( {
          scope: this,
          parameter: hls_ttl,
          groupLabel: "HLS stream",
          parameterLabel: "TTL for token"
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
            const api_language = new CfnParameter(this, "MM", {
              type: "String",
              description: "Choose the programming language for API code ",
              allowedValues: ["nodejs", "python"]

            });

            addParameterToInterface( {
              scope: this,
              parameter: api_language,
              groupLabel: "APIs",
              parameterLabel: "Choose the programming language for the Lambdas"
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



    this.customInputParameters = returnObject;
  }
}
