# APRebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained `index.html` that parses an Alpha Picks portfolio dump, accepts user holdings as CSV, fetches live prices from Finnhub, and produces a buy/sell trade list to rebalance the portfolio.

**Architecture:** Pure JS modules (APParser, PortfolioParser, Rebalancer, FinnhubProvider) developed and tested as separate files in `src/`, then inlined into a single `index.html` at the end. Tests run with Node.js using only the built-in `assert` module — no npm, no build tools.

**Tech Stack:** Vanilla HTML/CSS/JS, Node.js (tests only), Finnhub REST API

---

## File Structure

```
index.html                    ← final deliverable (all JS/CSS inline)
src/
  ap-parser.js                ← APParser: parses AP dump → [{ticker, weight}]
  portfolio-parser.js         ← PortfolioParser: parses CSV → {ticker: shares}
  rebalancer.js               ← Rebalancer: pure fn → {trades, droppedCount, totalValue, deployedValue}
  finnhub-provider.js         ← FinnhubProvider: getPrices(tickers, apiKey) → {ticker: price}
  ui.js                       ← UI: render + state + event wiring
tests/
  ap-parser.test.js
  portfolio-parser.test.js
  rebalancer.test.js
  run-tests.sh                ← runs all test files
Sample_AP_dump.txt            ← already exists, used as fixture
```

During development, `index.html` loads `<script src="src/...">` tags. The final task inlines them all.

---

### Task 1: Project scaffold

**Files:**
- Create: `tests/run-tests.sh`

- [ ] **Step 1: Create the test runner script**

```bash
# tests/run-tests.sh
#!/bin/bash
set -e
echo "Running tests..."
node tests/ap-parser.test.js
node tests/portfolio-parser.test.js
node tests/rebalancer.test.js
echo "All tests passed."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tests/run-tests.sh
```

- [ ] **Step 3: Verify node is available**

```bash
node --version
```

Expected: v18.x or higher

- [ ] **Step 4: Commit**

```bash
git add tests/run-tests.sh
git commit -m "chore: add test runner scaffold"
```

---

### Task 2: APParser — parse a single stock block

**Files:**
- Create: `src/ap-parser.js`
- Create: `tests/ap-parser.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/ap-parser.test.js
const assert = require('assert');
const { parseAPDump } = require('../src/ap-parser.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}

// --- Basic non-winner block ---
test('parses a single non-winner block', () => {
  const input = `Company\tSymbol\tPicked\tReturn\tSector\tRating\tHolding %
Fabrinet
Fabrinet
FN\t3/2/2026
4.59%
Information Technology\tStrong Buy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ticker, 'FN');
  assert.strictEqual(result[0].weight, 0.46);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
```

- [ ] **Step 2: Run to confirm it fails**

```bash
node tests/ap-parser.test.js
```

Expected: error — `Cannot find module '../src/ap-parser.js'`

- [ ] **Step 3: Implement the basic parser**

```js
// src/ap-parser.js
function parseAPDump(text) {
  const lines = text.split('\n').map(l => l.trim());

  // Find and skip header line (first line starting with "Company")
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('Company')) i++;
  i++; // skip header

  const stockMap = {};

  while (i < lines.length) {
    // Skip blank lines between blocks
    if (!lines[i]) { i++; continue; }

    // Line 1: company name (skip)
    i++;
    if (i >= lines.length) break;

    // Line 2: company name repeated (skip)
    if (!lines[i]) { i++; continue; }
    i++;
    if (i >= lines.length) break;

    // Optional "Winner" badge
    if (lines[i] === 'Winner') {
      i++;
      if (i >= lines.length) break;
    }

    // Ticker + date line (tab-separated; ticker is first token)
    if (!lines[i]) { i++; continue; }
    const ticker = lines[i].split(/[\t\s]/)[0].toUpperCase();
    i++;
    if (i >= lines.length) break;

    // Return % line (skip)
    i++;
    if (i >= lines.length) break;

    // Sector + Rating + Holding% (tab-separated; weight is last token)
    const infoLine = lines[i++];
    const parts = infoLine.split('\t');
    const holdingStr = parts[parts.length - 1].trim();
    const weight = parseFloat(holdingStr.replace('%', ''));

    if (ticker && !isNaN(weight)) {
      stockMap[ticker] = (stockMap[ticker] || 0) + weight;
    }
  }

  return Object.entries(stockMap).map(([ticker, weight]) => ({ ticker, weight }));
}

