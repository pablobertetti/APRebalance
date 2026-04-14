# Cash Adjustment Feature — Design Spec

**Date:** 2026-04-14
**Feature:** FT-01 — Add or withdraw cash from portfolio before rebalancing

## Summary

Users can specify a cash adjustment (positive to add, negative to withdraw) that modifies the total portfolio value used by the rebalancer. This lets users deploy extra brokerage cash or model a withdrawal in a single rebalance run.

## Architecture

No new modules. Changes touch two existing files:

- `src/rebalancer.js` — add `cashAdjustment` parameter
- `src/ui.js` (or inlined equivalent in `index.html`) — add input field and pass value through

## Rebalancer Change

`rebalance()` gains a 6th parameter with a default:

```js
function rebalance(apStocks, coveragePercent, prices, holdings, tolerancePercent = 0, cashAdjustment = 0)
```

After computing `totalValue` from holdings × prices, apply the adjustment:

```js
totalValue = Math.max(0, totalValue + cashAdjustment);
```

Clamping to 0 ensures that an over-withdrawal (larger than portfolio value) produces no trades, consistent with the existing empty-holdings behavior.

All downstream math (`deployedValue`, target shares, largest-remainder distribution) already uses `totalValue` and picks up the adjustment automatically.

## UI Change

A single labeled number input is added directly above (or beside) the Rebalance button:

```
Cash adjustment ($): [________]
```

- `<input type="number">` defaulting to `0`
- Accepts positive (add cash) or negative (withdraw cash) values
- Value is read at Rebalance-click time and passed as `cashAdjustment` to `rebalance()`
- Not persisted to localStorage — it's a per-run adjustment

## Tests

Three new cases in `tests/rebalancer.test.js`:

| Case | `cashAdjustment` | Expected behavior |
|------|-----------------|-------------------|
| Add cash | `+1000` | `totalValue` increases by 1000; target shares increase |
| Withdraw cash | `-500` | `totalValue` decreases; fewer shares targeted |
| Over-withdraw | larger than portfolio value | `totalValue` clamps to 0; no trades generated |

## Out of Scope

- Persisting the cash adjustment across sessions
- Displaying remaining/undeployed cash in the results panel (can be derived from `totalValue - deployedValue`, which already exists)
