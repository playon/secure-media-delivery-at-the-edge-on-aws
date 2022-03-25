#!/bin/bash
#
#  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
#  with the License. A copy of the License is located at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
#  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
#  and limitations under the License.
#
set -x
# Important: CDK global version number
cdk_version=2.15.0

# Check to see if the required parameters have been provided:
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Please provide the base source bucket name, trademark approved solution name and version where the lambda code will eventually reside."
    echo "For example: ./build-s3-dist.sh solutions trademarked-solution-name v1.0.0"
    exit 1
fi

export DIST_VERSION=$3
export DIST_OUTPUT_BUCKET=$1
export SOLUTION_ID=SO0030
export SOLUTION_NAME=$2
export SOLUTION_TRADEMARKEDNAME=$2

# Get reference for all important folders
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"


[ "$DEBUG" == 'true' ] && set -x
set -e

echo "------------------------------------------------------------------------------"
echo "[Init] Remove any old dist files from previous runs"
echo "------------------------------------------------------------------------------"

echo "rm -rf $template_dist_dir"
rm -rf $template_dist_dir
echo "mkdir -p $template_dist_dir"
mkdir -p $template_dist_dir
echo "rm -rf $build_dist_dir"
rm -rf $build_dist_dir
echo "mkdir -p $build_dist_dir"
mkdir -p $build_dist_dir
echo "rm -rf $staging_dist_dir"
rm -rf $staging_dist_dir
echo "mkdir -p $staging_dist_dir"
mkdir -p $staging_dist_dir

echo "------------------------------------------------------------------------------"
echo "[Synth] CDK Project"
echo "------------------------------------------------------------------------------"

# Install the global aws-cdk package
echo "cd $source_dir"
cd $source_dir
echo "npm install aws-cdk@$cdk_version"
npm install aws-cdk@$cdk_version

echo "------------------------------------------------------------------------------"
echo "NPM Install in the source folder"
echo "------------------------------------------------------------------------------"

# Install the npm install in the source folder
echo "npm install"
npm install

mv solution.context.json.template solution.context.json

# Run 'cdk synth' to generate raw solution outputs
echo "cd "$source_dir""
cd "$source_dir"
echo "node_modules/aws-cdk/bin/cdk synth --output=$staging_dist_dir"
npm run build && node_modules/aws-cdk/bin/cdk synth --output=$staging_dist_dir --no-version-reporting


CDK_BUCKET_NAME=`grep -o '"bucketName": "[^"]*' $staging_dist_dir/*.assets.json | grep -o '[^"]*$' | head -1 `
echo $CDK_BUCKET_NAME
#cp cdk.out/LIVE.template.json cdk.out/LIVE.template.json.mod
echo sed -i'' -e "s/$CDK_BUCKET_NAME/$TEMPLATE_OUTPUT_BUCKET/g" $staging_dist_dir/*.template.json
sed -i'' -e "s/$CDK_BUCKET_NAME/$TEMPLATE_OUTPUT_BUCKET/g" $staging_dist_dir/*.template.json

#exit
for CDK_KEY in `ls $staging_dist_dir/ | grep '^asset'`; do
	echo "CDK_KEY=$CDK_KEY"
    WORDTOREMOVE="asset."
    ITEM=${CDK_KEY//$WORDTOREMOVE/}

    if [[ $ITEM == *zip ]];
    then
        echo "ZIP-> $ITEM"
        ZIPPED_ITEM=$ITEM

    else
        echo $ITEM
        echo "zipping $CDK_KEY to cdk.out/$ITEM.zip"
        echo zip -r $staging_dist_dir/$ITEM.zip $staging_dist_dir/$CDK_KEY
        zip -r $staging_dist_dir/$ITEM.zip $staging_dist_dir/$CDK_KEY
        rm -rf cdk.out/$CDK_KEY
        ZIPPED_ITEM=$ITEM.zip
    fi
    echo 'ZIPPED_ITEM=$ZIPPED_ITEM'
    SUBFOLDER="assets"

    echo sed -i'' -e "s#$ZIPPED_ITEM#$SUBFOLDER/$ZIPPED_ITEM#g" $staging_dist_dir/*.template.json
    sed -i'' -e "s#$ZIPPED_ITEM#$SUBFOLDER/$ZIPPED_ITEM#g" $staging_dist_dir/*.template.json

    echo aws s3 cp $staging_dist_dir/$ZIPPED_ITEM s3://$TEMPLATE_OUTPUT_BUCKET/$SOLUTION_NAME/$VERSION/$SUBFOLDER
    aws s3 cp $staging_dist_dir/$ZIPPED_ITEM s3://$TEMPLATE_OUTPUT_BUCKET/$SOLUTION_NAME/$VERSION/$SUBFOLDER


    #aws s3 ls $CDK_BUCKET_NAME
done

# Remove unnecessary output files
echo "cd $staging_dist_dir"
cd $staging_dist_dir
echo "rm tree.json manifest.json cdk.out"
rm tree.json manifest.json cdk.out

echo "------------------------------------------------------------------------------"
echo "[Packing] Template artifacts"
echo "------------------------------------------------------------------------------"

# Move outputs from staging to template_dist_dir
echo "Move outputs from staging to template_dist_dir"
echo "cp $template_dir/*.template $template_dist_dir/"
cp $staging_dist_dir/*.template.json $template_dist_dir/
rm *.template.json

# Rename all *.template.json files to *.template
echo "Rename all *.template.json to *.template"
echo "copy templates and rename"
for f in $template_dist_dir/*.template.json; do
    mv -- "$f" "${f%.template.json}.template"
done

cp $template_dist_dir/*.template $build_dist_dir/


