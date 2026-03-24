# APRebalance — Design Spec
**Date:** 2026-03-24

## Overview

A self-contained `index.html` app that helps replicate and rebalance a personal stock portfolio against the Alpha Picks (AP) model portfolio. The user manually pastes the AP portfolio dump and their own holdings, sets a coverage threshold, and receives a precise buy/sell trade list.

---

## Architecture

Single `index.html` file with embedded CSS and JavaScript. No external dependencies, no build step, no server required.

### Modules

**APParser**
Parses the raw text copied from the Alpha Picks webpage into a structured list of `{ ticker, weight }` objects.
- Handles the specific multi-line format of the AP dump (see AP Dump Format section)
- All tickers are normalized to uppercase on parse
- `weight` is stored as a plain number representing the percentage value (e.g., `"0.46%"` → `0.46`, `"4.26%"` → `4.26`). Weights are **not** stored as fractions of 1.
- Duplicate tickers (same stock picked multiple times at different dates) are detected after normalization and have their weights **summed** into a single entry. This summing happens before any sorting or coverage filtering.
- After deduplication, the total of all weights may not be exactly 100 (the AP dump represents a partial portfolio). This is expected and handled in Step 1 (see Rebalancing Logic).
- A ticker can only appear in one of the active model or the out-of-model sell set — never both. Deduplication guarantees each ticker appears exactly once.

**PortfolioParser**
Parses the user's current holdings from a plain-text CSV paste.
- Format: one entry per line, `TICKER, shares` (e.g., `AAPL, 10` or `AAPL,10`)
- Leading and trailing whitespace is stripped from both the ticker and shares fields; whitespace after the comma is optional
- All tickers are normalized to uppercase on parse
- Blank lines and leading/trailing whitespace on lines are ignored
- If the same ticker appears more than once, shares are **summed** across all occurrences
- Holdings with a final share count of 0 (e.g., `AAPL, 0`) are silently ignored and treated as not held
- Parsing is triggered **on every keystroke** in the portfolio textarea (live validation). The "successfully parsed" state requires every non-blank line to match the `TICKER, number` format with a positive number.

**PriceProvider (interface)**
Defines the contract for price lookups: `getPrices(tickers: string[]) → Promise<Map<string, number>>`.
- Accepts a list of tickers, returns a map of ticker → price
- **FinnhubProvider** — the current implementation. Reads an API key from `localStorage`. Uses the Finnhub `/quote` endpoint (`GET https://finnhub.io/api/v1/quote?symbol=TICKER&token=API_KEY`). The current price is the `c` field in the response. A ticker is considered not found if `c` is `0` or `null`.
- Swapping providers requires only implementing the same interface — no other code changes.

**Rebalancer**
Pure function. Takes the AP model, coverage threshold, prices map, and user holdings; returns a filtered trade list (sub-$1 trades already removed). All price validation and halting occurs before this function is called (see Error Handling).

**UI Layer**
Renders inputs and outputs, wires modules together, persists the API key in `localStorage`.

---

## AP Dump Format

The raw text pasted from the Alpha Picks webpage contains a header line identifiable by being the first line that starts with `"Company"` (scan all lines until this match, discard it, then parse stock blocks starting from the next line). Everything after the header follows a repeating block structure:

```
<Company Name>
<Company Name>          ← repeated
[Winner]                ← optional badge line, literal string "Winner"
<TICKER>\t<Date>        ← tab-separated
<Return%>
<Sector>\t<Rating>\t<Holding%>
```

Example block (non-winner):
```
Fabrinet
Fabrinet
FN	3/2/2026
4.59%
Information Technology	Strong Buy	0.46%
```

Example block (winner):
```
Argan, Inc.
Argan, Inc.
Winner
AGX	10/15/2024
282.53%
Industrials	Hold	4.26%
```

The parser extracts:
- **ticker**: first whitespace-delimited token on the ticker+date line
- **weight**: last tab-delimited token on the sector+rating+weight line, stripping the `%` suffix and keeping the number as-is (e.g., `"0.46%"` → stored as `0.46`, not `0.0046`)

The `Winner` line is detected by exact string match and skipped.

---

## App State Model

The app has two explicit states:

**Pre-rebalance state**: AP paste and portfolio paste may be edited freely. The coverage slider live-updates which rows in the AP table are greyed out. The trade summary panel is empty.

**Post-rebalance state**: Entered when the Rebalance button is clicked and completes successfully. The trade summary is shown.

Any of the following transitions return the app to the pre-rebalance state and clear the trade summary:
- User moves the coverage slider
- User edits the AP paste textarea and re-clicks Parse
- User edits the portfolio paste textarea
- User changes the API key field

---

## Rebalancing Logic

All weights throughout are in percentage units (e.g., `0.46`, `4.26`, not `0.0046`, `0.0426`).

### Step 1 — Filter AP model
Sort post-dedup AP stocks by weight descending. Walk the list accumulating weights; **include the stock that first causes the running total to meet or exceed** `(coverage_threshold / 100) × total_AP_weight`, where `total_AP_weight = Σ all post-dedup weights`. This ensures coverage is measured as a fraction of the actual AP weight total, not a fixed 100. Those stocks form the active model. The slider minimum is 1%.

