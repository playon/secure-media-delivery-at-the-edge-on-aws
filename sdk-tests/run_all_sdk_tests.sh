#!/bin/bash

echo "🚀 Secure Media Delivery SDK Test Suite"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
declare -A results

# Function to run test and capture result
run_test() {
    local name="$1"
    local command="$2"
    local color="$3"
    
    echo -e "${color}Testing $name SDK...${NC}"
    echo "----------------------------------------"
    
    if eval "$command"; then
        results["$name"]="✅ PASSED"
        echo -e "${GREEN}$name SDK test completed successfully${NC}"
    else
        results["$name"]="❌ FAILED"
        echo -e "${RED}$name SDK test failed${NC}"
    fi
    echo ""
}

# Run all SDK tests
run_test "Node.js" "node test_nodejs_fixed.js" "$YELLOW"
run_test "Python" "python3 test_python_fixed.py" "$BLUE"

# Summary
echo "=========================================="
echo "📊 Test Results Summary"
echo "=========================================="

total_tests=0
passed_tests=0

for sdk in "Node.js" "Python"; do
    total_tests=$((total_tests + 1))
    result="${results[$sdk]}"
    echo -e "$sdk: $result"
    if [[ "$result" == *"PASSED"* ]]; then
        passed_tests=$((passed_tests + 1))
    fi
done

echo ""
echo "Total: $passed_tests/$total_tests tests passed"

if [ $passed_tests -eq $total_tests ]; then
    echo -e "${GREEN}🎉 All SDK tests completed successfully!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some SDK tests require dependency installation${NC}"
    echo ""
    echo "To install dependencies:"
    echo "• Node.js: cd Secure-media-delivery-at-the-edge/source/resources/sdk/node/v1 && npm install"
    echo "• Python:  cd Secure-media-delivery-at-the-edge/source/resources/sdk/python/v1 && pip install -r requirements.txt"
    exit 1
fi
