# APRebalance

APRebalance is a small self-contained web app for replicating and rebalancing a portfolio against the Alpha Picks model portfolio.

You paste:

- the Alpha Picks portfolio dump
- your current holdings
- your Finnhub API key

The app then:

- parses the AP model weights
- parses and validates your holdings
- fetches live prices
- computes target whole-share positions
- produces a BUY/SELL trade list that tries to stay close to the model while keeping net cash flow as close as possible to your requested cash adjustment

The current UI is organized as a guided 3-step workflow:

1. **Model** — paste and parse the Alpha Picks dump
2. **Portfolio & Settings** — validate holdings, provide your Finnhub API key, and set coverage/tolerance/cash controls
3. **Rebalance Plan** — review the resulting trades, AP match, and portfolio summary

## What It Does

The app is designed for the practical problem of matching a model portfolio with whole shares and live prices.

Key controls:

- **Coverage %**: use only the top AP names up to a cumulative-weight threshold
- **Tolerance %**: skip trades for positions that are already close enough to target
- **Cash adjustment ($)**: intentionally deploy extra cash or model a withdrawal

The UI also surfaces:

- step status badges (`Waiting`, `Ready`, `Needs Fix`, `Calculated`)
- a compact model summary after parsing
- a rebalance summary with AP Match, total buys, total sells, and portfolio value
- hover/focus gap detail showing the largest current mismatches against the AP model
- clearer empty, loading, error, and already-balanced states

Trade output distinguishes:

- **Open**: buy a new position
- **Add**: buy more of a position you already hold
- **Trim**: sell part of a position that remains in the model
- **Close**: sell a position that is no longer in the model

## How It’s Implemented

The shipped app is a single [index.html](/Users/pablo/code/APRebalance/index.html:1) file with all CSS and JavaScript inlined.

For development, the logic also exists as mirrored modules under [src](/Users/pablo/code/APRebalance/src):

- `ap-parser.js`
- `portfolio-parser.js`
- `rebalancer.js`
- `finnhub-provider.js`
- `ui.js`

Important repo rule:

- `src/` and `index.html` are manually mirrored
- any logic change must be applied to both
- the test suite includes a parity check to catch drift

There is no build step, no npm setup, and no server. Node.js is only used for tests.

## Project Structure

- [index.html](/Users/pablo/code/APRebalance/index.html:1): shipped browser app
- [src](/Users/pablo/code/APRebalance/src): mirrored source modules for development and tests
- [tests](/Users/pablo/code/APRebalance/tests): Node-based test files and sync checks
- [CLAUDE.md](/Users/pablo/code/APRebalance/CLAUDE.md:1): repo-working guidance and invariants
- [CHANGELOG.md](/Users/pablo/code/APRebalance/CHANGELOG.md:1): user-facing change history
- [docs/superpowers/specs](/Users/pablo/code/APRebalance/docs/superpowers/specs/2026-04-14-ui-refresh-design.md:1): detailed design rationale and feature history

## How It Works

At a high level:

1. Parse the AP dump into `{ ticker, weight }` entries.
2. Parse the portfolio text into `{ ticker: shares }`.
3. Apply the coverage threshold against the **actual sum of AP weights**, not a fixed 100.
4. Fetch live prices for both model tickers and currently held tickers.
5. Compute target whole-share positions for the active model.
6. Generate BUY/SELL trades against current holdings.
7. Adjust nearby whole-share trades to improve cash neutrality.
8. Score current and post-rebalance AP Match by market-value overlap.

### AP Model Parsing

The AP dump parser:

- finds the header row
- walks the repeating stock block structure
- handles the optional `Winner` line
- normalizes tickers to uppercase
- sums duplicate tickers that appear more than once in the dump

Weights stay in percentage units such as `4.26`, not decimal fractions such as `0.0426`.

### Portfolio Parsing

The portfolio parser accepts one holding per line:

- `AAPL, 10`
- `AAPL 10`
- `AAPL; 10`
- `AAPL<TAB>10`

It:

- normalizes tickers to uppercase
- sums duplicate entries
- rejects malformed share counts
- ignores final zero-share positions

## Rebalancing Logic

