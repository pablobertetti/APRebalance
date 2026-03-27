# Changelog

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
