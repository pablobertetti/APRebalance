const assert = require('assert');
const { rebalance } = require('../src/rebalancer.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}

// Helper: minimal prices and empty holdings for filter tests
function pricesFor(stocks) {
  return Object.fromEntries(stocks.map(s => [s.ticker, 100]));
}

// AP stocks with clear weight ordering
const AP = [
  { ticker: 'A', weight: 5 },
  { ticker: 'B', weight: 3 },
  { ticker: 'C', weight: 2 },
  { ticker: 'D', weight: 1 },
];
// totalAPWeight = 11; threshold at 80% = 8.8

test('includes enough stocks to meet coverage threshold', () => {
  // A=5, A+B=8 < 8.8, A+B+C=10 >= 8.8 → model = [A, B, C]
  const { trades } = rebalance(AP, 80, pricesFor(AP), {});
  // All model stocks have 0 current shares → BUY
  const tickers = trades.map(t => t.ticker);
  assert.ok(tickers.includes('A'), 'A should be in model');
  assert.ok(tickers.includes('B'), 'B should be in model');
  assert.ok(tickers.includes('C'), 'C should be in model');
  assert.ok(!tickers.includes('D'), 'D should be excluded');
});

test('normalized weights for selected stocks sum to 100', () => {
  // selectedWeightSum = A(5)+B(3)+C(2) = 10
  // normalizedWeights: A=50, B=30, C=20
  // With 1000 total_value and price=100:
  // A: floor(1000*50/100/100) = floor(5) = 5 shares
  // B: floor(1000*30/100/100) = floor(3) = 3 shares
  // C: floor(1000*20/100/100) = floor(2) = 2 shares
  const holdingsWithValue = { X: 10 }; // X at price 100 = total_value 1000
  const allPrices = { A: 100, B: 100, C: 100, D: 100, X: 100 };
  const { trades } = rebalance(AP, 80, allPrices, holdingsWithValue);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  const buyB = trades.find(t => t.ticker === 'B' && t.action === 'BUY');
  const buyC = trades.find(t => t.ticker === 'C' && t.action === 'BUY');
  // X is not in model → SELL
  const sellX = trades.find(t => t.ticker === 'X' && t.action === 'SELL');
  assert.ok(buyA, 'should BUY A');
  assert.ok(buyB, 'should BUY B');
  assert.ok(buyC, 'should BUY C');
  assert.ok(sellX, 'should SELL X (not in model)');
  assert.strictEqual(buyA.shares, 5);
  assert.strictEqual(buyB.shares, 3);
  assert.strictEqual(buyC.shares, 2);
});

test('coverage threshold measured against total AP weight, not 100', () => {
  // AP weights sum to 11, not 100
  // 100% coverage → include all
  const { trades } = rebalance(AP, 100, pricesFor(AP), {});
  const tickers = trades.map(t => t.ticker);
  assert.ok(tickers.includes('D'), 'at 100% all stocks should be included');
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
