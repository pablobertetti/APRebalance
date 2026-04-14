# Cash-Neutral Rebalancing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure rebalance trades land as close as possible to the requested net cash flow (`0` by default, `cashAdjustment` when provided).

**Architecture:** Single post-processing block inserted in `rebalancer.js` after all raw trades are generated. Computes deficit = buys − sells − cashAdjustment; if positive, it reduces buys; if negative, it searches across `SELL / trim` reductions plus a bounded one-extra-share option on existing buy trades. `targetSharesMap` is kept in sync so `deployedValue` stays correct.

**Tech Stack:** Vanilla JS. Node.js for tests only (no npm, no build step).

---

## File Map

| File | Change |
|------|--------|
| `tests/rebalancer.test.js` | Add 4 new test cases |
| `src/rebalancer.js` | Insert cash-neutral block after out-of-model loop, before sub-$1 filter |
| `CHANGELOG.md` | Add entry |

---

### Task 1: Write failing tests

**Files:**
- Modify: `tests/rebalancer.test.js` — append 4 test cases before the final `if (failed > 0)` block (line 282)

- [ ] **Step 1: Add the 4 test cases**

Open `tests/rebalancer.test.js`. Before the final two lines:
```javascript
if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
```

Insert:

```javascript
// --- Cash-neutral adjustment ---

test('cash-neutral: tolerance-skipped trim deficit is eliminated', () => {
  // X=21 @$100, OUT=19 @$100 → totalValue=$4000.
  // Target X=20, target Y=20. X deviation=1/20=5% → skipped at tolerance=5%.
  // Without fix: BUY Y 20 ($2000) − SELL OUT 19 ($1900) = $100 deficit.
  // With fix: 1 share removed from Y → BUY Y 19 ($1900) = SELL OUT 19 ($1900).
  const ap = [{ ticker: 'X', weight: 10 }, { ticker: 'Y', weight: 10 }];
  const prices = { X: 100, Y: 100, OUT: 100 };
  const holdings = { X: 21, OUT: 19 };
  const { trades } = rebalance(ap, 100, prices, holdings, 5);
  const totalBuys = trades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estValue, 0);
  const totalSells = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estValue, 0);
  assert.ok(totalBuys <= totalSells, `buys ($${totalBuys}) should not exceed sells ($${totalSells})`);
  const buyY = trades.find(t => t.ticker === 'Y' && t.action === 'BUY');
  assert.ok(buyY, 'should still have a BUY for Y');
  assert.strictEqual(buyY.shares, 19);
});

test('cash-neutral: zero tolerance produces no spurious buy reduction', () => {
  // Same portfolio. tolerance=0 → X is trimmed (SELL X 1), which funds Y's buy.
  // deficit = 2000 − (100 + 1900) − 0 = 0 → no reduction. BUY Y stays at 20 shares.
  const ap = [{ ticker: 'X', weight: 10 }, { ticker: 'Y', weight: 10 }];
  const prices = { X: 100, Y: 100, OUT: 100 };
  const holdings = { X: 21, OUT: 19 };
  const { trades } = rebalance(ap, 100, prices, holdings, 0);
  const buyY = trades.find(t => t.ticker === 'Y' && t.action === 'BUY');
  assert.ok(buyY, 'should have a BUY for Y');
  assert.strictEqual(buyY.shares, 20);
  const totalBuys = trades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estValue, 0);
  const totalSells = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estValue, 0);
  assert.ok(totalBuys <= totalSells, 'should be cash-neutral at zero tolerance without any reduction');
});

test('cash-neutral: positive cashAdjustment is not erroneously cancelled', () => {
  // holdings: A=5 @$100 = $500. cashAdjustment=+$500 → totalValue=$1000.
  // Target A=10. BUY 5 ($500). No sells.
  // deficit = 500 − 0 − 500 (cashAdjustment) = 0 → no reduction. BUY intact.
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  const holdings = { A: 5 };
  const { trades } = rebalance(ap, 100, prices, holdings, 0, 500);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  assert.ok(buyA, 'BUY should not be eliminated when funded by cashAdjustment');
  assert.strictEqual(buyA.shares, 5);
  assert.strictEqual(buyA.estValue, 500);
});

test('cash-neutral: high-price stocks close deficit in one share removal', () => {
  // X=21 @$500, OUT=19 @$500 → totalValue=$20,000.
  // Target X=20 (deviation=1/20=5% → skipped), target Y=20.
  // BUY Y 20 ($10,000) − SELL OUT 19 ($9,500) = $500 deficit.
  // Remove 1 share of Y ($500): deficit=0. BUY Y 19 ($9,500).
  const ap = [{ ticker: 'X', weight: 10 }, { ticker: 'Y', weight: 10 }];
  const prices = { X: 500, Y: 500, OUT: 500 };
  const holdings = { X: 21, OUT: 19 };
  const { trades } = rebalance(ap, 100, prices, holdings, 5);
  const totalBuys = trades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estValue, 0);
  const totalSells = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estValue, 0);
  assert.ok(totalBuys <= totalSells, `buys ($${totalBuys}) should not exceed sells ($${totalSells})`);
  const buyY = trades.find(t => t.ticker === 'Y' && t.action === 'BUY');
  assert.ok(buyY, 'should still have a BUY for Y');
  assert.strictEqual(buyY.shares, 19);
});
```

