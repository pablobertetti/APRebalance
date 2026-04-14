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

The post-processing step must minimize absolute net cash flow, not just prevent accidental injection. In other words, the goal is:

```
minimize |Σ(sells) - Σ(buys) - cashAdjustment|
```

subject to whole-share constraints. If two solutions are equally close, prefer the one that does not require extra capital beyond `cashAdjustment`.

---

## Rebalancing Logic

The rebalancer has two stages:

1. Compute the best whole-share portfolio that replicates the model weights, using the existing largest-remainder logic.
2. Search a small neighborhood around that portfolio for the best achievable cash-flow result, without drifting farther than necessary from the model.

This keeps model replication as the baseline and treats cash-neutrality as a bounded optimization problem around that baseline, not as a full re-solve of the portfolio.

---

## Algorithm Change (`rebalancer.js` only)

One post-processing block is inserted after all raw trades are generated (model trades + out-of-model closes) and before the sub-$1 filter.

### Step: cash-neutral adjustment

```
deficit = Σ(BUY rawTrades estValue)
        - Σ(SELL rawTrades estValue)
        - cashAdjustment
```

If `deficit ≤ 0`: nothing to do — rebalance is already at or below the desired net cash flow.

If `deficit > 0`:
1. Collect all BUY raw trades.
2. Expand them into share-value lots and search for the combination of removable buy shares whose total value is closest to `deficit`.
3. Apply that removal plan to the buy trades and update `targetSharesMap` in lockstep.

If `deficit < 0`:
1. Collect all `SELL` trades with subtype `trim`.
2. Collect all BUY raw trades as bounded extra-buy candidates, capped at **one additional share per buy trade**.
3. Expand both sets into share-value lots and search for the combination that gets closest to `|deficit|`.
4. Apply trim reductions and/or one-share buy additions, updating `targetSharesMap` in lockstep.

Trades reduced to 0 shares are naturally removed by the existing sub-$1 filter.

`targetSharesMap` is updated in lockstep so the `deployedValue` computation (which reads from `targetSharesMap`) remains correct.

### Allowed adjustment space

The optimizer is intentionally bounded. It may:

- remove shares from existing BUY trades
- remove shares from `SELL / trim` trades
- add **one** extra share to an existing BUY trade

It may not:

- modify `SELL / close` trades
- create a brand-new buy in a ticker that did not already have a BUY trade
- search arbitrarily far from the computed target portfolio

### Termination and nearest-match behavior

The search space is finite because each removable trade has a finite whole-share count and each extra-buy candidate is capped at one additional share.

If an exact match exists inside the allowed adjustment space, the rebalance lands exactly on the requested net cash flow. If not, the algorithm chooses the nearest achievable whole-share result. On a tie, it prefers the no-extra-capital side.

The result is always the **nearest achievable net cash flow** given whole-share constraints.

### Interaction with cashAdjustment

Subtracting `cashAdjustment` from the deficit means:
- `cashAdjustment = 0` (default): algorithm targets `buys ≈ sells`.
- `cashAdjustment > 0`: algorithm targets `buys - sells ≈ cashAdjustment`.
- `cashAdjustment < 0`: algorithm targets `sells - buys ≈ |cashAdjustment|`.

---

## Tests (`rebalancer.test.js`)

| Case | What it verifies |
|------|-----------------|
| Tolerance-induced deficit | With tolerance > 0 and skipped trims present, `Σ(buys) ≤ Σ(sells)` after rebalance |
| Zero tolerance unchanged | With `tolerancePercent = 0`, no buy reduction occurs; existing behaviour is untouched |
| cashAdjustment preserved | With `cashAdjustment = X > 0`, net cash flow lands as close as possible to `X` |
| High-price stocks | Deficit can close in 1–2 share removals when that is already the nearest achievable result |
| Nearest-match vs greedy | A cheaper-share combination is chosen over a greedy high-price overshoot when it lands closer to zero |
| Excess sells | When `Σ(sells) > Σ(buys) + |cashAdjustment|`, the algorithm reduces trim sells toward the same nearest-match target |
| Residual sell excess | When sells still exceed buys after trim reduction, one extra share can be added to an existing buy if that gets closer to the target net cash flow |
| All buys eliminated | If deficit exceeds total buy value, all buys are removed; `deficit = -Σ(sells) ≤ 0` |

---

## UI / Return Value

No UI changes. No new parameters. No changes to the return signature `{ trades, droppedCount, skippedCount, totalValue, deployedValue }`.

A buy trade reduced to 0 shares will be counted in `droppedCount` by the existing sub-$1 filter. This is a minor cosmetic imprecision (the reason for dropping differs) accepted for now.

---

## Out of Scope

- Surfacing net cash flow (`Σ(sells) - Σ(buys)`) in the UI — useful future addition but not part of this spec.
- Distinguishing "cash-neutral dropped" from "sub-$1 dropped" in `droppedCount`.
- Searching beyond one extra share per buy candidate.
