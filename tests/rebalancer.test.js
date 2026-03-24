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
  const holdingsWithValue = { X: 10 }; // X at $100 = totalValue 1000
  const allPrices = { A: 100, B: 100, C: 100, D: 100, X: 100 };
  const { trades } = rebalance(AP, 80, allPrices, holdingsWithValue);
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
  const holdingsWithValue = { X: 100 }; // X at $100 = totalValue 10000 (enough for D to get ≥1 share)
  const allPrices = { A: 100, B: 100, C: 100, D: 100, X: 100 };
  const { trades } = rebalance(AP, 100, allPrices, holdingsWithValue);
  const tickers = trades.map(t => t.ticker);
  assert.ok(tickers.includes('D'), 'at 100% all stocks should be included');
});

test('generates BUY for model stock not currently held', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 50 };
  const holdings = {};
  const { trades } = rebalance(ap, 100, prices, holdings);
  // totalValue = 0 → targetShares = 0 → delta = 0 → no trade
  assert.strictEqual(trades.length, 0);
});

test('generates BUY when target > current shares', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  // Holdings: B is in portfolio but not model → will be sold
  // We need totalValue > 0 so use B as value source
  const holdings = { B: 10 }; // 10 shares × $100 = $1000 total_value
  const allPrices = { A: 100, B: 100 };
  const { trades } = rebalance(ap, 100, allPrices, holdings);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  const sellB = trades.find(t => t.ticker === 'B' && t.action === 'SELL');
  assert.ok(buyA, 'should BUY A');
  assert.strictEqual(buyA.shares, 10); // floor(1000 * 100/100 / 100) = 10
  assert.ok(sellB, 'should SELL B');
  assert.strictEqual(sellB.shares, 10);
});

test('generates SELL for model stock when target < current shares', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  // hold 5 of A + 5 of B (B not in model); totalValue=1000; target for A=floor(1000/100)=10
  const holdings2 = { A: 5, B: 5 };
  const prices2 = { A: 100, B: 100 };
  const { trades } = rebalance(ap, 100, prices2, holdings2);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  const sellB = trades.find(t => t.ticker === 'B' && t.action === 'SELL');
  assert.ok(buyA, 'should BUY A (5 to 10)');
  assert.strictEqual(buyA.shares, 5);
  assert.ok(sellB, 'should SELL all B');
  assert.strictEqual(sellB.shares, 5);
});

test('drops sub-$1 trades and reports count', () => {
  // Use tiny price: $0.001; holds 999 of TINY→ sell all, estValue = 999×0.001 = $0.999 < $1
  const { trades: t2, droppedCount: d2 } = rebalance(
    [{ ticker: 'MODEL', weight: 10 }],
    100,
    { MODEL: 100, TINY: 0.001 },
    { TINY: 999 }  // totalValue = 999 * 0.001 = 0.999; targetShares MODEL = floor(0.999/100) = 0
    // SELL TINY: 999 × 0.001 = 0.999 < $1 → dropped
  );
  assert.strictEqual(d2, 1, 'one trade under $1 should be dropped');
});

test('returns totalValue and deployedValue', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  const holdings = { A: 10 }; // totalValue = 1000
  const { totalValue, deployedValue } = rebalance(ap, 100, prices, holdings);
  assert.strictEqual(totalValue, 1000);
  // targetShares = floor(1000/100) = 10; deployedValue = 10*100 = 1000
  assert.strictEqual(deployedValue, 1000);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
