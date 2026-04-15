# Changelog

---

## 2026-04-14 — Minimal UI redesign

The app was redesigned for a lighter, more condensed feel:

- Single-column centered layout (620px) replacing the previous two-column card grid
- Hero section, helper texts, and example chips removed — only labels and controls remain
- Both buttons (Parse and Generate) are now full-width with a consistent flat dark style
- Sections numbered 01/02/03 with minimal dividers instead of heavy card borders
- **Rebalance Plan** replaces "Trade Plan" throughout
- Coverage default lowered to 75%
- Summary metrics simplified to Buys / Sells / Portfolio value
- Settings reordered: API key → Rebalance tolerance % → Cash ±$
- App renamed from `index.html` to `index.html`

---

## 2026-04-14 — Guided UI refresh

The app now presents the rebalance flow as a clearer 3-step workflow with stronger information hierarchy:

- New guided layout: **Model Intake**, **Portfolio + Settings**, and **Trade Plan**
- Stronger visual system with improved spacing, typography, status states, and responsive layout
- Model parsing now surfaces a compact summary of parsed names and current coverage scope
- Portfolio validation and API-key handling are shown in clearer status panels instead of raw inline text
- Trade output now includes summary metrics, stronger loading/empty states, action badges, and clearer notices for skipped or dropped trades

---

## 2026-04-14 — Cash-neutral rebalancing

Rebalance trades now aim for the best whole-share balance between model replication and cash neutrality:

- When the tolerance filter skips a trim (a position is slightly over its target weight), the rebalancer previously bought other stocks as if that cash had been freed — requiring you to inject the difference from your account's free cash balance.
- The rebalancer now starts from the exact-target whole-share portfolio, then searches nearby whole-share adjustments to make net cash flow land as close as possible to the requested `cashAdjustment`.
- That search can reduce buys, reduce trim sells, or add one extra share to an existing buy when that produces a better overall result.
- **`cashAdjustment` is unaffected** — positive adjustments (intentional cash deployment) still work exactly as before.

---

## 2026-04-14 — Cash adjustment

You can now specify a cash adjustment before rebalancing:

- Enter a **positive amount** to deploy extra cash sitting in your brokerage account — the rebalancer will buy more shares to put it to work.
- Enter a **negative amount** to model a withdrawal — the rebalancer will sell positions to free up the requested cash.
- Defaults to **0** (no change to current behavior).

---

## 2026-03-24 — Clearer trade labels

The Action column now tells you more than just BUY or SELL:

- **Open** — buying into a stock you don't currently hold
- **Add** — buying more of a stock you already own
- **Trim** — selling some shares of a stock to bring it back to its target weight
- **Close** — selling all shares of a stock that is no longer in the model

---

## 2026-03-24 — Better cash deployment + tolerance control

- Rebalancing now deploys more of your cash — previously a small amount would be left idle due to rounding. The new method distributes leftover cash by allocating one extra share to the positions where it fits best.
- New **Tolerance %** control: skip trades for positions already close to their target weight — useful to avoid unnecessary churn on positions that are nearly in balance.

---

## 2026-03-24 — Flexible portfolio input

You can now paste your holdings in any format — comma, semicolon, tab, or space between ticker and shares all work:

- `AAPL, 10`
- `AAPL 10`
- `AAPL	10` *(tab)*
- `AAPL; 10`

---

## 2026-03-24 — Initial release

- Paste your Alpha Picks portfolio dump and your current holdings to get a precise buy/sell trade list.
- Set a **coverage threshold** to focus on your top AP picks by weight — lower the threshold to trade fewer positions.
- Live prices fetched automatically via your Finnhub API key.
- Trades under $1 are automatically omitted from the list.