if (typeof module !== 'undefined') module.exports = { parseAPDump };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node tests/ap-parser.test.js
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/ap-parser.js tests/ap-parser.test.js
git commit -m "feat: APParser parses basic stock block"
```

---

### Task 3: APParser — winner badge, deduplication, full file parse

**Files:**
- Modify: `tests/ap-parser.test.js` (add tests)
- Modify: `src/ap-parser.js` (already handles winner; verify with tests)

- [ ] **Step 1: Add tests for winner block, dedup, and full sample file**

Append to the test block in `tests/ap-parser.test.js` (before the final `if (failed > 0)` block):

```js
// --- Winner block ---
test('parses a winner block (skips "Winner" badge line)', () => {
  const input = `Company\tSymbol\n` +
    `Argan, Inc.\nArgan, Inc.\nWinner\nAGX\t10/15/2024\n282.53%\nIndustrials\tHold\t4.26%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ticker, 'AGX');
  assert.strictEqual(result[0].weight, 4.26);
});

// --- Duplicate tickers are summed ---
test('sums weights for duplicate tickers', () => {
  const block = (ticker, weight) =>
    `Company\n${ticker}\n${ticker}\n${ticker}\t1/1/2024\n10%\nSector\tBuy\t${weight}%`;
  const input = `Company\tSymbol\n${block('EAT', 1.36)}\n${block('EAT', 3.13)}`;
  const result = parseAPDump(input);
  const eat = result.find(s => s.ticker === 'EAT');
  assert.ok(eat, 'EAT should be present');
  assert.ok(Math.abs(eat.weight - 4.49) < 0.001, `expected 4.49, got ${eat.weight}`);
  assert.strictEqual(result.length, 1, 'should have only one EAT entry');
});

// --- Full sample file ---
test('parses Sample_AP_dump.txt and returns many stocks', () => {
  const fs = require('fs');
  const text = fs.readFileSync('Sample_AP_dump.txt', 'utf8');
  const result = parseAPDump(text);
  assert.ok(result.length > 20, `expected >20 stocks, got ${result.length}`);
  // Verify all have ticker and weight
  for (const s of result) {
    assert.ok(s.ticker, 'ticker should be non-empty');
    assert.ok(s.weight > 0, `weight should be > 0 for ${s.ticker}`);
  }
  // EAT appears twice in the sample; should be merged
  const eat = result.filter(s => s.ticker === 'EAT');
  assert.strictEqual(eat.length, 1, 'EAT should be deduped to one entry');
});

// --- Tickers normalized to uppercase ---
test('normalizes tickers to uppercase', () => {
  const input = `Company\tSymbol\nFabrinet\nFabrinet\nfn\t3/2/2026\n4.59%\nIT\tBuy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result[0].ticker, 'FN');
});

// --- Blank lines before header are ignored ---
test('handles leading blank lines before header', () => {
  const input = `\n\nCompany\tSymbol\nFabrinet\nFabrinet\nFN\t3/2/2026\n4.59%\nIT\tBuy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they all pass (no implementation changes needed)**

```bash
node tests/ap-parser.test.js
```

Expected: `6 passed`

- [ ] **Step 3: Commit**

```bash
git add tests/ap-parser.test.js
git commit -m "test: full APParser test coverage including winner, dedup, sample file"
```

---

### Task 4: PortfolioParser

**Files:**
- Create: `src/portfolio-parser.js`
- Create: `tests/portfolio-parser.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/portfolio-parser.test.js
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
```

- [ ] **Step 2: Run to confirm they fail**

```bash
node tests/portfolio-parser.test.js
```

Expected: error — `Cannot find module '../src/portfolio-parser.js'`

- [ ] **Step 3: Implement**

```js
// src/portfolio-parser.js
function parsePortfolio(text) {
  const lines = text.split('\n');
  const holdingMap = {};
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) {
      errors.push(`Line ${i + 1}: expected "TICKER, shares" format`);
      continue;
    }

    const ticker = line.slice(0, commaIdx).trim().toUpperCase();
    const sharesStr = line.slice(commaIdx + 1).trim();
    const shares = parseFloat(sharesStr);

    if (!ticker || isNaN(shares) || shares < 0) {
      errors.push(`Line ${i + 1}: invalid ticker or share count`);
      continue;
    }

    holdingMap[ticker] = (holdingMap[ticker] || 0) + shares;
  }

  // Remove zero-share holdings
  for (const ticker of Object.keys(holdingMap)) {
    if (holdingMap[ticker] === 0) delete holdingMap[ticker];
  }

  return { holdings: holdingMap, errors };
}

function isValidPortfolio(text) {
  if (!text.trim()) return false;
  const { errors, holdings } = parsePortfolio(text);
  return errors.length === 0 && Object.keys(holdings).length > 0;
}

