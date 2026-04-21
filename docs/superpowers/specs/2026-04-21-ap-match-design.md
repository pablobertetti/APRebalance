# AP Match Indicator — Design Spec

## Overview

The rebalance result shows how closely the user's portfolio matches the active AP model before and after the proposed rebalance.

The goal is to make portfolio drift understandable as a positive score: **AP Match**.

## Metric

AP Match is a 0-100 market-value allocation overlap score:

```text
AP Match = Σ min(actual_weight[ticker], model_weight[ticker])
```

Inputs:

- `model_weight`: active AP model after coverage filtering and re-normalization to 100%
- `actual_weight`: ticker market value divided by `totalValue`
- `totalValue`: current holdings value plus `cashAdjustment`, clamped to 0

Interpretation:

- `100%`: portfolio allocation matches the active AP model exactly
- `0%`: no portfolio value overlaps with the active AP model
- outside-model positions, underweights, overweights, and undeployed cash reduce the score

## Rebalancer Return Shape

`rebalance()` returns the existing trade summary plus a `matching` block:

```js
{
  trades,
  droppedCount,
  skippedCount,
  totalValue,
  deployedValue,
  matching: {
    current: { score, gaps },
    after: { score, gaps }
  }
}
```

`matching.current` is computed from the input holdings.

`matching.after` is computed by applying the final generated trades to the input holdings. This must happen after cash-neutral optimization and sub-$1 filtering so the score reflects the trades the user actually sees.

Each gap has:

```js
{
  ticker,
  modelWeight,
  actualWeight,
  gapWeight,
  direction
}
```

`direction` is one of:

- `underweight`
- `overweight`
- `outside_model`

The returned gaps are sorted by absolute `gapWeight` descending and limited to the largest five.

## UI

The Rebalance Plan summary includes an **AP Match** metric card before buys, sells, and portfolio value.

The card displays:

```text
current% to after%
```

The visual card does not show the percentage-point delta underneath, to keep the summary compact. The delta remains in the accessible label.

Hovering or focusing the card shows the largest current gaps. The gap detail is intentionally not a permanent table because the trade table remains the primary action surface.

## Tests

Coverage lives in `tests/rebalancer.test.js`:

- identical model allocation scores `100`
- fully outside-model portfolio scores `0`
- partial underweight/overweight allocation produces the expected overlap score and gap directions
- generated trades improve `matching.after`
- whole-share cash remainder reduces the post-rebalance score

The existing `tests/index-sync.test.js` verifies that the inlined app remains synchronized with `src/`.
