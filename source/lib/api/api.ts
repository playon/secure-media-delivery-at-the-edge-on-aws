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
  RemovalPolicy,
  aws_lambda as lambda,
  aws_dynamodb as ddb,
  aws_logs as logs,
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { IConfiguration } from "../../helpers/validators/configuration";
import { Secrets } from "../main/secrets";
import { CrLoadAssetsTable } from "../custom_resources/cr_load_assets_table";
import { CWDashboard } from "../main/dashboard";
import { Endpoints } from "./endpoints";
import { addCfnSuppressRules } from "../cfn_nag/cfn_nag_utils";
import { GetInputParameters } from "../cfn/check_input_parameters";
import { AssetCode } from "aws-cdk-lib/aws-lambda";

export interface IConfigProps {
  configuration: IConfiguration;
  secrets: Secrets;
  dashboard: CWDashboard;
  sessionsTable: ddb.ITable;
  sig4LambdaVersionParamName: string;
  sig4LambdaRoleArn: string;
  parameters: GetInputParameters;
}

export class Api extends Construct {
  constructor(scope: Construct, id: string, props: IConfigProps) {
    super(scope, id);

    var runtime: lambda.Runtime;
    var layerCode: AssetCode;
    var generateTokenCode: AssetCode;
    var saveSessionCode: AssetCode;


    const nodejsLayerAsset = lambda.Code.fromAsset(
      "lambda/layers/aws_secure_media_delivery_nodejs"
    );

    const pythonLayerAsset = lambda.Code.fromAsset(
      "lambda/layers/aws_secure_media_delivery_python"
    );

    const generateTokenPythonLambdaAsset = lambda.Code.fromAsset("lambda/generate_token/python")
    const generateTokenNodejsLambdaAsset = lambda.Code.fromAsset("lambda/generate_token/nodejs")

    const saveSessionPythonLambdaAsset = lambda.Code.fromAsset("lambda/save_manual_session/python")
    const saveSessionNodejsLambdaAsset = lambda.Code.fromAsset("lambda/save_manual_session/nodejs")

    if(props.configuration.api?.language! === "python"){

      runtime = lambda.Runtime.PYTHON_3_7;
      layerCode = pythonLayerAsset;
      generateTokenCode = generateTokenPythonLambdaAsset;
      saveSessionCode = saveSessionPythonLambdaAsset;

    }else{

      runtime = lambda.Runtime.NODEJS_14_X;
      layerCode = nodejsLayerAsset;
      generateTokenCode = generateTokenNodejsLambdaAsset;
      saveSessionCode = saveSessionNodejsLambdaAsset;

    }

    //build a layer with required libs
    const cloudfrontTokenLayer = new lambda.LayerVersion(
      this,
      "GenerateTokenLayer",
      {
        compatibleRuntimes: [runtime],
        code: layerCode,
        description: "Layer used by generate new secret lambda",
      }
    );

    //DDB table used to store configuration for demo website
    const demoAssetsTable = new ddb.Table(this, "DemoTable", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: ddb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    addCfnSuppressRules(demoAssetsTable, [{ id: 'W74', reason: 'DynamoDB table has encryption enabled owned by Amazon.' }]);


    //load the DDB table with 2 items (one for HLS and one for DASH)
    new CrLoadAssetsTable(this, "AssetsTable", {
      table: demoAssetsTable,
      configuration: props.configuration,
    });

    //Lambda that will generate the token using the provided SDK
    const generateToken = new lambda.Function(this, "GenerateToken", {
      functionName: Aws.STACK_NAME + "_GenerateToken",
      runtime: runtime,
      code: generateTokenCode,
      handler: "index.handler",
      environment: {
        STACK_NAME: Aws.STACK_NAME,
        TABLE_NAME: demoAssetsTable.tableName,
      },
      layers: [cloudfrontTokenLayer],
    });

    addCfnSuppressRules(generateToken, [{ id: 'W58', reason: 'Lambda has CloudWatch permissions by using service role AWSLambdaBasicExecutionRole' }]);
    addCfnSuppressRules(generateToken, [{ id: 'W89', reason: 'We don t have any VPC in the stack, we only use serverless services' }]);
    addCfnSuppressRules(generateToken, [{ id: 'W92', reason: 'No need for ReservedConcurrentExecutions, some are used only for the demo website, and others are not used in a concurrent mode.' }]);


    const readStreamLogs = new logs.LogGroup(this, "ReadStreamLogs", {
      logGroupName: "/aws/lambda/" + generateToken.functionName,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    addCfnSuppressRules(readStreamLogs, [{ id: 'W84', reason: 'CloudWatch log group is always encrypted by default.' }]);


    //Lambda used to add manually a session to be revoked into a DynamoDB Table
    const saveSessionToDdb = new lambda.Function(this, "SaveManualSession", {
      functionName: Aws.STACK_NAME + "_SaveManualSession",
      runtime: runtime,
      code: saveSessionNodejsLambdaAsset,
      handler: "index.handler",
      environment: {
        TABLE_NAME: props.sessionsTable.tableName,
        TTL: "7",
      },
      layers: [cloudfrontTokenLayer],
    });

    addCfnSuppressRules(saveSessionToDdb, [{ id: 'W58', reason: 'Lambda has CloudWatch permissions by using service role AWSLambdaBasicExecutionRole' }]);
    addCfnSuppressRules(saveSessionToDdb, [{ id: 'W89', reason: 'We don t have any VPC in the stack, we only use serverless services' }]);
    addCfnSuppressRules(saveSessionToDdb, [{ id: 'W92', reason: 'No need for ReservedConcurrentExecutions, some are used only for the demo website, and others are not used in a concurrent mode.' }]);


    demoAssetsTable.grantReadData(generateToken);
    props.sessionsTable.grantReadWriteData(saveSessionToDdb);

    props.secrets.primarySecret.grantRead(generateToken);
    props.secrets.secondarySecret.grantRead(generateToken);
    //endpoint creation using a CloudFront Distribution in front of an HTTP API
    new Endpoints(this, "Endpoints", {
      generateTokenLambdaFunction: generateToken,
      saveSessionToDDBLambdaFunction: saveSessionToDdb,
      sig4LambdaVersionParamName: props.sig4LambdaVersionParamName,
      sig4LambdaRoleArn: props.sig4LambdaRoleArn,
      demoWebsite: props.configuration.api?.demo as boolean
    });

    //build a CloudWatch Dashboard to display some metrics from generateToken Lambda
    props.dashboard.buildApiDashboard({
      lambdaFunctionName: generateToken.functionName,
      region: Aws.REGION,
    });
  }
}
