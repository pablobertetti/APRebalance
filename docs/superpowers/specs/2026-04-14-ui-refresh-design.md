# Guided UI Refresh — Design Note

**Date:** 2026-04-14  
**Status:** Implemented

---

## Goal

Improve the usability of the app without changing the underlying rebalance logic.

The previous UI worked, but it read like three plain utility panels with weak hierarchy. The main issue was not missing functionality; it was that the rebalance workflow required too much interpretation from the user:

- where to start
- what was valid vs incomplete
- what changed after parsing
- how to interpret the final trade output

The redesign keeps the app static and framework-free while making the workflow easier to follow and the result easier to trust.

---

## Design Decisions

### 1. Reframe the page as a workflow

The interface now follows three explicit steps:

1. `Model`
2. `Portfolio & Settings`
3. `Rebalance Plan`

Each section includes a visible state badge so the page communicates progress at a glance:

- `Waiting`
- `Ready`
- `Needs Fix`
- `Calculating`
- `Calculated`

This removes the need for the user to infer whether the app is waiting on parsing, validation, or price fetching.

### 2. Strengthen hierarchy and trust

The redesign adds:

- a stronger page header
- deliberate spacing and typography
- clearer status panels
- grouped settings
- summary cards for key metrics

The goal is a tool that still feels lightweight, but more like a purposeful finance workflow than a raw demo page.

### 3. Make the trade result the strongest panel

The trade output now includes a compact summary before the table:

- AP Match
- portfolio value
- total buys
- total sells

AP Match shows current allocation overlap against the active AP model and the projected overlap after applying the generated trades. Hover/focus reveals the largest current gaps without adding a permanent table.

This addresses a previous gap where users had to read the trade table first and mentally compute what mattered.

### 4. Clarify model and portfolio readiness

The model area now surfaces:

- parsed model status
- current coverage target
- included-name count

The portfolio area now surfaces:

- clearer validation status
- API-key guidance
- cash-adjustment context

This makes invalid or incomplete states much more obvious without changing the underlying parser behavior.

---

## Implementation Notes

- No changes to parser behavior or external inputs
- No build step added
- No framework introduced
- `index.html` remains the shipped app
- `src/ui.js` remains the mirrored UI source and must stay identical to the inlined UI block in `index.html`

The initial implementation was presentational. The current UI also consumes the rebalancer's `matching` return block for the AP Match summary.

---

## Out of Scope

- Export actions such as copy/download trade lists
- Additional analytics beyond AP Match and the current trade summary
- UI persistence for coverage, tolerance, or cash adjustment
- Any change to the Finnhub integration or rebalance engine
