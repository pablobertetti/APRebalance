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
- Handles the specific multi-line format of the AP dump (company name repeated twice, optional "Winner" badge, ticker + date on one line, return on next, sector + rating + weight on last)
- Duplicate tickers (same stock picked multiple times at different dates) have their weights **summed** into a single entry

**PortfolioParser**
Parses the user's current holdings from a plain-text CSV paste.
- Format: one entry per line, `TICKER, shares` (e.g., `AAPL, 10`)
- Ignores blank lines and whitespace

**PriceProvider (interface)**
Defines the contract for price lookups: `getPrice(ticker) → Promise<number>`.
- **FinnhubProvider** — the current implementation. Reads an API key from `localStorage`, calls the Finnhub REST API for each ticker.
- Swapping providers requires only implementing the same interface — no other code changes.

**Rebalancer**
Pure function. Takes the AP model, coverage threshold, current prices, and user holdings; returns a trade list.

**UI Layer**
Renders inputs and outputs, wires modules together, persists the API key in `localStorage`.

---

## Rebalancing Logic

### Step 1 — Filter AP model
Sort AP stocks by weight descending. Accumulate weights until the running total exceeds the coverage threshold (e.g., 80%). Those stocks form the active model.

### Step 2 — Re-normalize
Scale the selected stocks' weights so they sum to 100%.

### Step 3 — Compute total portfolio value
`total_value = Σ (shares × current_price)` across all user holdings (including stocks that will be sold).

### Step 4 — Compute target values
For each stock in the active model:
`target_value = total_value × normalized_weight`
`target_shares = target_value / current_price`

### Step 5 — Compute trades
- **In model, currently held**: delta = target_shares − current_shares → BUY if positive, SELL if negative
- **In model, not currently held**: BUY target_shares
- **In portfolio, not in model**: SELL all shares

Trades with an estimated value < $1 are silently dropped (rounding noise).

**No iteration required.** Total portfolio value is fixed upfront; trades are a single-pass delta calculation.

---

## UI Layout

### Top — AP Model Panel
- Textarea: paste raw AP webpage dump
- "Parse" button → compact table: Ticker | Weight | Cumulative %
- Coverage slider (0–100%, default 80%): live-updates which rows are included (greyed out below cutoff)

### Middle — My Portfolio Panel
- Textarea: paste current holdings CSV
- API key input (password field, persisted in `localStorage`)
- "Rebalance" button (disabled until both inputs are successfully parsed)

### Bottom — Trade Summary Panel
- Table: Ticker | Action | Shares | Est. Value
- BUY rows (green) grouped above SELL rows (red), each group sorted by est. value descending
- Footer rows: total buy value, total sell value
- Status line: total portfolio value, coverage % achieved

### Styling
- Plain HTML/CSS/JS, no frameworks
- Clean, functional aesthetic
- Color coding: green for buys, red for sells

---

## Data Flow

```
AP Paste → APParser → active model (filtered + normalized)
                              ↓
My Portfolio Paste → PortfolioParser → holdings
                              ↓
                   PriceProvider.getPrice() → prices
                              ↓
                        Rebalancer → trades
                              ↓
                         UI renders trade table
```

---

## Out of Scope
- Fractional shares (output is rounded to whole shares)
- Tax lot tracking or cost basis
- Trade execution or brokerage integration
- Historical performance tracking
- Multi-currency support
