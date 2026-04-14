# Cash Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed cash adjustment input near the Rebalance button so users can deploy extra brokerage cash or model a withdrawal in a single rebalance run.

**Architecture:** Add `cashAdjustment = 0` as a 6th parameter to `rebalance()` in `src/rebalancer.js`; clamp `totalValue` to 0 after adding the adjustment. Add a `<input type="number">` field above the Rebalance button in `index.html` and pass its value through to `rebalance()` at click time.

**Tech Stack:** Vanilla JS, Node.js (tests only), no build step.

---

### Task 1: Add `cashAdjustment` to `rebalancer.js` (TDD)

**Files:**
- Modify: `src/rebalancer.js:1` (function signature)
- Modify: `src/rebalancer.js:23-25` (totalValue computation)
- Test: `tests/rebalancer.test.js` (append 3 new tests)

- [ ] **Step 1: Append three failing tests to `tests/rebalancer.test.js`**

Add these three tests at the end of the file, before the final `if (failed > 0)` block:

```js
test('cashAdjustment increases totalValue and target shares', () => {
  // ap=[A:10], price $100, holdings={A:5} → totalValue=500, target=floor(500/100)=5 (no trade)
  // with cashAdjustment=+500 → totalValue=1000, target=floor(1000/100)=10 → BUY 5
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  const holdings = { A: 5 };
  const { trades, totalValue } = rebalance(ap, 100, prices, holdings, 0, 500);
  assert.strictEqual(totalValue, 1000);
  const buyA = trades.find(t => t.ticker === 'A' && t.action === 'BUY');
  assert.ok(buyA, 'should BUY more A with extra cash');
  assert.strictEqual(buyA.shares, 5);
});

test('cashAdjustment decreases totalValue and target shares', () => {
  // ap=[A:10], price $100, holdings={A:10} → totalValue=1000, target=10 (no trade)
  // with cashAdjustment=-500 → totalValue=500, target=floor(500/100)=5 → SELL 5
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  const holdings = { A: 10 };
  const { trades, totalValue } = rebalance(ap, 100, prices, holdings, 0, -500);
  assert.strictEqual(totalValue, 500);
  const sellA = trades.find(t => t.ticker === 'A' && t.action === 'SELL');
  assert.ok(sellA, 'should SELL some A when cash is withdrawn');
  assert.strictEqual(sellA.shares, 5);
});

test('cashAdjustment larger than portfolio value clamps to 0 and generates no trades', () => {
  // ap=[A:10], price $100, holdings={A:5} → totalValue=500
  // with cashAdjustment=-999999 → totalValue clamped to 0 → no trades
  const ap = [{ ticker: 'A', weight: 10 }];
  const prices = { A: 100 };
  const holdings = { A: 5 };
  const { trades, totalValue } = rebalance(ap, 100, prices, holdings, 0, -999999);
  assert.strictEqual(totalValue, 0);
  assert.strictEqual(trades.length, 0);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
node tests/rebalancer.test.js
```

Expected: 3 failures mentioning wrong `totalValue` or wrong trade counts. Existing tests still pass.

- [ ] **Step 3: Update `rebalancer.js` — signature and totalValue clamp**

Change line 1 from:
```js
function rebalance(apStocks, coveragePercent, prices, holdings, tolerancePercent = 0) {
```
to:
```js
function rebalance(apStocks, coveragePercent, prices, holdings, tolerancePercent = 0, cashAdjustment = 0) {
```

Change lines 23-25 from:
```js
  // Step 3: Total portfolio value (fixed; includes stocks to be sold)
  let totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);
```
to:
```js
  // Step 3: Total portfolio value (fixed; includes stocks to be sold)
  let totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);
  totalValue = Math.max(0, totalValue + cashAdjustment);
```

- [ ] **Step 4: Run the tests to confirm all pass**

```bash
node tests/rebalancer.test.js
```

Expected output ends with something like `16 passed` (existing 13 + new 3). Zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/rebalancer.js tests/rebalancer.test.js
git commit -m "feat: cashAdjustment parameter on rebalance() with totalValue clamping"
```

---

### Task 2: Add cash adjustment input to the UI

**Files:**
- Modify: `index.html:93-95` (add input above Rebalance button)
- Modify: `index.html:623` (read input value in click handler)

- [ ] **Step 1: Add the input field above the Rebalance button**

In `index.html`, find this block (around line 93):

```html
      <div class="row" style="margin-top:16px;">
        <button class="btn-rebalance" id="rebalance-btn" disabled>Rebalance</button>
      </div>
```

Replace it with:

```html
      <div class="field-row" style="margin-top:16px;">
        <label for="cash-adjustment">Cash adjustment ($):</label>
        <input type="number" id="cash-adjustment" value="0" step="100" style="width:100px;">
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn-rebalance" id="rebalance-btn" disabled>Rebalance</button>
      </div>
```

- [ ] **Step 2: Read the cash adjustment value in the Rebalance click handler**

In `index.html`, find this line (around line 622):

```js
  const tolerancePct = parseFloat(document.getElementById('tolerance-input').value) || 0;
  const result = rebalance(state.apStocks, coveragePct, prices, state.holdings, tolerancePct);
```

Replace it with:

```js
  const tolerancePct = parseFloat(document.getElementById('tolerance-input').value) || 0;
  const cashAdj = parseFloat(document.getElementById('cash-adjustment').value) || 0;
  const result = rebalance(state.apStocks, coveragePct, prices, state.holdings, tolerancePct, cashAdj);
```

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
bash tests/run-tests.sh
```

Expected: all tests pass.

- [ ] **Step 4: Open the app and verify manually**

```bash
open index.html
```

Check:
1. "Cash adjustment ($):" label and input appear above the Rebalance button, defaulting to `0`
2. With a valid AP dump, portfolio, and API key, Rebalance with `0` cash adjustment produces the same result as before
3. Enter `+1000` — total deployed value increases (buy more shares)
4. Enter `-500` — total deployed value decreases (sell some shares)
5. Enter a large negative number (e.g. `-9999999`) — no trades generated

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: cash adjustment input field in rebalance panel"
```
