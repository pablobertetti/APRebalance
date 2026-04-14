#!/bin/bash
set -e
echo "Running tests..."
node tests/ap-parser.test.js
node tests/portfolio-parser.test.js
node tests/rebalancer.test.js
node tests/index-sync.test.js
echo "All tests passed."
