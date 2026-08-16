# WS-1 — Data model and API contracts

**Read first:** `docs/plan/COORDINATION.md`, `docs/plan/PLAN.md` §3, `docs/CURRENT_CONTRACTS.md`.
**Branch:** `ws/1-contracts` off `roommuse-v2/integration`.
**Depends on:** nothing. **Blocks:** WS-2, WS-3, WS-4, WS-5. Land this fast and small.

## Goal

Freeze the v2 data model and API contract so three workstreams can build in parallel without colliding.
**Types and documentation only — no behaviour, no runtime code.**

## Files owned

`src/enhancedTypes.ts`, `docs/CONTRACTS_V2.md` (new). After this merges, `enhancedTypes.ts` is **frozen**;
changes require a COORDINATION.md §8 request naming every affected workstream.

## What to define

Additive only. Every new field optional at the read boundary with a safe default, per the compatibility rule in
`docs/CURRENT_CONTRACTS.md`. Existing `Project`, `Concept`, `Item`, `Alternative` shapes must keep parsing.

1. **Provenance and price history (REQ-11, REQ-7).**
   - `Provenance = "generated" | "discovered" | "verified" | "cached" | "historical" | "user-supplied"`
   - `PriceObservation = { price: number; currency: "USD"; observedAt: string; availability?: string; source: Provenance; url?: string }`
   - `Item.provenance`, `Item.priceHistory: PriceObservation[]` (append-only, oldest first).
   - Keep `Item.priceStatus` as a documented derived alias of provenance so existing UI
     (`EnhancedScreens.tsx:135`, `productLinks.ts:32`) and tests keep working.
   - Add an explicit unresolved marker so "no verified product found" is representable without a fake item.
2. **Budget (REQ-2).** `Project.budget = { total: number; currency: "USD"; setAt: string }`.
   Keep the existing qualitative `budgetTier` (`save|balanced|invest`) — it becomes the *substitution strategy*,
   not the budget itself. Define the shape of a budget summary (projected spend, remaining, variance, per-category
   rollup, cost drivers) that WS-3 will compute and WS-5 will render.
3. **Constraints (REQ-10).**
   `Constraint = { id; kind: "keep-item" | "keep-surface" | "keep-feature" | "no-change"; label; targetItemId?; scope; createdAt; releasedAt? }`
   on `Project.constraints`. Model release as an explicit event, never a silent overwrite.
   The existing four `ShoppingDecision` values (`domain.ts:45`) must map onto this without breaking `refineConcept`.
4. **Lifecycle (REQ-7).** `Project.status: "in-progress" | "complete"`, `completedAt?`, `lastPriceRefreshAt?`,
   and a completion snapshot shape that preserves prices at completion.
5. **Favorites and comparison (REQ-9).** `Project.favorites` covering both product candidates and design
   variations, plus the comparison-set shape.
6. **Substitution / addition (REQ-3).** Extend `FieldFind` into a persisted decision:
   identified attributes (category, approximate dimensions, price, compatibility notes), `targetItemId`,
   `action: "replace" | "add"`, outcome, and the resulting item id. Preserve the existing `FieldFind` fields.
7. **Room context (REQ-4).** A place to persist derived multi-image room context, shaped so it can hold either a
   fused/multi-image result or a single-hero-image result — the S-1 spike decides which is populated, and the type
   must not presuppose the answer.
8. **API contracts** in `docs/CONTRACTS_V2.md`, request and response, with error shapes:
   `POST /api/design` (v2 optional fields: `budget`, `constraints`, `roomDimensions`, `retainedItems`; the existing
   `{imageBase64, style}` shape must still work), `POST /api/shopping-plan`, `POST /api/prices/refresh`,
   `POST /api/identify-product`, and the existing `GET|PUT /api/projects/:id` extended for the new fields.
9. **Storage version.** Define `roommuse.project.v3` and state the v2→v3 migration contract WS-4 implements.
   The legacy `roommuse.concept` key must remain readable and must not be deleted (existing rollback guarantee).

## Prohibited

- No runtime logic. No edits to `domain.ts`, `persistence.ts`, `server.mjs`, or any screen.
- No breaking rename or removal of an existing field.
- Do not reflow existing minified lines.

## Test expectations

`npm run typecheck` and `npm run test:unit` stay green with zero test edits. If a type change forces a test edit,
you have made a breaking change — redesign it as additive instead.

## Definition of done

- `src/enhancedTypes.ts` compiles with `strict` + `noUncheckedIndexedAccess`, all 11 tests untouched and green.
- `docs/CONTRACTS_V2.md` fully specifies every interface in COORDINATION.md §5.
- COORDINATION.md §5 updated: every row moved from "Not defined" to "Defined" with a pointer.

## Required handoff

Announce the freeze in COORDINATION.md §6 and §8, and confirm to WS-2/3/4/5 that they may start.
