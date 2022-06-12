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
cdk_version=2.24.1

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
stack_name=`grep -o '"stack_name": "[^"]*' solution.context.json | grep -o '[^"]*$' | head -1 `
# Run 'cdk synth' to generate raw solution outputs
echo "cd "$source_dir""
cd "$source_dir"

chmod +x ./install_dependencies.sh && ./install_dependencies.sh

echo "node_modules/aws-cdk/bin/cdk synth -q --output=$staging_dist_dir"

npm run build && node_modules/aws-cdk/bin/cdk synth -q --output=$staging_dist_dir --no-version-reporting

############ Tweak template #############
#
# 1. CDK generated template uses a CDK generated bucket for assets. Replacing this bucket with BUILD_OUTPUT_BUCKET in both templates
# 2. The assets are folder on the disk (and some are already zipped).
#         1 - zipping all assets folder
#         2 - renaming the zip
#         3 - update the template to use the zip name and to use BUILD_OUTPUT_BUCKET as bucket
#         4 - upload the zips to BUILD_OUTPUT_BUCKET
# 2. Some policies have a hardcoded AccountID; Replacing it with "AWS::AccountId" so that this template can be deployed in any AWS account
# 3. Some policies have a hardcoded Region; Replacing it with "AWS::Region" so that this template can be deployed in any AWS region

cdk_bucket_name=`grep -o '"bucketName": "[^"]*' $staging_dist_dir/${stack_name}.assets.json | grep -o '[^"]*$' | head -1 `
echo "cdk_bucket_name=$cdk_bucket_name"
cdk_bucket_name_useast1=`grep -o '"bucketName": "[^"]*' $staging_dist_dir/${stack_name}UsEast1Stack.assets.json | grep -o '[^"]*$' | head -1 `
echo "cdk_bucket_name_useast1=$cdk_bucket_name_useast1"

new_bucket_name="{\"Fn::Sub\": \"$BUILD_OUTPUT_BUCKET-\${AWS::Region}\" }"

#update asset bucket name in main template
sed -i'' -e s"/\"$cdk_bucket_name\"/$new_bucket_name/" $staging_dist_dir/${stack_name}.template.json
#update asset bucket name in us-east-1 template
sed -i'' -e s"#\"$cdk_bucket_name_useast1\"#$new_bucket_name#" $staging_dist_dir/${stack_name}UsEast1Stack.template.json


#replace bucket name in policy [ ":s3:::cdk-bucket-xxxxx" ] -> [ ":s3:::", "my-bucket-xxxxxx", "-", {"Ref": "AWS::Region"} ]
str_to_replace1=":s3:::${cdk_bucket_name}"
string1=" \":s3:::\", \"$BUILD_OUTPUT_BUCKET\", \"-\", {\"Ref\": \"AWS::Region\"} "
sed -i'' -e s"#\"$str_to_replace1\"#$string1#" $staging_dist_dir/${stack_name}.template.json


#replace bucket name in policy [ ":s3:::cdk-bucket-xxxxx/*" ] -> [ ":s3:::", "$BUILD_OUTPUT_BUCKET", "-", {"Ref": "AWS::Region"} ]
str_to_replace2=":s3:::${cdk_bucket_name}/\*"
string2=" \":s3:::\", \"$BUILD_OUTPUT_BUCKET\", \"-\", {\"Ref\": \"AWS::Region\"}, \"/\*\" "
sed -i'' -e s"#\"$str_to_replace2\"#$string2#" $staging_dist_dir/${stack_name}.template.json

#replace policy this [ "states.MY_REGION.amazonaws.com" ] -> [ { "Fn::Sub": "states.${AWS::Region}.amazonaws.com" } ]
str_to_replace3="states.us-west-2.amazonaws.com"
string3="{ \"Fn::Sub\": \"states.\${AWS::Region}.amazonaws.com\" } "
sed -i'' -e s"#\"$str_to_replace3\"#$string3#" $staging_dist_dir/${stack_name}.template.json


#replace policy [":execute-api:MY_REGION:MY_ACCOUNT_ID:"] -> [ ":execute-api:", {"Ref": "AWS::Region"}, ":", {"Ref": "AWS::AccountId"} , ":" ]
DATA=`more ${staging_dist_dir}/${stack_name}.template.json`
echo "replace policy for api gw"
if [[ "$DATA" =~ :execute-api:([^:\n]*):([^:\n]*): ]]; then
	my_region=${BASH_REMATCH[1]}
	my_account_id=${BASH_REMATCH[2]}

    echo "region=$my_region"
    echo "my_account_id=$my_account_id"

	str_to_replace4=":execute-api:${my_region}:${my_account_id}:"
    echo "str_to_replace4=$str_to_replace4"
	string4=" \":execute-api:\",{\"Ref\": \"AWS::Region\"}, \":\", {\"Ref\": \"AWS::AccountId\"} , \":\" "
	sed -i'' -e s"#\"$str_to_replace4\"#$string4#" ${staging_dist_dir}/${stack_name}.template.json
fi;


#zipping the assets
i=1
cd $staging_dist_dir
echo "Searching for assets..."
for cdk_key in `ls  | grep '^asset'`; do
    wordtoremove="asset."
    item=${cdk_key//$wordtoremove/}
    asset_new_name="myasset_$i.zip"

    if [[ $item == *zip ]];
    then
        mv $cdk_key $asset_new_name
        current_asset_name=$item
    else
        cd $cdk_key
        echo "zipping $cdk_key to $asset_new_name"
        zip -qr $asset_new_name .
        cd ..
        mv $cdk_key/$asset_new_name $asset_new_name
        rm -rf $cdk_key
        current_asset_name=$item.zip
    fi

    sed -i'' -e "s#$current_asset_name#$SOLUTION_NAME/$VERSION/$asset_new_name#g" $staging_dist_dir/$stack_name.template.json
    sed -i'' -e "s#$current_asset_name#$SOLUTION_NAME/$VERSION/$asset_new_name#g" $staging_dist_dir/${stack_name}UsEast1Stack.template.json


    let "i+=1"

done


echo "Assets zipped"

############ End tweak template #############


# Remove unnecessary output files
echo "cd $staging_dist_dir"
cd $staging_dist_dir
echo "rm tree.json manifest.json cdk.out"
rm tree.json manifest.json cdk.out

echo "------------------------------------------------------------------------------"
echo "[Packing] Template artifacts"
echo "------------------------------------------------------------------------------"

# Move outputs from staging to template_dist_dir
echo ls $staging_dist_dir/
ls $staging_dist_dir/
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

#cp $template_dist_dir/*.template $build_dist_dir/
echo cp $staging_dist_dir/*.zip $build_dist_dir/
cp $staging_dist_dir/*.zip $build_dist_dir/