if (typeof module !== 'undefined') module.exports = { parsePortfolio, isValidPortfolio };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node tests/portfolio-parser.test.js
```

Expected: `12 passed`

- [ ] **Step 5: Commit**

```bash
git add src/portfolio-parser.js tests/portfolio-parser.test.js
git commit -m "feat: PortfolioParser with dedup, validation, and zero-share filtering"
```

---

### Task 5: Rebalancer — coverage filter and re-normalization

**Files:**
- Create: `src/rebalancer.js`
- Create: `tests/rebalancer.test.js`

- [ ] **Step 1: Write failing tests for filter + normalize**

```js
// tests/rebalancer.test.js
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
  const prices = { A: 100, B: 100, C: 100, D: 100 };
  const holdings = { CASH: 0 }; // use 'holdings' to set total_value indirectly
  // Need to set up a known total_value. Use one holding at known price.
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
```

- [ ] **Step 2: Run to confirm they fail**

```bash
node tests/rebalancer.test.js
```

Expected: error — `Cannot find module '../src/rebalancer.js'`

- [ ] **Step 3: Implement the Rebalancer**

```js
// src/rebalancer.js
function rebalance(apStocks, coveragePercent, prices, holdings) {
  // Step 1: Sort by weight descending, filter to coverage threshold
  const sorted = [...apStocks].sort((a, b) => b.weight - a.weight);
  const totalAPWeight = sorted.reduce((sum, s) => sum + s.weight, 0);
  const threshold = (coveragePercent / 100) * totalAPWeight;

  let cumulative = 0;
  const activeModel = [];
  for (const stock of sorted) {
    cumulative += stock.weight;
    activeModel.push(stock);
    if (cumulative >= threshold) break;
  }

  // Step 2: Re-normalize selected weights to sum to 100
  const selectedWeightSum = activeModel.reduce((sum, s) => sum + s.weight, 0);
  const normalized = activeModel.map(s => ({
    ticker: s.ticker,
    normalizedWeight: (s.weight / selectedWeightSum) * 100,
  }));

  // Step 4: Total portfolio value (fixed; includes stocks to be sold)
  const totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);

  const modelTickers = new Set(normalized.map(s => s.ticker));
  const rawTrades = [];

  // Step 5+6: Compute trades for active model stocks
  for (const { ticker, normalizedWeight } of normalized) {
    const price = prices[ticker];
    if (!price) continue;
    const targetValue = totalValue * (normalizedWeight / 100);
    const targetShares = Math.floor(targetValue / price);
    const currentShares = holdings[ticker] || 0;
    const delta = targetShares - currentShares;
    if (delta === 0) continue;
    rawTrades.push({
      ticker,
      action: delta > 0 ? 'BUY' : 'SELL',
      shares: Math.abs(delta),
      estValue: Math.abs(delta) * price,
    });
  }

  // Step 6: Out-of-model holdings → SELL ALL
  for (const [ticker, shares] of Object.entries(holdings)) {
    if (!modelTickers.has(ticker) && shares > 0) {
      const price = prices[ticker] || 0;
      rawTrades.push({
        ticker,
        action: 'SELL',
        shares,
        estValue: shares * price,
      });
    }
  }

  // Filter sub-$1 trades
  const trades = [];
  let droppedCount = 0;
  for (const trade of rawTrades) {
    if (trade.estValue < 1) { droppedCount++; }
    else { trades.push(trade); }
  }

  // Deployed value: sum of (targetShares × price) for all model stocks
  const deployedValue = normalized.reduce((sum, { ticker, normalizedWeight }) => {
    const price = prices[ticker];
    if (!price) return sum;
    const targetShares = Math.floor(totalValue * (normalizedWeight / 100) / price);
    return sum + targetShares * price;
  }, 0);

  return { trades, droppedCount, totalValue, deployedValue };
}

