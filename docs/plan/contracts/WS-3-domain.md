# WS-3 — Domain logic and unit tests

**Read first:** `docs/plan/COORDINATION.md`, `docs/plan/PLAN.md` §1.4 (D2, D3, D8), §3.
**Branch:** `ws/3-domain` off `roommuse-v2/integration`. **Depends on:** WS-1.

## Goal

All new business rules as pure, fully-tested functions. This workstream carries the majority of the new unit tests
and has no UI or network dependency — it can move fastest.

## Files owned

`src/domain.ts`, `src/budget.ts` (new), `src/constraints.ts` (new), `src/productLinks.ts`,
`tests/domain.test.ts`, and demo-gating edits to `src/data.ts` / `src/enhancedData.ts` / `src/demo.ts`.

## Tasks

### T1 — Cut the seeded-data fallback out of the production path (REQ-1, REQ-11, D2 — highest priority)
`domain.ts:26` always builds demo concepts first (`const cs = demoConcepts(style, …)`) and only overwrites
`cs[0].shoppingItems` when the server returned a non-empty list (`:33`). Any server failure, missing key, or empty
match therefore ships eight fabricated products with **search-page URLs** (`enhancedData.ts:5-14`,
`data.ts:19-28`) plus three invented alternatives each (`enhancedData.ts:15`, prices computed as `p-120`, `p+40`,
`p+90`). This is the single biggest live-data-integrity violation in the codebase and the user's top complaint.

Rework `createProject` so seeded concepts are reachable **only** in explicit demo mode. When the server returns no
items, produce an honest unresolved state.

**Constraint:** the `?demo=` routes and all Playwright journeys assert the seeded strings (e.g. "Interior wall
paint", "Tailored alternative"). They must keep working through the demo path. Coordinate with WS-6.

### T2 — One shopping plan per variation (REQ-5, D3)
`domain.ts:34-40` copies the same `legacy.shoppingItems` array into every variant, re-keyed by concept id. Consume
WS-2's per-concept plans instead, and keep a safe path for older saved projects that only have one list.

### T3 — Budget engine (REQ-2) → `src/budget.ts`
Projected spend, remaining, variance vs the target, per-category rollup, cost-driver identification when over
budget, and substitution suggestions that hold the design intent. Everything recomputes on any item change
(quantity, swap, owned, purchased, removed, substituted, added). Reuse and extend `total`/`remaining`/`itemTotal`
(`domain.ts:13-15`) — do not reimplement them. `applyBudget` (`:75`) becomes the *substitution strategy* driven by
the numeric target, keeping its existing rule that only verified, direct-URL alternatives are eligible.

### T4 — Constraint enforcement (REQ-10) → `src/constraints.ts`
Persisted constraints must survive and must not be casually overridden. Provide a guard consulted by every
mutation path — `updateItem`, `swapItem`, `applyBudget`, `refineConcept`, and substitution — that refuses to
change a constrained item, plus an explicit `releaseConstraint` action. Map the four existing `ShoppingDecision`
values (`domain.ts:45`) onto real constraints without breaking `refineConcept` (`:46-53`).

### T5 — Price history (REQ-7, REQ-11)
Merge `PriceObservation` records append-only, ordered, deduplicated by `observedAt`. Derive previous/current
price, dates, delta amount and percentage, and the effect on the project total. Completed projects never accept
new observations — enforce this in the domain, not only at the API boundary.

### T6 — Substitution and addition (REQ-3)
Merge an identified in-store product into the plan as either a replacement for a named item or a new item.
Preserve the replaced item's role, category, and constraints; recompute totals and budget; mark provenance
`user-supplied`; keep the original in `originalSelection` (that field already exists, `domain.ts:22`) so the
change is reversible.

### T7 — Favorites and comparison (REQ-9)
Favoriting products and design variations; comparison selectors returning price, dimensions, style fit, budget
impact, and tradeoffs for product-vs-product and variation-vs-variation.

### T8 — Lifecycle transitions (REQ-7)
`in-progress ↔ complete` with the rules from `PLAN.md` §3 A6: completing snapshots the commercial state;
completed projects are not refreshable; reopening starts a new refresh epoch and preserves the snapshot.

## Prohibited

- No UI, no `fetch`, no AsyncStorage. Everything here is pure and synchronous where possible.
- Do not edit `src/enhancedTypes.ts` (WS-1), `server/server.mjs` (WS-2), `src/persistence.ts` (WS-4), or any screen.
- Do not delete `enhancedData.seeds`, `data.catalog`, or `alts()` — gate them, do not remove them (e2e depends on
  their exact strings).
- Do not weaken any existing assertion in `tests/domain.test.ts`. The 11 current tests must survive; where a test
  encodes behaviour a requirement intentionally changes, record the reasoning in COORDINATION.md §9 first.

## Test expectations

Every task above ships with unit tests. Required coverage: budget totals/remaining/variance; over-budget driver
identification; substitution suggestions stay within category and role; constraint guard refuses each mutation
path and permits after explicit release; price history ordering, dedup, and delta math; completed-project refusal;
substitution and addition recompute totals; favorites and comparison selectors; per-variation plans stay distinct;
seeded items unreachable outside demo mode.

## Definition of done

`typecheck` + `test:unit` green with a materially larger suite; no production code path can reach a seeded product;
every REQ-2/3/7/9/10 rule is expressed as a tested pure function that WS-5 can call directly.

## Required handoff

Publish exact selector signatures in COORDINATION.md §5 for WS-5 and WS-4 before they build against them.
