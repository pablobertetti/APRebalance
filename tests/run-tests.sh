#!/bin/bash
set -e
echo "Running tests..."
node tests/ap-parser.test.js
node tests/portfolio-parser.test.js
node tests/rebalancer.test.js
echo "All tests passed."
