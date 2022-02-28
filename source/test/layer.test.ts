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

import '@aws-cdk/assert/jest';
import * as cdk from '@aws-cdk/core';
import * as sinon from 'sinon';
import { assert } from 'sinon';
import { LambdaAspect } from '../lib/aspects/apply-to-lambda';
import * as layer from '../lib/awsnodejs-lambda-layer/layers';
import * as CdkSolution from '../lib/cdk-solution-stack';

/*
 * Sample snapshot test
 */
test('Sample snapshot test', () => {
  const localCopySpy = sinon.spy(layer.NodejsLayerVersion,'copyFilesSyncRecursively');
  const app = new cdk.App();
  // WHEN
  const stack = new CdkSolution.HelloSolutionsConstructsStack(app, 'MyTestStack');
  app.node.applyAspect(new LambdaAspect(stack, 'Layer'));
  // THEN
  expect(stack).toHaveResource('AWS::Lambda::LayerVersion', {
    "CompatibleRuntimes": [ 'nodejs14.x' ]
  });

  assert.calledOnce(localCopySpy);
  localCopySpy.restore();
});

