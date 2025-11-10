#!/bin/bash
#
# CTA-5007-B Solution Unit Tests
#

set -e

echo "------------------------------------------------------------------------------"
echo "[Test] CTA-5007-B Solution Unit Tests"
echo "------------------------------------------------------------------------------"

# Navigate to source directory
cd "$(dirname "$0")/../source"

echo "[Test] Installing dependencies..."
npm install

echo "[Test] Building TypeScript..."
npm run build

echo "[Test] Running unit tests..."
if [ -f "package.json" ] && grep -q '"test"' package.json; then
    npm test
else
    echo "No unit tests configured yet"
    echo "To add tests, update package.json with test script and add test files"
fi

echo "[Test] Linting code..."
if command -v eslint &> /dev/null; then
    npx eslint . --ext .ts,.js
else
    echo "ESLint not configured - skipping lint check"
fi

echo "[Test] CDK synthesis test..."
npx cdk synth --quiet > /dev/null
echo "CDK synthesis successful"

echo "------------------------------------------------------------------------------"
echo "[Test] All tests completed successfully"
echo "------------------------------------------------------------------------------"