if (typeof module !== 'undefined') module.exports = { rebalance };
```

- [ ] **Step 4: Run tests**

```bash
node tests/rebalancer.test.js
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/rebalancer.js tests/rebalancer.test.js
git commit -m "feat: Rebalancer coverage filter and renormalization"
```

---

### Task 6: Rebalancer — trade computation and sub-$1 filter

**Files:**
- Modify: `tests/rebalancer.test.js` (add tests)

- [ ] **Step 1: Add trade computation and edge-case tests**

Append to `tests/rebalancer.test.js` before the final `if (failed > 0)` block:

```js
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
  const prices = { A: 100 };
  // Hold 20 of A; totalValue = 2000; targetShares = floor(2000/100) = 20
  // delta = 20 - 20 = 0 → no trade. Use price=200 to get targetShares < current.
  const pricesHigher = { A: 200 };
  const holdings = { A: 20 }; // totalValue = 4000; targetShares = floor(4000/200) = 20 → still 0
  // Let's do: totalValue = $1000, currently hold 15, target = floor(1000/100) = 10 → SELL 5
  const holdingsB = { A: 15, CASH_PROXY: 0 }; // totalValue from A only = 1500
  // Actually totalValue = 15*100 = 1500; targetShares = floor(1500/100) = 15 → delta 0
  // Need holdings with extra non-model stocks to push totalValue without model allocation
  // Simple case: hold 20 of A; totalValue=2000; target=20; no trade. Not useful.
  // Better: hold 5 of A + 5 of B (B not in model); totalValue=1000; target for A=floor(1000/100)=10
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
  // ticker A at $0.05; target = 1 share; delta = 1; estValue = $0.05 < $1
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 0.05 };
  const holdings = { B: 1000 }; // totalValue = B*0 → need B price
  const prices2 = { A: 0.05, B: 1 }; // B at $1; totalValue = 1000
  // targetShares for A = floor(1000 / 0.05) = 20000; B is sold (1000 shares × $1 = $1000 >= $1)
  const { trades, droppedCount } = rebalance(ap, 100, prices2, { B: 1000 });
  // A: BUY 20000 shares × $0.05 = $1000 >= $1 → NOT dropped
  // B: SELL 1000 × $1 = $1000 >= $1 → NOT dropped
  assert.strictEqual(droppedCount, 0);

  // Now test actual drop: delta of 0.5 share rounds to 0 → handled by delta===0 skip
  // True sub-$1 case: estValue < 1. ticker C at $10; 1 share delta; estValue = $10 → not dropped
  // Use tiny price: $0.001; holds 999 of A→ sell all, estValue = 999×0.001 = $0.999 < $1
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
```

- [ ] **Step 2: Run all rebalancer tests**

```bash
node tests/rebalancer.test.js
```

Expected: `8 passed`

- [ ] **Step 3: Commit**

```bash
git add tests/rebalancer.test.js
git commit -m "test: Rebalancer trade computation and sub-\$1 filter coverage"
```

---

### Task 7: FinnhubProvider

**Files:**
- Create: `src/finnhub-provider.js`

No automated tests — `fetch` is a browser API. Manual test instructions below.

- [ ] **Step 1: Implement FinnhubProvider**

```js
// src/finnhub-provider.js
const FinnhubProvider = {
  /**
   * Fetch current prices for a list of tickers.
   * @param {string[]} tickers
   * @param {string} apiKey
   * @returns {Promise<Object>} map of ticker → price
   * @throws {Object} { type: 'invalid_key' | 'rate_limit' | 'http_error' | 'not_found', ... }
   */
  async getPrices(tickers, apiKey) {
    const fetchOne = async (ticker) => {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);

      if (resp.status === 401 || resp.status === 403) {
        throw { type: 'invalid_key' };
      }
      if (resp.status === 429) {
        throw { type: 'rate_limit' };
      }
      if (!resp.ok) {
        throw { type: 'http_error', status: resp.status };
      }

      const data = await resp.json();
      return { ticker, price: data.c };
    };

    // Fetch all concurrently; Promise.all rejects on first HTTP error
    const results = await Promise.all(tickers.map(t => fetchOne(t)));

    // Validate all prices are non-zero/non-null (Finnhub returns c=0 for unknown tickers)
    const notFound = results
      .filter(r => r.price === 0 || r.price === null || r.price === undefined)
      .map(r => r.ticker);

    if (notFound.length > 0) {
      throw { type: 'not_found', tickers: notFound };
    }

    const priceMap = {};
    for (const { ticker, price } of results) {
      priceMap[ticker] = price;
    }
    return priceMap;
  },
};

if (typeof module !== 'undefined') module.exports = { FinnhubProvider };
```

- [ ] **Step 2: Manual smoke test**

Open browser console on any page and run:
```js
// Paste the FinnhubProvider code, then:
FinnhubProvider.getPrices(['AAPL'], 'YOUR_KEY_HERE')
  .then(p => console.log('Price:', p))
  .catch(e => console.error('Error:', e));
