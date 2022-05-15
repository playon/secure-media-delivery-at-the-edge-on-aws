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
  Stack,
  RemovalPolicy,
  aws_lambda as lambda,
  aws_dynamodb as ddb,
  aws_logs as logs,

} from "aws-cdk-lib";

import { Construct } from "constructs";
import { IConfiguration } from "../helpers/validators/configuration";
import { Secrets } from "./secrets";
import { LoadAssetsTable } from "./load_assets_table";
import { CWDashboard } from "./dashboard";
import { Endpoints } from "./endpoints";



export interface IConfigProps {
  configuration: IConfiguration;
  secrets: Secrets;
  dashboard: CWDashboard;
  sessionsTable: ddb.ITable;
  sig4LambdaVersionParamName: string;
  sig4LambdaArnParamName: string;
  sig4LambdaRoleArnParamName: string
}

export class Api extends Construct {

  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    var runtime: lambda.Runtime;
    var language: string;


    if (props.configuration.api?.language == "nodejs") {
      runtime = lambda.Runtime.NODEJS_14_X;
      language = "nodejs";
    } else {
      runtime = lambda.Runtime.PYTHON_3_7;
      language = "python";
    }
    const cloudfrontTokenLayer = new lambda.LayerVersion(
      this,
      "RotateSecretLayer",
      {
        compatibleRuntimes: [runtime],
        code: lambda.Code.fromAsset(
          "lambda/layers/aws_secure_media_delivery_" + language
        ),
        description: "Layer used by generate new secret lambda",
      }
    );

    const demoAssetsTable = new ddb.Table(this, "DemoTable", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: ddb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    new LoadAssetsTable(this, "AssetsTable", {
      table: demoAssetsTable,
      configuration: props.configuration,
    });

    const generateToken = new lambda.Function(this, "GenerateToken", {
      functionName: Aws.STACK_NAME + "_GenerateToken",
      runtime: runtime,
      code: lambda.Code.fromAsset("lambda/generate_token/" + language),
      handler: "index.handler",
      environment: {
        STACK_NAME: Aws.STACK_NAME,
        TABLE_NAME: demoAssetsTable.tableName
      },
      layers: [cloudfrontTokenLayer],
    });

    new logs.LogGroup(this, "ReadStreamLogs", {
      logGroupName: "/aws/lambda/" + generateToken.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const saveSessionToDdb = new lambda.Function(this, "SaveManualSession", {
      functionName: Aws.STACK_NAME + "_SaveManualSession",
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/save_manual_session/python"),
      handler: "index.handler",
      environment: {
        TABLE_NAME: props.sessionsTable.tableName,
        TTL: "7",
      },
    });

    demoAssetsTable.grantReadData(generateToken);
    props.sessionsTable.grantReadWriteData(saveSessionToDdb);

    props.secrets.primarySecret.grantRead(generateToken);
    props.secrets.secondarySecret.grantRead(generateToken);


    new Endpoints(this, "Endpoints", {
      generateTokenLambdaFunction: generateToken,
      saveSessionToDDBLambdaFunction: saveSessionToDdb,
      sig4LambdaVersionParamName: props.sig4LambdaVersionParamName,
      sig4LambdaArnParamName: props.sig4LambdaArnParamName,
      sig4LambdaRoleArnParamName: props.sig4LambdaRoleArnParamName,
      demoWebsite: props.configuration.api?.demo
      ? true
      : false
    })

    const region = Stack.of(this).region;

    props.dashboard.buildApiDashboard({
      lambdaFunctionName: generateToken.functionName,
      region: region,
    });



  }
}
