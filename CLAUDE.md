# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests
bash tests/run-tests.sh

# Run a single test file
node tests/ap-parser.test.js
node tests/portfolio-parser.test.js
node tests/rebalancer.test.js

# Open the app
open index.html
```

No npm, no build step, no linter — Node.js is used only for tests.

## Architecture

The app is a single `index.html` that includes all JS inline. During development, `src/` files can be loaded via `<script src>` tags; `index.html` currently has everything inlined.

**Data flow:**
1. User pastes AP portfolio dump → `parseAPDump()` → `[{ticker, weight}]`
2. User pastes holdings CSV → `parsePortfolio()` → `{ticker: shares}`
3. Coverage slider filters AP stocks by cumulative weight threshold (measured against the **actual sum of AP weights**, not 100)
4. `rebalance()` renormalizes selected weights to 100%, computes `floor(totalValue × normalizedWeight / price)` target shares, diffs against current holdings → `{trades, droppedCount, totalValue, deployedValue}`
5. `FinnhubProvider.getPrices()` fetches live prices; Finnhub returns `c: 0` for unknown tickers (treated as not-found)

**Key invariants:**
- Weights are in percentage units (e.g. `0.46`, not `0.0046`)
- `target_shares` uses `Math.floor()` — never round up
- Coverage threshold = `(coveragePercent / 100) × totalAPWeight` — not `coveragePercent`
- `totalValue` is fixed before computing trades (includes value of stocks to be sold)
- With empty holdings (`totalValue = 0`), no trades are generated

**Module responsibilities (`src/`):**
- `ap-parser.js` — `parseAPDump(text)` — handles winner badge, dedup (summed weights), uppercase normalization
- `portfolio-parser.js` — `parsePortfolio(text)`, `isValidPortfolio(text)` — CSV, dedup, zero-share filtering
- `rebalancer.js` — `rebalance(apStocks, coveragePercent, prices, holdings, tolerancePercent, cashAdjustment)` — pure function, no side effects
- `finnhub-provider.js` — `FinnhubProvider.getPrices(tickers, apiKey)` — browser `fetch`, concurrent via `Promise.all`
- `ui.js` — all DOM wiring; reads globals set by the other modules

**All modules use:** `if (typeof module !== 'undefined') module.exports = {...}` so they work in both Node.js (tests) and browser (inlined).

## Test Fixtures

`Sample_AP_dump.txt` is used as a test fixture by `ap-parser.test.js`. Tests must be run from the repo root (not from `tests/`) so the relative path resolves correctly.

## Development Workflow

Feature lifecycle: **Backlog → Spec → Plan → Implement → Verify → Changelog**

| Step | Skill | Output |
|------|-------|--------|
| Define requirements | `/brainstorm` | `docs/superpowers/specs/YYYY-MM-DD-feature.md` |
| Break into steps | `/write-plan` | `docs/superpowers/plans/YYYY-MM-DD-feature.md` |
| Implement | `/tdd` + `/execute-plan` | code + tests |
| Verify | `/verify` | confirmed passing |
| Ship | — | entry in `CHANGELOG.md` |

**Rule:** ideas live in `BACKLOG.md` as one-liners. Write the spec only when the feature is next to implement. Write the plan only after the spec is reviewed.
