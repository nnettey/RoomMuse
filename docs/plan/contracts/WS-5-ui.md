# WS-5 — User interface

**Read first:** `docs/plan/COORDINATION.md` (especially §5 interfaces), `docs/plan/PLAN.md`.
**Branch:** `ws/5-ui` off `roommuse-v2/integration`.
**Depends on:** WS-1 hard; WS-3 and WS-4 soft (build against published interfaces, integrate as they land).
Do not start before WS-0 has merged — you inherit `src/RoomMuseApp.tsx` from it.

## Goal

Surface the new capabilities without disturbing the existing look, flow, or accessibility work.

## Files owned

`src/RoomMuseApp.tsx` (after WS-0 merges), `src/EnhancedScreens.tsx`, `src/ProjectScreens.tsx`, new `src/*Screen.tsx`.

## Tasks

### T1 — Budget entry and intelligence (REQ-2)
A numeric project budget, set before generation and editable after. On the shopping plan show projected spend,
remaining, variance, and category-level information. When over budget, show the major cost drivers and offer the
substitutions WS-3 computes. Everything updates when product choices change.
Keep the existing qualitative tier screen (`ProjectScreens.tsx:14`) — it becomes the *substitution strategy*
selector inside the numeric budget, not a replacement for it.

### T2 — Constraints / "Keep this" (REQ-10)
A screen to add, view, and deliberately release constraints ("keep my existing sofa", "do not change the
flooring", "don't repaint the walls"). Constraints must be visible wherever they take effect — on the affected
shopping item, in the design report, and on the generation screen. Releasing one requires an explicit confirming
action; it must never happen as a side effect. The four existing `RefineScreen` toggles
(`EnhancedScreens.tsx:150`) should become real constraints rather than one-shot decisions.

### T3 — Project library (REQ-6, REQ-7)
A list of saved projects with room name, thumbnail, status, total, and last-updated. Open, rename, delete, mark
complete, reopen. Show the in-progress vs complete distinction plainly, since it changes refresh behaviour.

### T4 — Price refresh and history (REQ-7)
On opening an in-progress project, offer a refresh. Show previous price, previous observation date, current price,
current observation date, change amount/percentage, and the effect on the project total. Show availability
changes. Completed projects show their snapshot with no refresh affordance at all.

### T5 — In-store substitution and addition (REQ-3)
Rebuild `FieldScreen` (`ProjectScreens.tsx:15`), which currently only emits a fixed template string. Flow:
photograph the product → the system identifies category, approximate dimensions where inferable, compatibility,
and price where discoverable → the user picks **which planned item is being replaced**, or chooses to add it as a
new item → preview the effect on plan, totals, and budget → approve → everything updates and persists.

### T6 — Favorites and comparison (REQ-9)
Favorite products and design variations. Side-by-side comparison showing price, dimensions, style fit, budget
impact, and benefits/tradeoffs, for product-vs-product and variation-vs-variation. Reuse the existing
`Comparison` component (`EnhancedScreens.tsx:105`) idiom where it fits.

### T7 — Honest unresolved and provenance states (REQ-1, REQ-11)
When no verified product exists for a role, say so and offer retry or user-supplied entry — never a placeholder
that reads as a real recommendation. Show provenance and observation time. Extend the existing pattern, which is
already good: the buy button is disabled with "Exact product currently unavailable" when a product is unverified
(`EnhancedScreens.tsx:135`), and `verifiedPriceLabel` (`productLinks.ts:32`) already labels checked prices.

### T8 — Capture copy must match reality (REQ-4)
Once WS-2 records the S-1 verdict, make the capture screen's promise match what the pipeline actually uses. If
multi-image is not viable for the render, either state plainly that one image drives the redesign and guide the
user to the best possible hero shot, or move to the single-excellent-photo flow. **Asking for three photos while
silently using one is explicitly forbidden by REQ-4.**

### T9 — Design rationale presentation (REQ-8)
Keep explanations useful and concise. The eight-section collapsible report (`RoomMuseApp.tsx:15`) is a good
structure — do not fill the UI with generic design prose.

## Prohibited

- No changes to `server/server.mjs`, `src/domain.ts`, `src/persistence.ts`, `src/enhancedTypes.ts`. Business rules
  belong in WS-3; call their selectors rather than recomputing anything in a component.
- Do not regress the existing accessibility work: 44 px touch targets, `accessibilityRole`/`accessibilityState`,
  the adjustable comparison handle, reduced-motion support, keyboard focus.
- Do not break in-app back navigation (`RoomMuseApp.tsx:24-38`) or the analytics events asserted by
  `tests/integration.test.ts`.
- Do not re-baseline visual snapshots — that is WS-6's, in its own commit.
- Do not reflow minified lines beyond the region you are changing.

## Test expectations

- Extend the Playwright journeys for every new screen; coordinate with WS-6, who owns `e2e/**`.
- `typecheck`, `test:unit`, `test:e2e` green. Visual diffs are expected — report them; WS-6 re-baselines.
- Verify on a real device through Expo Go, not only on web.

## Definition of done

Every REQ-2/3/6/7/9/10 user-facing behaviour is reachable, the app still looks and navigates like Room Muse, no
accessibility regression, and no screen can present unverified data as verified.

## Required handoff

Report to COORDINATION.md: new routes, which visual baselines changed and why, device verification results, and
any interface that did not fit as published.
