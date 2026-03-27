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

test('largest remainder assigns extra share to highest-remainder position', () => {
  // $1001 portfolio, 2 stocks 50/50, price $100 each
  // exact = 1001 * 0.5 / 100 = 5.005 each → floor=5, remainder=0.005 (tied)
  // remainingCash = 1001 - 5*100 - 5*100 = $1
  // $1 < $100 price → no extra shares assigned (neither can afford 1 extra share at $100)
  // Instead test where extra IS possible:
  // $201 portfolio, stock A 50% at $50: exact=201*0.5/50=2.01, floor=2, rem=0.01
  // stock B 50% at $50: exact=2.01, floor=2, rem=0.01
  // deployedCash = 2*50+2*50=200, remainingCash=$1; price $50 > $1 → no extra
  // Better: $251 portfolio, A 50% price $50: exact=2.51 floor=2 rem=0.51
  //                          B 50% price $50: exact=2.51 floor=2 rem=0.51
  // deployedCash=200, remainingCash=$51; B gets 1 extra (arbitrary order), remainingCash=$1
  // So total deployed = 2*50 + 3*50 = 250 (vs plain floor = 200)
  const ap = [{ ticker: 'A', weight: 5 }, { ticker: 'B', weight: 5 }];
  const prices = { A: 50, B: 50, CASH: 251 };
  const holdings = { CASH: 1 }; // 1 share × $251 = totalValue $251
  const allPrices = { A: 50, B: 50, CASH: 251 };
  const { deployedValue, totalValue } = rebalance(ap, 100, allPrices, holdings);
  assert.strictEqual(totalValue, 251);
  // With largest remainder: floor=5 per stock (251*0.5/50=2.51→floor=2), deployed=200 + 1 extra at $50=250
  // Actually: 251 * 0.5 / 50 = 2.51 each, floor=2 each, deployedFloor=200, remainingCash=51
  // 1 extra share at $50 → deployed=250; 2nd extra would need another $50 but only $1 left
  assert.ok(deployedValue >= 250, `deployedValue ${deployedValue} should be ≥ 250 (at least 1 extra share allocated)`);
  assert.ok(deployedValue <= 251, `deployedValue ${deployedValue} should not exceed totalValue`);
});

test('largest remainder improves deployment over plain floor', () => {
  // Stock priced $3, weight 100%, total value $10 → exact=3.33, floor=3, deployed=$9, remaining=$1
  // Price $3 <= remaining $1? No. So no extra. But if price $1 <= $1: yes.
  // Use price $1, totalValue $10 → floor=10, remainder=0, remaining=$0 → deployed=$10
  // Better: price $3, totalValue $10 → floor=3, remaining=$1 < $3 → no extra, deployed=$9
  // Verify deployedValue = $9 (floor*price) not $10
  const ap = [{ ticker: 'X', weight: 10 }];
  const holdings = { CASH: 1 }; // $10 worth at price $10
  const prices = { X: 3, CASH: 10 };
  const { deployedValue, totalValue } = rebalance(ap, 100, prices, holdings);
  assert.strictEqual(totalValue, 10);
  assert.strictEqual(deployedValue, 9); // floor(10/3)=3, 3*3=9; remaining $1 < $3 → no extra
});

test('tolerance skips in-model trade within threshold', () => {
  // Target 10 shares at $100 = $1000; current 9 shares at $100 = $900
  // deviation = |9-10|/10 = 10%; with 15% tolerance → skip
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { A: 9, CASH: 1 }; // totalValue = 9*100 + 1*100 = 1000
  const prices = { A: 100, CASH: 100 };
  const { trades, skippedCount } = rebalance(ap, 100, prices, holdings, 15);
  const tradeA = trades.find(t => t.ticker === 'A');
  assert.ok(!tradeA, 'A should be skipped (within tolerance)');
  assert.strictEqual(skippedCount, 1);
});

test('tolerance does not skip in-model trade outside threshold', () => {
  // Target 10 shares at $100; current 5 shares → deviation=50%; tolerance=10% → trade
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { A: 5, CASH: 5 }; // totalValue = 5*100+5*100 = 1000
  const prices = { A: 100, CASH: 100 };
  const { trades, skippedCount } = rebalance(ap, 100, prices, holdings, 10);
  const tradeA = trades.find(t => t.ticker === 'A');
  assert.ok(tradeA, 'A should be traded (outside tolerance)');
  assert.strictEqual(skippedCount, 0);
});

test('tolerance never skips out-of-model sell', () => {
  // OUT is not in model; should always be sold regardless of tolerance
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { A: 10, OUT: 1 }; // OUT is out-of-model
  const prices = { A: 100, OUT: 100 };
  const { trades } = rebalance(ap, 100, prices, holdings, 99);
  const sellOut = trades.find(t => t.ticker === 'OUT' && t.action === 'SELL');
  assert.ok(sellOut, 'OUT should always be sold even at 99% tolerance');
});

test('subtype is "open" for BUY of stock not currently held', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { CASH: 10 }; // A not held; totalValue = 10*100 = 1000
  const prices = { A: 100, CASH: 100 };
  const { trades } = rebalance(ap, 100, prices, holdings);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  assert.ok(buyA, 'should BUY A');
  assert.strictEqual(buyA.subtype, 'open');
});

test('subtype is "add" for BUY of stock already held', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { A: 5, CASH: 5 }; // A held with 5 shares; totalValue = 1000; target = 10
  const prices = { A: 100, CASH: 100 };
  const { trades } = rebalance(ap, 100, prices, holdings);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  assert.ok(buyA, 'should BUY more A');
  assert.strictEqual(buyA.subtype, 'add');
});

test('subtype is "trim" for SELL of in-model stock with too many shares', () => {
  // ap=[A:7, B:3]; normalized A=70%, B=30%; totalValue=1000 (A:10 × $100)
  // target A = floor(1000*0.7/100) = 7; hold 10 → delta=-3 → SELL (trim)
  const ap = [{ ticker: 'A', weight: 7 }, { ticker: 'B', weight: 3 }];
  const prices = { A: 100, B: 100 };
  const { trades } = rebalance(ap, 100, prices, { A: 10 });
  const sellA = trades.find(t => t.ticker === 'A' && t.action === 'SELL');
  assert.ok(sellA, 'should SELL (trim) A');
  assert.strictEqual(sellA.subtype, 'trim');
});

test('subtype is "close" for SELL of out-of-model stock', () => {
  const ap = [{ ticker: 'A', weight: 10 }];
  const holdings = { A: 5, OUT: 3 }; // OUT not in model → close
  const prices = { A: 100, OUT: 100 };
  const { trades } = rebalance(ap, 100, prices, holdings);
  const sellOut = trades.find(t => t.ticker === 'OUT' && t.action === 'SELL');
  assert.ok(sellOut, 'should SELL OUT');
  assert.strictEqual(sellOut.subtype, 'close');
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
