#!/bin/bash
#
# CTA-5007-B Solution CloudFormation Template Builder
#

set -e

# Check parameters
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: ./build-s3-dist.sh <bucket-name> <solution-name> <version>"
    echo "Example: ./build-s3-dist.sh my-bucket cta-secure-media-delivery v1.0.0"
    exit 1
fi

export DIST_OUTPUT_BUCKET=$1
export SOLUTION_NAME=$2
export DIST_VERSION=$3
export SOLUTION_ID=SO0195-CTA

# Directories
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"

echo "------------------------------------------------------------------------------"
echo "[Init] Clean previous builds"
echo "------------------------------------------------------------------------------"
rm -rf $template_dist_dir $build_dist_dir $staging_dist_dir
mkdir -p $template_dist_dir $build_dist_dir $staging_dist_dir

echo "------------------------------------------------------------------------------"
echo "[Build] CDK Synthesis"
echo "------------------------------------------------------------------------------"
cd $source_dir

# Install dependencies
npm install

# Build TypeScript
npm run build

# Create default configuration for synthesis
cat > cta.config.json << EOF
{
  "main": {
    "stackName": "CTASecureMedia",
    "region": "us-east-1",
    "enableAutoRevocation": true,
    "revocationFrequency": "10m",
    "enableDemo": true
  },
  "bedrock": {
    "model": "amazon.nova-pro-v1:0",
    "region": "us-east-1"
  }
}
EOF

# Synthesize CloudFormation templates
npx cdk synth --all --output $staging_dist_dir

echo "------------------------------------------------------------------------------"
echo "[Build] Process Templates"
echo "------------------------------------------------------------------------------"

# Copy templates to global assets
cp $staging_dist_dir/*.template.json $template_dist_dir/

# Rename main template
mv $template_dist_dir/CTASecureMedia.template.json $template_dist_dir/cta-secure-media-delivery.template

# Process auto-revocation template if exists
if [ -f "$staging_dist_dir/CTASecureMediaAutoRevocation.template.json" ]; then
    mv $template_dist_dir/CTASecureMediaAutoRevocation.template.json $template_dist_dir/cta-auto-revocation.template
fi

echo "------------------------------------------------------------------------------"
echo "[Build] Package Lambda Functions"
echo "------------------------------------------------------------------------------"

# Package Lambda functions
cd $source_dir
zip -r $build_dist_dir/cta-lambda-functions.zip lambda/ -x "*.ts" "*.map"

# Package demo website
if [ -d "resources/demo-website" ]; then
    zip -r $build_dist_dir/cta-demo-website.zip resources/demo-website/
fi

echo "------------------------------------------------------------------------------"
echo "[Build] Update Template References"
echo "------------------------------------------------------------------------------"

# Update S3 bucket references in templates
for template in $template_dist_dir/*.template; do
    if [ -f "$template" ]; then
        # Replace asset references with S3 bucket references
        sed -i.bak "s/\${AWS::Region}/$DIST_OUTPUT_BUCKET-\${AWS::Region}/g" $template
        sed -i.bak "s/asset\.[a-f0-9]*/cta-lambda-functions.zip/g" $template
        rm $template.bak
    fi
done

echo "------------------------------------------------------------------------------"
echo "[Build] Generate Deployment Guide"
echo "------------------------------------------------------------------------------"

cat > $template_dist_dir/DEPLOYMENT.md << EOF
# CTA-5007-B CloudFormation Deployment

## Prerequisites
- AWS CLI configured
- S3 bucket for deployment assets
- CloudFront Functions CWT preview access

## Deployment Steps

### 1. Upload Assets
\`\`\`bash
aws s3 sync ./regional-s3-assets/ s3://$DIST_OUTPUT_BUCKET-\${AWS_REGION}/$SOLUTION_NAME/$DIST_VERSION/
aws s3 sync ./global-s3-assets/ s3://$DIST_OUTPUT_BUCKET-\${AWS_REGION}/$SOLUTION_NAME/$DIST_VERSION/
\`\`\`

### 2. Deploy Main Stack
\`\`\`bash
aws cloudformation create-stack \\
  --stack-name CTASecureMedia \\
  --template-url https://$DIST_OUTPUT_BUCKET-\${AWS_REGION}.s3.amazonaws.com/$SOLUTION_NAME/$DIST_VERSION/cta-secure-media-delivery.template \\
  --capabilities CAPABILITY_IAM \\
  --parameters ParameterKey=EnableDemo,ParameterValue=true
\`\`\`

### 3. Deploy Auto-Revocation (Optional)
\`\`\`bash
aws cloudformation create-stack \\
  --stack-name CTAAutoRevocation \\
  --template-url https://$DIST_OUTPUT_BUCKET-\${AWS_REGION}.s3.amazonaws.com/$SOLUTION_NAME/$DIST_VERSION/cta-auto-revocation.template \\
  --capabilities CAPABILITY_IAM \\
  --parameters ParameterKey=MainStackName,ParameterValue=CTASecureMedia
\`\`\`

## Parameters
- **EnableDemo**: Deploy demo website (true/false)
- **BedrockModel**: Nova model (amazon.nova-pro-v1:0 or amazon.nova-lite-v1:0)
- **RevocationFrequency**: Auto-revocation frequency (5m, 10m, 30m, 1h)
EOF

echo "------------------------------------------------------------------------------"
echo "[Completed] Build Summary"
echo "------------------------------------------------------------------------------"
echo "Templates: $template_dist_dir"
echo "Assets: $build_dist_dir"
echo ""
echo "Upload to S3:"
echo "aws s3 sync ./regional-s3-assets/ s3://$DIST_OUTPUT_BUCKET-\${AWS_REGION}/$SOLUTION_NAME/$DIST_VERSION/"
echo "aws s3 sync ./global-s3-assets/ s3://$DIST_OUTPUT_BUCKET-\${AWS_REGION}/$SOLUTION_NAME/$DIST_VERSION/"
