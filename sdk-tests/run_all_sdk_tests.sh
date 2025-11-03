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

# Make scripts executable
chmod +x test_*.sh test_*.pl test_*.rb 2>/dev/null

# Run all SDK tests
run_test "Node.js" "node test_nodejs_sdk.js" "$YELLOW"
run_test "Python" "python3 test_python_sdk.py" "$BLUE"  
run_test "Ruby" "ruby test_ruby_sdk.rb" "$RED"
run_test "Go" "go run test_go_sdk.go" "$GREEN"
run_test "Java" "javac TestJavaSDK.java && java TestJavaSDK" "$YELLOW"
run_test "Perl" "perl test_perl_sdk.pl" "$BLUE"

# Summary
echo "=========================================="
echo "📊 Test Results Summary"
echo "=========================================="

total_tests=0
passed_tests=0

for sdk in "Node.js" "Python" "Ruby" "Go" "Java" "Perl"; do
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
    echo "• Ruby:    cd Secure-media-delivery-at-the-edge/source/resources/sdk/ruby/v1 && bundle install"
    echo "• Go:      cd Secure-media-delivery-at-the-edge/source/resources/sdk/go/v1 && go mod tidy"
    echo "• Java:    cd Secure-media-delivery-at-the-edge/source/resources/sdk/java/v1 && mvn compile"
    echo "• Perl:    cd Secure-media-delivery-at-the-edge/source/resources/sdk/perl/v1 && perl Makefile.PL && make"
    exit 1
fi