- [ ] **Step 2: Run tests to confirm 4 new failures**

```bash
node tests/rebalancer.test.js
```

Expected: the 4 new tests fail (the existing tests still pass). You should see output like:
```
  ✗ cash-neutral: tolerance-skipped trim deficit is eliminated: ...
  ✗ cash-neutral: zero tolerance produces no spurious buy reduction: ...
  ✗ cash-neutral: positive cashAdjustment is not erroneously cancelled: ...
  ✗ cash-neutral: high-price stocks close deficit in one share removal: ...
  4 failed
```

---

### Task 2: Implement cash-neutral adjustment

**Files:**
- Modify: `src/rebalancer.js`

- [ ] **Step 1: Insert the cash-neutral block**

In `src/rebalancer.js`, find the comment `// Filter sub-$1 trades` (currently at line 98). Insert the following block immediately before it:

```javascript
  // Cash-neutral adjustment: ensure buys don't exceed sells + cashAdjustment.
  // Deficit arises when tolerance skips a trim — those unexecuted sells leave
  // a funding gap for buys. Remove shares from the highest-priced buy trades
  // one at a time until deficit ≤ 0 (nearest-to-zero with whole shares).
  const totalBuyValue = rawTrades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estValue, 0);
  const totalSellValue = rawTrades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estValue, 0);
  let cashDeficit = totalBuyValue - totalSellValue - cashAdjustment;

  if (cashDeficit > 0) {
    const buyTrades = rawTrades
      .filter(t => t.action === 'BUY')
      .sort((a, b) => prices[b.ticker] - prices[a.ticker]);
    for (const trade of buyTrades) {
      if (cashDeficit <= 0) break;
      const price = prices[trade.ticker];
      while (cashDeficit > 0 && trade.shares > 0) {
        trade.shares -= 1;
        trade.estValue -= price;
        targetSharesMap.set(trade.ticker, targetSharesMap.get(trade.ticker) - 1);
        cashDeficit -= price;
      }
    }
  }

```

The final file structure around the insertion point should look like:

```javascript
  // [existing] Out-of-model holdings → SELL ALL
  for (const [ticker, shares] of Object.entries(holdings)) {
    if (!modelTickers.has(ticker) && shares > 0) {
      const price = prices[ticker] || 0;
      rawTrades.push({ ... });
    }
  }

  // Cash-neutral adjustment: ensure buys don't exceed sells + cashAdjustment.
  // ...
  const totalBuyValue = ...
  // [new block]

  // Filter sub-$1 trades
  const trades = [];
  let droppedCount = 0;
  for (const trade of rawTrades) {
    if (trade.estValue < 1) { droppedCount++; }
    else { trades.push(trade); }
  }
```

- [ ] **Step 2: Run the new tests — all 4 should pass**

```bash
node tests/rebalancer.test.js
```

Expected:
```
  ✓ cash-neutral: tolerance-skipped trim deficit is eliminated
  ✓ cash-neutral: zero tolerance produces no spurious buy reduction
  ✓ cash-neutral: positive cashAdjustment is not erroneously cancelled
  ✓ cash-neutral: high-price stocks close deficit in one share removal
```

---

### Task 3: Regression check

**Files:** none — read-only verification step

- [ ] **Step 1: Run the full test suite**

```bash
bash tests/run-tests.sh
```

Expected: all tests pass, 0 failed. If any existing test fails, the implementation has a bug — do not proceed to Task 4 until it is fixed.

---

### Task 4: Changelog + commit

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add changelog entry**

In `CHANGELOG.md`, insert the following section at the top, after the `# Changelog` heading and the `---` separator, and before the existing `## 2026-04-14` entry:

```markdown
## 2026-04-14 — Cash-neutral rebalancing

Rebalance trades now never require injecting unintentional cash into your portfolio:

- When the tolerance filter skips a trim (a position is slightly over its target weight), the rebalancer previously bought other stocks as if that cash had been freed — requiring you to inject the difference from your account's free cash balance.
- The rebalancer now adjusts nearby whole-share buys or trim sells, and may add one extra share to an existing buy, so net cash flow lands as close as possible to the requested `cashAdjustment`.
- **`cashAdjustment` is unaffected** — positive adjustments (intentional cash deployment) still work exactly as before.

---
```

- [ ] **Step 2: Commit**

```bash
git add src/rebalancer.js tests/rebalancer.test.js CHANGELOG.md
git commit -m "feat: cash-neutral rebalancing — eliminate tolerance-induced buy excess"
```