The same post-dedup, weight-sorted stock list used for the coverage filter is the source of truth for the AP table display. The "Cumulative %" column in the UI is computed from this list at parse time and is static — it never changes when the slider moves. Only the visual greying of rows updates on slider change.

### Step 2 — Re-normalize
Divide each selected stock's weight by the **sum of the selected stocks' weights** (not `total_AP_weight`), yielding normalized weights that sum to 100.

### Step 3 — Fetch prices
Prices are fetched for **all tickers** appearing in either the AP model or the user's portfolio. This ensures out-of-model holdings have a price for their contribution to `total_value` and the SELL trade's "Est. Value."

Prices are fetched **concurrently** using `Promise.all`. For typical portfolio sizes (up to ~100 tickers), a single burst stays within Finnhub's free tier limit of 60 calls/minute.

**After `Promise.all` resolves**, validate all prices before any computation:
- If any ticker has `c: 0` or `c: null` → collect all such tickers, show error banner, halt
- If any fetch returned HTTP 401/403/429/other error → show appropriate error banner, halt

Only if all prices are valid does execution proceed to Step 4.

### Step 4 — Compute total portfolio value
`total_value = Σ (shares × current_price)` across **all** user holdings, including stocks that will be sold. This value is computed once and held **fixed** for all subsequent steps.

### Step 5 — Compute target shares
For each stock in the active model:
```
target_value  = total_value × (normalized_weight / 100)
target_shares = floor(target_value / current_price)
```
`normalized_weight / 100` converts from percentage units to a fraction before multiplying by `total_value`.

Shares are always rounded **down** (floor) to whole shares to avoid over-buying.

### Step 6 — Compute and filter trades
- **In model, currently held**: `delta = target_shares − current_shares` → BUY if positive, SELL if negative
- **In model, not currently held**: BUY `target_shares`
- **In portfolio, not in model**: SELL all shares

After computing all trades, filter out any where `|delta_shares| × current_price < $1`. This filtering happens inside the Rebalancer before the trade list is returned to the UI. Dropped count is included in the return value so the UI can display the omission notice.

**No iteration required.** Total portfolio value is fixed upfront; trades are a single-pass delta calculation.

---

## Error Handling

**API key:**
- Missing (empty field): "Rebalance" button is disabled when the field is empty. If the user clears the key after a successful rebalance, the button re-disables immediately.
- Invalid: detected when a Finnhub fetch returns HTTP 401 or 403; show error banner "Invalid API key" and halt.

**Price fetch errors (checked after all fetches complete, before any computation):**
- Ticker not found (`c: 0` or `c: null`): show error banner listing affected tickers; halt.
- Rate limit (HTTP 429): show error banner "Rate limit exceeded — wait a moment and try again"; halt.
- Other HTTP errors: show error banner with the status code; halt.

In all error cases the trade summary panel is cleared and replaced with the error message. The app returns to pre-rebalance state.

**"Rebalance" button enable condition**: enabled only when (a) AP model is successfully parsed, (b) portfolio is successfully parsed (all non-blank lines are valid), and (c) API key field is non-empty.

---

## UI Layout

### Top — AP Model Panel
- Textarea: paste raw AP webpage dump
- "Parse" button → compact table: Ticker | Weight | Cumulative %
  - Cumulative % values are static, computed at parse time from the post-dedup weight-sorted list
- Coverage slider (1–100%, default 80%):
  - Live-updates greying of rows below the current cutoff; does not recompute Cumulative % values
  - Moving the slider clears the trade summary (pre-rebalance state)

### Middle — My Portfolio Panel
- Textarea: paste current holdings CSV (live-validated on every keystroke)
- API key input (password field, persisted in `localStorage`)
- "Rebalance" button: enabled only when AP model is parsed, portfolio is valid, and API key is non-empty

### Bottom — Trade Summary Panel
- Table: Ticker | Action | Shares | Est. Value
- The "Shares" column always shows a positive integer; the "Action" column (BUY/SELL) encodes direction
- BUY rows (green) grouped above SELL rows (red), each group sorted by est. value descending
- Footer rows: total buy value, total sell value
- Status line:
  - Total portfolio value (`total_value`)
  - "X% of portfolio deployed" where X = `Σ(target_shares × price) / total_value × 100`, rounded to one decimal
  - "N trade(s) under $1 omitted" if any were dropped (omitted if none)

### Styling
- Plain HTML/CSS/JS, no frameworks
- Clean, functional aesthetic
- Color coding: green for buys, red for sells

---

## Data Flow

```
AP Paste → APParser (dedup+normalize) → post-dedup weight-sorted list
                                                  ↓
                                    filter+re-normalize → active model
                                                  ↓
My Portfolio Paste → PortfolioParser (live, dedup+normalize) → holdings
                                                  ↓
          PriceProvider.getPrices(all tickers) → validate all → prices map
                                                  ↓
                                         Rebalancer → filtered trade list
                                                  ↓
                                      UI renders trade table
```

---

## Out of Scope
- Fractional shares (output is always rounded down to whole shares)
- Tax lot tracking or cost basis
- Trade execution or brokerage integration
- Historical performance tracking
- Multi-currency support
