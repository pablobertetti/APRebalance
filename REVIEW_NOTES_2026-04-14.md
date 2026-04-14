# Review Notes — 2026-04-14

This file records the fixes and follow-up work completed so the changes can be reviewed later without reconstructing the thread.

## Summary

Commits made so far:

- `5a38dc1` — `fix: target near-zero cash flow in rebalance`
- `3c55f70` — `test: add index and src parity check`
- `06d9870` — `docs: add review notes for cash-neutral fixes`
- `b815923` — `fix: balance excess sell trims in cash-neutral rebalance`

## Fixes Applied

### 1. `src/ui.js` / `index.html` sync gap on `cashAdjustment`

Problem:

- `src/rebalancer.js` supported `cashAdjustment`
- `index.html` passed `cashAdjustment`
- `src/ui.js` did **not** pass `cashAdjustment`

Fix:

- Updated [src/ui.js](/Users/pablo/code/APRebalance/src/ui.js:1) to read `#cash-adjustment` and pass it into `rebalance(...)`

Reason:

- `CLAUDE.md` says `src/` and `index.html` must stay manually synchronized
- Without this change, the standalone UI module and the shipped app behaved differently

### 2. Portfolio parser accepted malformed numeric strings

Problem:

- [src/portfolio-parser.js](/Users/pablo/code/APRebalance/src/portfolio-parser.js:1) used `parseFloat(...)`
- Inputs like `10foo` were accepted as valid share counts

Fix:

- Added strict token validation with:

```js
/^(?:\d+(?:\.\d+)?|\.\d+)$/
```

- Applied the same validation to the inlined portfolio parser in [index.html](/Users/pablo/code/APRebalance/index.html:1)

Tests added:

- malformed trailing characters are rejected
- `isValidPortfolio(...)` returns `false` for malformed share counts

### 3. Cash-neutral algorithm evolved from greedy, to nearest-match, to a bounded sweet-spot optimizer

Original behavior:

- The existing post-processing enforced only:

```text
buys <= sells + cashAdjustment
```

- It used a greedy rule: remove shares from the highest-priced buy first until the deficit was no longer positive

Why that was wrong:

- It prevented accidental capital injection
- But it could still create a large **unintended withdrawal**
- Real example from the user: buys and sells differed by about `$800` in the withdrawal direction

First fix:

- Replaced the greedy buy-reduction logic with a nearest-match search over removable buy-share lots
- New goal:

```text
minimize |sells - buys - cashAdjustment|
```

- If an exact match exists with whole shares, use it
- If not, choose the nearest achievable result
- On ties, prefer the side that does not require extra capital beyond `cashAdjustment`

Follow-up fix:

- The first version still only handled the `buys > sells` direction
- It did **not** handle `sells > buys`, which can happen when whole-share trimming overshoots or when the remaining trim set is too large
- The algorithm now also reduces `SELL / trim` trades toward the same near-zero target when net cash flow is too negative

Latest fix:

- Even after symmetric buy/trim reduction, some cases still had a residual sell-heavy gap that could be improved by a tiny above-target buy
- The algorithm now also considers adding **one extra share** to an existing buy trade when that produces a better overall cash-neutral result than leaving the cash gap idle
- This is intentionally bounded: it improves the sweet spot between replication and neutrality without letting the optimizer drift arbitrarily far from the computed target portfolio

Implementation:

- Replaced the earlier one-purpose helper with a more general lot-selection search in [src/rebalancer.js](/Users/pablo/code/APRebalance/src/rebalancer.js:1)
- Used it for buy reductions, trim-sell reductions, and bounded one-share extra-buy additions in [src/rebalancer.js](/Users/pablo/code/APRebalance/src/rebalancer.js:1)
- Mirrored the same logic into [index.html](/Users/pablo/code/APRebalance/index.html:1)

### 4. Documentation updated to match actual behavior

Files updated:

- [CLAUDE.md](/Users/pablo/code/APRebalance/CLAUDE.md:1)
- [CHANGELOG.md](/Users/pablo/code/APRebalance/CHANGELOG.md:1)
- [docs/superpowers/specs/2026-04-14-cash-neutral-design.md](/Users/pablo/code/APRebalance/docs/superpowers/specs/2026-04-14-cash-neutral-design.md:1)
- [docs/superpowers/plans/2026-04-14-cash-neutral.md](/Users/pablo/code/APRebalance/docs/superpowers/plans/2026-04-14-cash-neutral.md:1)

Doc corrections:

- changed wording from a one-sided cap on buys to a near-zero net-cash-flow target
- documented that the algorithm now minimizes absolute net cash flow relative to `cashAdjustment`
- documented tie-breaking preference toward the no-extra-capital side
- documented the bounded adjustment space explicitly so reviewers know what is and is not optimized

### 5. Added a parity test to catch future `src/` vs `index.html` drift

Problem:

- Tests only exercised `src/`
- The app ships from `index.html`
- That allowed drift to go unnoticed

Fix:

- Added [tests/index-sync.test.js](/Users/pablo/code/APRebalance/tests/index-sync.test.js:1)
- It extracts the inlined module blocks from `index.html` and compares them to:
  - `src/ap-parser.js`
  - `src/portfolio-parser.js`
  - `src/rebalancer.js`
  - `src/finnhub-provider.js`
  - `src/ui.js`

- Added the new parity test to [tests/run-tests.sh](/Users/pablo/code/APRebalance/tests/run-tests.sh:1)

Additional benefit:

- While adding this test, it exposed one remaining drift in the inlined portfolio parser, which was then fixed

## Tests Added

- portfolio parser malformed-share regression tests in [tests/portfolio-parser.test.js](/Users/pablo/code/APRebalance/tests/portfolio-parser.test.js:1)
- rebalancer regression test for the old greedy cash-neutral overshoot in [tests/rebalancer.test.js](/Users/pablo/code/APRebalance/tests/rebalancer.test.js:1)
- rebalancer regression test for the missing `sells > buys` symmetric adjustment in [tests/rebalancer.test.js](/Users/pablo/code/APRebalance/tests/rebalancer.test.js:1)
- rebalancer regression test for bounded extra-buy optimization in sell-heavy residual cases in [tests/rebalancer.test.js](/Users/pablo/code/APRebalance/tests/rebalancer.test.js:1)
- index/src parity test in [tests/index-sync.test.js](/Users/pablo/code/APRebalance/tests/index-sync.test.js:1)

## Verification Performed

Ran:

```bash
bash tests/run-tests.sh
```

Result:

- AP parser tests passed
- portfolio parser tests passed
- rebalancer tests passed
- new `index.html` parity test passed

## Important Review Focus

If reviewing this later, pay special attention to:

1. The complexity and performance characteristics of the bounded lot-selection optimizer
2. Whether the tie-break rule is the desired business rule in all cases
3. Whether the stricter portfolio share regex should also allow scientific notation or other numeric formats
4. Whether the one-extra-share cap per buy candidate is the right long-term boundary
5. Whether keeping `index.html` manually mirrored is still the right long-term approach
