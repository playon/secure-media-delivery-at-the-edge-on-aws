/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

import { CfnCondition, CfnParameter, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";
import { IConfiguration } from "../../helpers/validators/configuration";
import { addParametersToInterface } from "./cfn_parameters";

//Construct used to implement input parameters when the user deploys the stack using CloudFormation template and not using the wizard and CDK
export class GetInputParameters extends Construct {
  public readonly customInputParameters = {} as IConfiguration;

  constructor(scope: Construct, id: string, configuration: IConfiguration) {
    super(scope, id);

    var returnObject: IConfiguration;

    if (configuration.main.rotate_secrets_pattern === "P") {

      const wcu = new CfnParameter(this, "Wcu", {
        type: "Number",
        minValue : 2,
        maxValue : 1500,
        description:
          "Capacity limit expressed in WCUs for WAF Rule Group to keep the session list that should be blocked (between 2 and 1500).",
      });


      const retention = new CfnParameter(this, "Retention", {
        type: "Number",
        minValue : 1,
        description:
          "Retention time for compromised sessions (in minutes)",
      });


      const hours = new CfnParameter(this, "Hours", {
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
        description:
          "An hour when key rotation workflow will be triggered.",
      });

      const minutes = new CfnParameter(this, "Minutes", {
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
        description:
          "A minute in the selected hour when key rotation workflow will be triggered.",
      });

      const day_of_week = new CfnParameter(this, "DayOfTheWeek", {
        type: "String",
        allowedValues: ["1", "2", "3", "4", "5", "6", "7"],
        description:
          "After selecting a week in a month, provide a specific day in that week when key rotation should occur. Value from 1 to 7, where 1 means Monday and 7 means Sunday.",
      });

      const week_of_month = new CfnParameter(this, "WeekOfTheMonth", {
        type: "String",
        allowedValues: ["1", "2", "3", "4"],
        description:
          "Specify the week number in each month that key rotation will be scheduled for. This parameter can be set to a value from a range 1 to 4.",
      });

      addParametersToInterface({
        params: [
          {
            scope: this,
            parameter: retention,
            groupLabel: "Session Revocation",
            parameterLabel: "Retention",
          },
          {
            scope: this,
            parameter: wcu,
            groupLabel: "Session Revocation",
            parameterLabel: "Wcu",
          },
          {
            scope: this,
            parameter: week_of_month,
            groupLabel: "Key Rotation Frequency",
            parameterLabel: "Week of the month",
          },
          {
            scope: this,
            parameter: day_of_week,
            groupLabel: "Key Rotation Frequency",
            parameterLabel: "Day of the week",
          },
          {
            scope: this,
            parameter: hours,
            groupLabel: "Key Rotation Frequency",
            parameterLabel: "Hours",
          },
          {
            scope: this,
            parameter: minutes,
            groupLabel: "Key Rotation Frequency",
            parameterLabel: "Minutes",
          }
          
        ],
      });
     
      returnObject = {
        main: {
          stack_name: "MYSTREAM",
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
          wcu: wcu.valueAsString,
          retention: retention.valueAsString,
        },
      };
    } else {
      returnObject = {
        main: {
          stack_name: "MYSTREAM",
          rotate_secrets_frequency: "1m",
          rotate_secrets_pattern: configuration.main.rotate_secrets_pattern,
          wcu: configuration.main.wcu,
          retention: configuration.main.retention,
        },
      };
    }

    if (configuration.dash) {
      if (configuration.dash?.hostname === "H") {
        const dash_hostname = new CfnParameter(this, "DashHostName", {
          type: "String",
          description: "Domain name served by CloudFront distribution hosting video following protocol prefix (http:// or https://).",
          //default: "https://d123.cloudfront.net"
        });

        const dash_url_path = new CfnParameter(this, "DashUrlPath", {
          type: "String",
          description: "Full URL path of the video asset. This parameter must start with ‘/’ and point to an object used by the player to initiate a playback, like master manifest (mpd file).",
          default: '/video/2/index.mpd'
        });

        const dash_ttl = new CfnParameter(this, "DashTtl", {
          type: "String",
          description: "Time period determining for how long newly issued token will be valid. ",
          allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],
          default: "+30m"
        });

        addParametersToInterface({
          params: [
            {
              scope: this,
              parameter: dash_hostname,
              groupLabel: "DASH stream",
              parameterLabel: "Hostname for asset delivery",
            },
            {
              scope: this,
              parameter: dash_url_path,
              groupLabel: "DASH stream",
              parameterLabel: "Url path for asset delivery",
            },
            {
              scope: this,
              parameter: dash_ttl,
              groupLabel: "DASH stream",
              parameterLabel: "TTL for token",
            },
          ],
        });
        /*

        var cond = new CfnCondition(this, "DashHostNameValue", {
          expression: Fn.conditionEquals(dash_hostname.valueAsString, "")
        });
*/

      //const cond3 = new CfnCondition(this, 'Condition3', { expression: Fn.conditionEquals(dash_hostname, '') });
      //const test = Fn.conditionIf("Condition3", 1, 2);


      returnObject.dash = {
        
          hostname: Fn.conditionIf(Fn.conditionEquals(dash_hostname, '').toString(), 'https://d123.cloudfront.net', dash_hostname.valueAsString).toString(),
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
        const hls_hostname = new CfnParameter(this, "HlsHostName", {
          type: "String",
          description: "Domain name served by CloudFront distribution hosting video following protocol prefix (http:// or https://).",
          default: "https://d123.cloudfront.net"
        });

        const hls_url_path = new CfnParameter(this, "HlsUrlPath", {
          type: "String",
          description: "Full URL path of the video asset. This parameter must start with ‘/’ and point to an object used by the player to initiate a playback, like master manifest (mpd file).",
          default: '/video/1/index.m3u8'
        });

        const hls_ttl = new CfnParameter(this, "HlsTtl", {
          type: "String",
          description: "Time period determining for how long newly issued token will be valid.",
          allowedValues: ["+30m", "+1h", "+3h", "+6h", "+24h"],
          default: "+30m"
        });

        addParametersToInterface({
          params: [
            {
              scope: this,
              parameter: hls_hostname,
              groupLabel: "HLS stream",
              parameterLabel: "Hostname for asset delivery",
            },
            {
              scope: this,
              parameter: hls_url_path,
              groupLabel: "HLS stream",
              parameterLabel: "Url path for asset delivery",
            },
            {
              scope: this,
              parameter: hls_ttl,
              groupLabel: "HLS stream",
              parameterLabel: "TTL for token",
            },
          ],
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
    if (configuration.api) {
      returnObject.api = {
        demo: true,
      };

    }

    this.customInputParameters = returnObject;
  }
}