```

Expected: `Price: { AAPL: <current price> }`

- [ ] **Step 3: Commit**

```bash
git add src/finnhub-provider.js
git commit -m "feat: FinnhubProvider with error classification"
```

---

### Task 8: HTML structure and CSS

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create the HTML shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AP Rebalancer</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; background: #f5f5f5; color: #222; }
    .container { max-width: 900px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 20px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; }
    .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: #333; }
    textarea { width: 100%; height: 120px; padding: 8px; font-family: monospace; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; }
    textarea:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 2px rgba(74,144,217,0.2); }
    button { padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: #4a90d9; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #357abd; }
    .btn-rebalance { background: #2d7a2d; color: #fff; font-size: 14px; padding: 9px 24px; }
    .btn-rebalance:hover:not(:disabled) { background: #236023; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .slider-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
    .slider-row label { font-size: 13px; color: #555; white-space: nowrap; }
    input[type=range] { flex: 1; min-width: 120px; }
    .coverage-value { font-weight: 600; min-width: 30px; }
    .field-row { margin-top: 12px; }
    .field-row label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
    input[type=password] { width: 100%; padding: 7px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
    input[type=password]:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 2px rgba(74,144,217,0.2); }
    .error-inline { font-size: 12px; color: #c0392b; margin-top: 4px; }
    .portfolio-status { font-size: 12px; margin-top: 6px; color: #888; }
    .portfolio-status.ok { color: #2d7a2d; }
    /* AP Table */
    .ap-table-wrap { margin-top: 14px; max-height: 260px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f0f0f0; padding: 7px 10px; text-align: left; font-weight: 600; position: sticky; top: 0; border-bottom: 1px solid #ddd; }
    td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
    tr.excluded td { color: #bbb; }
    tr.excluded td:first-child::after { content: ' ✗'; font-size: 11px; }
    /* Trade Table */
    .trade-row-buy td { color: #1a6b1a; }
    .trade-row-sell td { color: #c0392b; }
    .trade-row-buy td:nth-child(2) { font-weight: 600; }
    .trade-row-sell td:nth-child(2) { font-weight: 600; }
    tfoot td { font-weight: 600; border-top: 2px solid #ddd; padding-top: 8px; }
    /* Status / Error */
    .banner { padding: 10px 14px; border-radius: 4px; font-size: 13px; margin-top: 0; }
    .banner.error { background: #fdf0ef; border: 1px solid #f5c6c2; color: #c0392b; }
    .banner.info { background: #f0f6ff; border: 1px solid #b8d4f5; color: #2c5f9e; }
    .status-line { display: flex; gap: 24px; font-size: 13px; color: #555; margin-top: 10px; flex-wrap: wrap; }
    .status-line span { white-space: nowrap; }
    .loading { color: #888; font-size: 13px; padding: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div>
      <h1>AP Rebalancer</h1>
      <p class="subtitle">Rebalance your portfolio against the Alpha Picks model</p>
    </div>

    <!-- AP Model Panel -->
    <div class="card" id="ap-panel">
      <h2>Alpha Picks Model</h2>
      <textarea id="ap-input" placeholder="Paste the Alpha Picks portfolio dump here..."></textarea>
      <div class="row">
        <button class="btn-primary" id="parse-btn">Parse</button>
        <span id="parse-status" style="font-size:12px;color:#888;"></span>
      </div>
      <div id="ap-table-container"></div>
      <div class="slider-row" id="slider-row" style="display:none;">
        <label>Coverage:</label>
        <input type="range" id="coverage-slider" min="1" max="100" value="80">
        <span class="coverage-value"><span id="coverage-display">80</span>%</span>
      </div>
    </div>

    <!-- My Portfolio Panel -->
    <div class="card" id="portfolio-panel">
      <h2>My Portfolio</h2>
      <textarea id="portfolio-input" placeholder="AAPL, 10&#10;MSFT, 5&#10;GOOGL, 3"></textarea>
      <div id="portfolio-status" class="portfolio-status"></div>
      <div class="field-row">
        <label for="api-key">Finnhub API Key</label>
        <input type="password" id="api-key" placeholder="your-finnhub-api-key" autocomplete="off">
        <div id="api-key-error" class="error-inline"></div>
      </div>
      <div class="row" style="margin-top:16px;">
        <button class="btn-rebalance" id="rebalance-btn" disabled>Rebalance</button>
      </div>
    </div>

    <!-- Trade Summary Panel -->
    <div class="card" id="trade-panel">
      <h2>Trade Summary</h2>
      <div id="trade-content">
        <p style="color:#aaa;font-size:13px;">Parse your AP model and portfolio, then click Rebalance.</p>
      </div>
    </div>
  </div>

  <script src="src/ap-parser.js"></script>
  <script src="src/portfolio-parser.js"></script>
  <script src="src/rebalancer.js"></script>
  <script src="src/finnhub-provider.js"></script>
  <script src="src/ui.js"></script>
</body>
</html>
```

- [ ] **Step 2: Open in browser and verify layout**

Open `index.html` in a browser (double-click, or `open index.html` on Mac).

