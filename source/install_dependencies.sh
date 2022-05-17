#!/bin/bash
#
echo "Install node dependencies"
npm install

echo "Install aws_secure_media_delivery NodeJs dependencies for AWS Lambda"
npm install --prefix lambda/layers/aws_secure_media_delivery_nodejs/nodejs

echo "Create create a virtualenv"
python3 -m venv .venv

echo "Activate your virtualenv"
source .venv/bin/activate

echo "Install jsonpath Python dependencies for AWS Lambda"
pip install -r lambda/layers/jsonpath/requirements.txt -t lambda/layers/jsonpath/python

echo "Copy aws_secure_media_delivery python lib to AWS Lambda Layer"
cp resources/sdk/python/v1/aws_secure_media_delivery.py lambda/layers/aws_secure_media_delivery_python/python

echo "Install aws_secure_media_delivery Python dependencies for AWS Lambda"
pip install -r lambda/layers/aws_secure_media_delivery_python/python/requirements.txt -t lambda/layers/aws_secure_media_delivery_python/python


deactivate
