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
  aws_secretsmanager as secretsmanager
} from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class Secrets extends Construct {

  public readonly primarySecret: secretsmanager.ISecret;
  public readonly secondarySecret: secretsmanager.ISecret;
  public readonly temporarySecret: secretsmanager.ISecret;

  padTo2Digits(num: number) {
    return num.toString().padStart(2, '0');
  }

  formatDate(date: Date) {
    return (
      [
        date.getFullYear().toString().substring(1, 3),
        this.padTo2Digits(date.getMonth() + 1),
        this.padTo2Digits(date.getDate()),
      ].join('')
    );
  }

  new_secret_key(){

    const formatterDate = this.formatDate(new Date());
    const random_key_suffix = Math.random().toString(36).substring(2, 12)
    return formatterDate + '_' + random_key_suffix;

  }

  constructor(scope: Construct, id: string) {
    super(scope, id);


    const primarySecretKey = this.new_secret_key();

    const primarySecret = new secretsmanager.Secret(this, "Primary", {
      secretName: Aws.STACK_NAME + "_PrimarySecret",
      description: "Primary secret for Secure Media Stream Delivery",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ primarySecretKey: "" }),
        generateStringKey: primarySecretKey
      }
    })

    const secondarySecretKey = this.new_secret_key();
    const secondarySecret = new secretsmanager.Secret(this, "Secondary", {
      secretName: Aws.STACK_NAME + "_SecondarySecret",
      description: "Secondary secret for Secure Media Stream Delivery",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ secondarySecretKey: "" }),
        generateStringKey: secondarySecretKey
      }
    })

    const temporarySecretKey = this.new_secret_key();
    const temporarySecret = new secretsmanager.Secret(this, "Temporary", {
      secretName: Aws.STACK_NAME + "_TemporarySecret",
      description: "Temporary secret for Secure Media Stream Delivery",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ temporarySecretKey: "" }),
        generateStringKey: temporarySecretKey
      }
    })
/*
    new custom_resources.AwsCustomResource(this, "rotateSecretsOnCreation", {
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: {
          FunctionName: "LIVE_GenerateNewSecret"
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of("rotateSecretCustomResource"),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE
      }),
    });

*/
    this.primarySecret = primarySecret;
    this.secondarySecret = secondarySecret;
    this.temporarySecret = temporarySecret;

    new CfnOutput(this, "PrimarySecret", {
      value: primarySecret.secretName,
      exportName: Aws.STACK_NAME + 'PrimarySecret',
      description: 'The name of the PrimarySecret'
    })

    new CfnOutput(this, "SecondarySecret", {
      value: secondarySecret.secretName,
      exportName: Aws.STACK_NAME + 'SecondarySecret',
      description: 'The name of the SecondarySecret'
    })




  }
}