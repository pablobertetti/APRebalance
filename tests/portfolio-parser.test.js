const assert = require('assert');
const { parsePortfolio, isValidPortfolio } = require('../src/portfolio-parser.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}

test('parses basic CSV with spaces', () => {
  const { holdings, errors } = parsePortfolio('AAPL, 10\nMSFT, 5');
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(holdings['AAPL'], 10);
  assert.strictEqual(holdings['MSFT'], 5);
});

test('parses CSV without spaces after comma', () => {
  const { holdings } = parsePortfolio('AAPL,10');
  assert.strictEqual(holdings['AAPL'], 10);
});

test('normalizes tickers to uppercase', () => {
  const { holdings } = parsePortfolio('aapl, 10');
  assert.ok(holdings['AAPL'], 'AAPL should be present');
  assert.ok(!holdings['aapl'], 'lowercase should not be present');
});

test('ignores blank lines', () => {
  const { holdings, errors } = parsePortfolio('AAPL, 10\n\n\nMSFT, 5\n');
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(Object.keys(holdings).length, 2);
});

test('sums duplicate tickers', () => {
  const { holdings } = parsePortfolio('AAPL, 10\nAAPL, 5');
  assert.strictEqual(holdings['AAPL'], 15);
});

test('ignores zero-share holdings after summing', () => {
  const { holdings } = parsePortfolio('AAPL, 0');
  assert.ok(!holdings['AAPL'], 'zero-share holding should be excluded');
});

test('strips whitespace from ticker and shares fields', () => {
  const { holdings } = parsePortfolio('  AAPL  ,  10  ');
  assert.strictEqual(holdings['AAPL'], 10);
});

test('returns errors for invalid lines', () => {
  const { errors } = parsePortfolio('AAPL, 10\nbadline\nMSFT, 5');
  assert.strictEqual(errors.length, 1);
});

test('isValidPortfolio returns true for valid input', () => {
  assert.strictEqual(isValidPortfolio('AAPL, 10\nMSFT, 5'), true);
});

test('isValidPortfolio returns false for empty input', () => {
  assert.strictEqual(isValidPortfolio(''), false);
  assert.strictEqual(isValidPortfolio('   \n  '), false);
});

test('isValidPortfolio returns false if any line is invalid', () => {
  assert.strictEqual(isValidPortfolio('AAPL, 10\nbadline'), false);
});

test('isValidPortfolio returns false if all holdings are zero', () => {
  assert.strictEqual(isValidPortfolio('AAPL, 0'), false);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
