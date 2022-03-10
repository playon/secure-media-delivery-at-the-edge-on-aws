#!/bin/bash
#
echo "Install node depencies"
npm install

echo "Install dependencies for AWS Lambda"
npm install --prefix lambda/layers/aws_secure_media_delivery_nodejs/nodejs


