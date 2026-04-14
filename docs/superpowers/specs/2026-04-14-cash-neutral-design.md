# Cash-Neutral Rebalancing — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

---

## Problem

When the tolerance filter skips a "trim" (current shares exceed target shares but the deviation is within tolerance%), the algorithm does not execute the sell. However, it still plans buys for other positions as if that cash had been freed. This causes `Σ(buys) > Σ(sells)`, requiring the user's brokerage account to inject unexpected cash.

With 0% tolerance the unintentional injection is negligible (~$12 on a $170K portfolio — pure LR floor rounding). With 5% tolerance it grows to ~$800 on the same portfolio, as multiple tolerance-skipped trims each contribute unexecuted sell proceeds to the phantom budget.

`cashAdjustment` is an intentional injection and must be preserved.

---

## Root Cause

```
NET = Σ(sells) - Σ(buys)
    = (totalValue - deployedValue) - Σ_skipped_trims((cur - tgt) × price)
```

Without tolerance the first term dominates (small positive). With tolerance the second term (the skipped trims) can make NET negative — meaning cash must be injected.

---

## Decision

Cash neutrality is always on. No UI toggle. The only allowed deviation is an explicit `cashAdjustment` (already existing parameter). This is consistent with the principle that a rebalance reallocates existing value; it does not inject or withdraw cash unless the user asks.

---

## Algorithm Change (`rebalancer.js` only)

One post-processing block is inserted after all raw trades are generated (model trades + out-of-model closes) and before the sub-$1 filter.

### Step: cash-neutral adjustment

```
deficit = Σ(BUY rawTrades estValue)
        - Σ(SELL rawTrades estValue)
        - cashAdjustment
```

If `deficit ≤ 0`: nothing to do — rebalance is already cash-neutral or cash-positive.

If `deficit > 0`:
1. Collect all BUY raw trades. Sort by `prices[ticker]` descending (highest price first, to close the gap in fewest share removals).
2. For each buy trade in order:
   - While `deficit > 0` and `trade.shares > 0`:
     - `trade.shares -= 1`
     - `trade.estValue -= prices[trade.ticker]`
     - `targetSharesMap.set(ticker, targetSharesMap.get(ticker) - 1)`
     - `deficit -= prices[trade.ticker]`
   - Break out of the outer loop as soon as `deficit ≤ 0`.
3. Trades reduced to 0 shares are naturally removed by the existing sub-$1 filter.

`targetSharesMap` is updated in lockstep so the `deployedValue` computation (which reads from `targetSharesMap`) remains correct.

### Termination and overshoot

The loop always terminates: worst case all buy shares are removed, leaving `deficit = -Σ(sells) ≤ 0`.

When `deficit` crosses zero it may go slightly negative (overshoot). The overshoot is at most `prices[ticker]` of the last share removed — one share of the highest-priced stock still being bought. This means the rebalance frees a small amount of extra cash rather than requiring any injection, which is harmless.

The result is always the **nearest-to-zero achievable deficit** given whole-share constraints.

### Interaction with cashAdjustment

Subtracting `cashAdjustment` from the deficit means:
- `cashAdjustment = 0` (default): algorithm enforces `buys ≈ sells`.
- `cashAdjustment > 0`: algorithm allows `buys - sells ≈ cashAdjustment` (intentional injection preserved).
- `cashAdjustment < 0`: algorithm enforces `sells - buys ≈ |cashAdjustment|` (intentional withdrawal preserved).

---

## Tests (`rebalancer.test.js`)

| Case | What it verifies |
|------|-----------------|
| Tolerance-induced deficit | With tolerance > 0 and skipped trims present, `Σ(buys) ≤ Σ(sells)` after rebalance |
| Zero tolerance unchanged | With `tolerancePercent = 0`, no buy reduction occurs; existing behaviour is untouched |
| cashAdjustment preserved | With `cashAdjustment = X > 0`, `Σ(buys) - Σ(sells) ≤ X` (injection is capped, not eliminated) |
| High-price stocks | Deficit closes in 1–2 share removals; net is cash-positive (overshoot is harmless) |
| All buys eliminated | If deficit exceeds total buy value, all buys are removed; `deficit = -Σ(sells) ≤ 0` |

---

## UI / Return Value

No UI changes. No new parameters. No changes to the return signature `{ trades, droppedCount, skippedCount, totalValue, deployedValue }`.

A buy trade reduced to 0 shares will be counted in `droppedCount` by the existing sub-$1 filter. This is a minor cosmetic imprecision (the reason for dropping differs) accepted for now.

---

## Out of Scope

- Surfacing net cash flow (`Σ(sells) - Σ(buys)`) in the UI — useful future addition but not part of this spec.
- Distinguishing "cash-neutral dropped" from "sub-$1 dropped" in `droppedCount`.