All rebalance math uses the user’s current portfolio value plus any explicit cash adjustment.

### 1. Coverage Filter

The AP stocks are sorted by weight descending. The active model is the smallest prefix whose cumulative weight reaches:

```text
(coveragePercent / 100) * totalAPWeight
```

This matters because AP weights in the pasted dump do not necessarily sum to exactly 100.

### 2. Re-Normalization

After selecting the covered names, their weights are re-normalized so the active model sums to 100%.

### 3. Total Portfolio Value

The app computes:

```text
totalValue = sum(current shares * current price) + cashAdjustment
```

This value is fixed before target shares are computed.

### 4. Target Shares

For each active-model stock:

```text
exactShares = totalValue * normalizedWeight / price
floorShares = floor(exactShares)
```

Then the app uses a largest-remainder pass to deploy leftover cash as efficiently as possible with whole shares.

That gives the baseline target portfolio.

### 5. Tolerance

If a held model position is already close enough to target, the trade can be skipped:

```text
deviation = |current - target| / target
```

Out-of-model positions are never skipped; they are always closed.

### 6. Raw Trade Generation

The app then generates:

- BUY / Open
- BUY / Add
- SELL / Trim
- SELL / Close

Trades under `$1` estimated value are dropped from the final output.

## AP Match

The rebalance result includes an **AP Match** score for the current portfolio and for the projected portfolio after applying the generated trades.

The score is based on market-value allocation overlap:

```text
AP Match = sum(min(actualWeight[ticker], modelWeight[ticker]))
```

Where:

- `modelWeight` is the active AP model after coverage filtering and re-normalization
- `actualWeight` is the portfolio's current market-value weight for the ticker
- `100%` means the portfolio's value is allocated exactly like the active AP model
- positions outside the model, overweight positions, underweight positions, and undeployed cash all reduce the score

The UI shows the score as `current -> after`. Hovering or focusing the AP Match metric shows the largest current gaps, labeled as `underweight`, `overweight`, or `outside model`.

## Cash-Neutral Optimization

This part is important because exact portfolio replication and cash neutrality are not always simultaneously achievable with whole shares.

The optimizer does **not** rebuild the portfolio from scratch. Instead, it:

1. starts from the computed whole-share target portfolio
2. looks at the remaining net cash gap
3. searches a small nearby adjustment space for the best practical result

Target objective:

```text
minimize |sells - buys - cashAdjustment|
```

while staying close to the baseline target portfolio.

### What The Optimizer May Change

It may:

- remove shares from existing BUY trades
- remove shares from `SELL / trim` trades
- add **one extra share** to an existing BUY trade if that improves the result

It does not:

- modify `SELL / close` trades
- create a brand-new buy in a ticker that did not already have a buy
- search arbitrarily far away from the baseline target portfolio

### Why It Is Bounded

The goal is not “force zero cash difference at any cost.”

The goal is:

- replicate the model as closely as practical
- stay cash-neutral as closely as practical
- use only nearby whole-share adjustments

That gives a sweet spot between portfolio fidelity and net cash balance.

Sometimes the result will be exact. Sometimes a small residual difference will remain because no better whole-share combination exists inside the allowed adjustment space.

## Running The App

Open the app locally:

```bash
open index.html
```

Then:

1. paste the AP portfolio dump
2. click **Parse**
3. paste your holdings
4. enter your Finnhub API key
5. choose coverage, tolerance, and cash adjustment
6. click **Generate Rebalance Plan**

## Testing

Run the full test suite:

```bash
bash tests/run-tests.sh
```

Run individual test files:

```bash
node tests/ap-parser.test.js
node tests/portfolio-parser.test.js
node tests/rebalancer.test.js
node tests/index-sync.test.js
```

## Notes For Developers

- Read [CLAUDE.md](/Users/pablo/code/APRebalance/CLAUDE.md:1) for repo rules, invariants, and workflow guidance.
- Read the design specs under [docs/superpowers/specs](/Users/pablo/code/APRebalance/docs/superpowers/specs/2026-04-14-cash-neutral-design.md:1) for the reasoning behind specific behaviors, especially the rebalance and cash-neutral optimization logic.