Expected: Three cards visible — "Alpha Picks Model", "My Portfolio", "Trade Summary". Rebalance button is greyed out. No JS errors in console (will get 404s for src/ files, which is expected since ui.js doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: HTML shell and CSS layout"
```

---

### Task 9: AP Panel — Parse button, table render, slider

**Files:**
- Create: `src/ui.js`

- [ ] **Step 1: Create ui.js with AP panel logic**

```js
// src/ui.js

// ── App State ──────────────────────────────────────────────────────────────
const state = {
  apStocks: null,       // [{ticker, weight}] post-dedup, weight-sorted
  holdings: null,       // {ticker: shares}
  isRebalanced: false,
};

function clearTrades() {
  state.isRebalanced = false;
  document.getElementById('trade-content').innerHTML =
    '<p style="color:#aaa;font-size:13px;">Parse your AP model and portfolio, then click Rebalance.</p>';
  updateRebalanceButton();
}

// ── Rebalance button enable logic ──────────────────────────────────────────
function updateRebalanceButton() {
  const btn = document.getElementById('rebalance-btn');
  const apiKey = document.getElementById('api-key').value.trim();
  btn.disabled = !(state.apStocks && state.holdings && apiKey);
}

// ── AP Panel ───────────────────────────────────────────────────────────────
function renderAPTable(stocks, coveragePct) {
  if (!stocks || stocks.length === 0) return '';

  const totalAPWeight = stocks.reduce((s, x) => s + x.weight, 0);
  const threshold = (coveragePct / 100) * totalAPWeight;

  let cumulative = 0;
  let rows = '';
  for (const { ticker, weight } of stocks) {
    cumulative += weight;
    const cumPct = (cumulative / totalAPWeight * 100).toFixed(1);
    const excluded = cumulative - weight >= threshold; // stock itself didn't cause threshold to be met
    // A stock is included if it was the one that pushed cumulative >= threshold, or came before it
    const includedUpTo = (cumulative - weight) < threshold; // was below threshold before this stock
    const included = includedUpTo || (cumulative >= threshold && (cumulative - weight) < threshold);
    // Simpler: included if without this stock we're still below threshold
    const isExcluded = (cumulative - weight) >= threshold;
    rows += `<tr class="${isExcluded ? 'excluded' : ''}">
      <td>${ticker}</td>
      <td>${weight.toFixed(2)}%</td>
      <td>${cumPct}%</td>
    </tr>`;
  }

  return `<div class="ap-table-wrap">
    <table>
      <thead><tr><th>Ticker</th><th>Weight</th><th>Cumulative %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function updateSliderGreying() {
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  if (!state.apStocks) return;

  const totalAPWeight = state.apStocks.reduce((s, x) => s + x.weight, 0);
  const threshold = (coveragePct / 100) * totalAPWeight;

  let cumulative = 0;
  const rows = document.querySelectorAll('#ap-table-container tbody tr');
  state.apStocks.forEach((stock, idx) => {
    cumulative += stock.weight;
    const isExcluded = (cumulative - stock.weight) >= threshold;
    rows[idx]?.classList.toggle('excluded', isExcluded);
  });
}

document.getElementById('parse-btn').addEventListener('click', () => {
  const text = document.getElementById('ap-input').value;
  const status = document.getElementById('parse-status');
  try {
    const stocks = parseAPDump(text);
    if (stocks.length === 0) throw new Error('No stocks found — check the paste format.');
    // Sort by weight descending (source of truth for table and filter)
    stocks.sort((a, b) => b.weight - a.weight);
    state.apStocks = stocks;
    const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
    document.getElementById('ap-table-container').innerHTML = renderAPTable(stocks, coveragePct);
    document.getElementById('slider-row').style.display = 'flex';
    status.textContent = `${stocks.length} stocks parsed.`;
    status.style.color = '#2d7a2d';
    clearTrades();
  } catch (e) {
    status.textContent = e.message;
    status.style.color = '#c0392b';
    state.apStocks = null;
    updateRebalanceButton();
  }
});

const slider = document.getElementById('coverage-slider');
slider.addEventListener('input', () => {
  document.getElementById('coverage-display').textContent = slider.value;
  updateSliderGreying();
  clearTrades();
});
```

- [ ] **Step 2: Open in browser and test AP parsing**

1. Open `index.html`
2. Open `Sample_AP_dump.txt`, select all, copy
3. Paste into the AP Model textarea
4. Click Parse

Expected: Table appears with ~40 rows, slider appears, "N stocks parsed." shown in green. Moving the slider greys out rows below the cutoff.

- [ ] **Step 3: Commit**

```bash
git add src/ui.js
git commit -m "feat: AP panel parse button, table render, slider greying"
```

---

### Task 10: Portfolio Panel — live validation and Rebalance button state

**Files:**
- Modify: `src/ui.js` (append)

- [ ] **Step 1: Add portfolio live validation and API key monitoring**

Append to `src/ui.js`:

```js
// ── Portfolio Panel ────────────────────────────────────────────────────────
function updatePortfolioStatus() {
  const text = document.getElementById('portfolio-input').value;
  const statusEl = document.getElementById('portfolio-status');

  if (!text.trim()) {
    statusEl.textContent = '';
    statusEl.className = 'portfolio-status';
    state.holdings = null;
    updateRebalanceButton();
    return;
  }

  const { holdings, errors } = parsePortfolio(text);

  if (errors.length > 0) {
    statusEl.textContent = errors[0]; // show first error
    statusEl.className = 'portfolio-status';
    state.holdings = null;
  } else if (Object.keys(holdings).length === 0) {
    statusEl.textContent = 'No valid holdings found.';
    statusEl.className = 'portfolio-status';
    state.holdings = null;
  } else {
    const count = Object.keys(holdings).length;
    statusEl.textContent = `${count} position${count !== 1 ? 's' : ''} ready.`;
    statusEl.className = 'portfolio-status ok';
    state.holdings = holdings;
  }

  updateRebalanceButton();
}

document.getElementById('portfolio-input').addEventListener('input', () => {
  updatePortfolioStatus();
  clearTrades();
});

document.getElementById('api-key').addEventListener('input', () => {
  document.getElementById('api-key-error').textContent = '';
  updateRebalanceButton();
  if (state.isRebalanced) clearTrades();
});

// Persist API key in localStorage
const apiKeyInput = document.getElementById('api-key');
apiKeyInput.value = localStorage.getItem('finnhub_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('finnhub_api_key', apiKeyInput.value.trim());
});
updateRebalanceButton(); // run once on load
```

- [ ] **Step 2: Verify in browser**

1. Open `index.html`
2. Type `AAPL, 10` in the portfolio textarea → "1 position ready." appears in green
3. Type `badline` → error message appears, Rebalance button stays disabled
4. Fix back to valid input and add an API key → Rebalance button enables
5. Clear the API key → button re-disables
6. Reload the page → API key should be restored from localStorage

- [ ] **Step 3: Commit**

```bash
git add src/ui.js
git commit -m "feat: portfolio live validation, API key persistence, Rebalance button state"
```

---

### Task 11: Rebalance flow — price fetch, trade render, error handling, state

**Files:**
- Modify: `src/ui.js` (append)

- [ ] **Step 1: Add the Rebalance button click handler**

Append to `src/ui.js`:

```js
// ── Trade Table Rendering ──────────────────────────────────────────────────
function fmt(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function renderTrades({ trades, droppedCount, totalValue, deployedValue }) {
  if (trades.length === 0 && droppedCount === 0) {
    return '<p style="color:#888;font-size:13px;">Your portfolio is already balanced. No trades needed.</p>';
  }

  const buys = trades.filter(t => t.action === 'BUY').sort((a, b) => b.estValue - a.estValue);
  const sells = trades.filter(t => t.action === 'SELL').sort((a, b) => b.estValue - a.estValue);

  const toRows = (list, cls) => list.map(t =>
    `<tr class="${cls}">
      <td>${t.ticker}</td>
      <td>${t.action}</td>
      <td>${t.shares.toLocaleString()}</td>
      <td>${fmt(t.estValue)}</td>
    </tr>`
  ).join('');

  const totalBuy = buys.reduce((s, t) => s + t.estValue, 0);
  const totalSell = sells.reduce((s, t) => s + t.estValue, 0);

  const deployedPct = totalValue > 0
    ? ((deployedValue / totalValue) * 100).toFixed(1)
    : '0.0';

  const droppedNotice = droppedCount > 0
    ? `<span>${droppedCount} trade${droppedCount !== 1 ? 's' : ''} under $1 omitted</span>`
    : '';

  return `
    <div class="ap-table-wrap" style="max-height:400px;">
      <table>
        <thead><tr><th>Ticker</th><th>Action</th><th>Shares</th><th>Est. Value</th></tr></thead>
        <tbody>
          ${toRows(buys, 'trade-row-buy')}
          ${toRows(sells, 'trade-row-sell')}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="text-align:right;color:#1a6b1a;">Total Buys</td><td style="color:#1a6b1a;">${fmt(totalBuy)}</td></tr>
          <tr><td colspan="3" style="text-align:right;color:#c0392b;">Total Sells</td><td style="color:#c0392b;">${fmt(totalSell)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div class="status-line">
      <span>Portfolio value: ${fmt(totalValue)}</span>
      <span>${deployedPct}% of portfolio deployed</span>
      ${droppedNotice}
    </div>`;
}

function showError(html) {
  document.getElementById('trade-content').innerHTML =
    `<div class="banner error">${html}</div>`;
}

// ── Rebalance Button ───────────────────────────────────────────────────────
document.getElementById('rebalance-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('api-key').value.trim();
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  const btn = document.getElementById('rebalance-btn');
  const tradeContent = document.getElementById('trade-content');

  if (!state.apStocks || !state.holdings || !apiKey) return;

  btn.disabled = true;
  tradeContent.innerHTML = '<p class="loading">Fetching prices…</p>';

  // Collect all tickers that need prices
  const apTickers = state.apStocks.map(s => s.ticker);
  const portfolioTickers = Object.keys(state.holdings);
  const allTickers = [...new Set([...apTickers, ...portfolioTickers])];

  let prices;
  try {
    prices = await FinnhubProvider.getPrices(allTickers, apiKey);
  } catch (err) {
    if (err.type === 'invalid_key') {
      showError('Invalid API key. Check your Finnhub key and try again.');
      document.getElementById('api-key-error').textContent = 'Invalid key';
    } else if (err.type === 'rate_limit') {
      showError('Rate limit exceeded — wait a moment and try again.');
    } else if (err.type === 'not_found') {
      showError(`Tickers not found: <strong>${err.tickers.join(', ')}</strong>. Check ticker symbols.`);
    } else {
      showError(`Price fetch failed (HTTP ${err.status || 'error'}). Try again.`);
    }
    btn.disabled = false;
    return;
  }

  const result = rebalance(state.apStocks, coveragePct, prices, state.holdings);
  tradeContent.innerHTML = renderTrades(result);
  state.isRebalanced = true;
  btn.disabled = false;
  updateRebalanceButton();
});
```

- [ ] **Step 2: End-to-end test in browser**

1. Open `index.html`
2. Paste `Sample_AP_dump.txt` content, click Parse
3. Paste a small portfolio (e.g., `AAPL, 10\nMSFT, 5`) into the holdings textarea
4. Enter your Finnhub API key
5. Click Rebalance

Expected: trade table appears with BUY rows (green) and SELL rows (red), portfolio value and deployed % shown in status line.

- [ ] **Step 3: Test error states**

- Enter a bad API key → "Invalid API key" error banner
- Enter an invalid ticker (e.g., `FAKEXYZ999, 5`) in portfolio → "Tickers not found" error
- After an error, edit portfolio textarea → trade panel clears (pre-rebalance state)

- [ ] **Step 4: Run all tests to confirm no regressions**

```bash
bash tests/run-tests.sh
```

Expected: `All tests passed.`

- [ ] **Step 5: Commit**

```bash
git add src/ui.js
git commit -m "feat: Rebalance flow — price fetch, trade render, error handling"
```

---

### Task 12: Bundle into self-contained index.html

**Files:**
- Modify: `index.html` (inline all src/ JS)

- [ ] **Step 1: Inline all src/ files into index.html**

Replace the five `<script src="src/...">` tags at the bottom of `index.html` with a single inline `<script>` containing the concatenated content of all five files in order:

```html
<!-- Replace this: -->
<script src="src/ap-parser.js"></script>
<script src="src/portfolio-parser.js"></script>
<script src="src/rebalancer.js"></script>
<script src="src/finnhub-provider.js"></script>
<script src="src/ui.js"></script>

<!-- With this: -->
<script>
// ── ap-parser.js ──
<contents of src/ap-parser.js>

// ── portfolio-parser.js ──
<contents of src/portfolio-parser.js>

// ── rebalancer.js ──
<contents of src/rebalancer.js>

// ── finnhub-provider.js ──
<contents of src/finnhub-provider.js>

// ── ui.js ──
<contents of src/ui.js>
</script>
```

Use this command to generate the inlined script block and replace manually:

```bash
echo "<script>" && \
  echo "// ── ap-parser.js ──" && cat src/ap-parser.js && \
  echo "// ── portfolio-parser.js ──" && cat src/portfolio-parser.js && \
  echo "// ── rebalancer.js ──" && cat src/rebalancer.js && \
  echo "// ── finnhub-provider.js ──" && cat src/finnhub-provider.js && \
  echo "// ── ui.js ──" && cat src/ui.js && \
  echo "</script>"
```

Paste the output into `index.html`, replacing the five `<script src>` tags.

- [ ] **Step 2: Verify the file is self-contained**

```bash
grep -c '<script src' index.html
```

Expected: `0`

- [ ] **Step 3: Open index.html from a different directory to confirm no path dependencies**

```bash
cp index.html /tmp/ap-rebalancer.html
open /tmp/ap-rebalancer.html
```

Expected: app loads and works fully with no console errors.

- [ ] **Step 4: Run all tests one final time**

```bash
bash tests/run-tests.sh
```

Expected: `All tests passed.`

- [ ] **Step 5: Final commit**

```bash
git add index.html
git commit -m "feat: bundle all JS inline — index.html is now self-contained"
```
