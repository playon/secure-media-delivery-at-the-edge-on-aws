#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

npm install @aws-sdk/client-wafv2@^3
node "${SCRIPTS_TESTS_DIR}/clean_up_script.js"
