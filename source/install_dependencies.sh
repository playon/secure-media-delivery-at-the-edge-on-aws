#!/bin/bash
#
echo "Install node dependencies"
npm install

echo "Install NodeJs dependencies for AWS Lambda"
npm install --prefix lambda/layers/aws_secure_media_delivery_nodejs/nodejs

echo "Create create a virtualenv"
python3 -m venv .venv

echo "Activate your virtualenv"
source .venv/bin/activate

echo "Install Python dependencies for AWS Lambda"
pip install -r lambda/layers/jsonpath/requirements.txt -t lambda/layers/jsonpath/python


