# Room Muse v2 — Handoff to the next agent

You are taking over an in-flight upgrade of an existing, working application. Read this document in
full before touching anything. Then read, in this order:

1. `docs/plan/COORDINATION.md` — the living shared state: decisions, measured findings, open questions.
2. `docs/plan/PLAN.md` — the original inspection findings and the numbered defect list (D1–D15).
3. `docs/CONTRACTS_V2.md` — the frozen data model and API contracts.

**Functional source of truth:** `C:\Data\LocalNettCreative\RoomMuse Information\Room Muse - Product Requirements.md`
(referenced throughout as REQ-1 … REQ-14). It outranks this document. If they conflict, the
requirements win and you record the resolution in `COORDINATION.md`.

---

## 1. What Room Muse is

An Expo / React Native 0.81 app (iOS via Expo Go, plus react-native-web for tests) with a single
local Node HTTP server. A user photographs a room, picks a design style, gets three AI-rendered
variations, chooses one, sets a budget, and receives a shopping plan of **real, verified, currently
purchasable products** with direct product-page links. They can then keep shopping with the app —
substituting products they find in store, tracking price changes, and saving multiple rooms.

No database, no framework. Storage is AsyncStorage on device plus JSON files on the server.

---

## 2. Where things stand

### Repository

| | |
|---|---|
| Repo root | `C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse` (the outer folder is **not** a repo) |
| Working branch | `roommuse-v2/integration` — **all completed work is here** |
| Original trunk | `codex/sibling-roommuse-preservation` — **nothing has been merged into it yet** |
| Rollback point | tag `baseline/pre-v2` (commit `2379fb2`) |
| Remote | `https://github.com/nnettey/RoomMuse.git` — **nothing has been pushed** |
| Diff vs baseline | 38 files, ~3,700 insertions |

28 commits on the integration branch, each a small, revertable unit. Workstream branches
(`ws/0-stabilize` … `ws/5b-shopping-companion`) are retained for archaeology; they are all merged.

### Test gates — the bar you must not fall below

```bash
npm run typecheck && npm run test:unit && npm run test:e2e
```

| Gate | At baseline | Now |
|---|---|---|
| `typecheck` | clean | clean |
| `test:unit` | 11 pass | **70 pass** across 5 files |
| `test:e2e` | **6 failed / 3 passed** | **15 pass** |
| `test:visual` | not run | **stale — see §6** |

The e2e suite was already broken at baseline (stale locators, not broken behaviour). It was repaired
early precisely so it could gate the rest of the work. Keep it that way.

---

## 3. Rules of engagement — these are not negotiable

### 3.1 No regressions

The application worked before this project started and works better now. Your job is to extend it
without breaking it.

- Run all three gates **before** you start, so you know what you inherited.
- Run them again before every commit.
- A pre-existing test that starts failing is a regression until proven otherwise.
- **Never** make a failing test pass by weakening an assertion, loosening a matcher, raising a diff
  threshold, deleting a case, or skipping a test. If a test blocks you, either your change is wrong
  or the requirement changed — and the second case gets written down in `COORDINATION.md` §9 with
  the reasoning *before* the test is edited.
- Updating a **stale locator** to match an intentional UI change is not weakening a test. Changing
  what a test *asserts about behaviour* is. Know which one you are doing, and say so in the commit.

### 3.2 Data integrity — the spine of this product

This matters more than any feature. REQ-1 and REQ-11 are the reason the product exists, and the
user's single biggest complaint was fabricated shopping data.

- **Never fabricate a price, availability, discount, retailer, product, or URL.** Not as a
  placeholder, not as a fallback, not "just for the demo path".
- A product may only be marked `verified` if it was confirmed on the retailer's own product page,
  with a current price, at a recorded time. The mechanism is the citation gate in
  `server/server.mjs` (`resolveProductBatch`): only URLs the model actually cited are eligible, and
  they must also pass `isDirectProductUrl` and the retailer allowlist. **Do not remove or soften any
  of those checks.**
- `user-supplied` (something the shopper photographed or typed) is **never** `verified`.
- An unknown value stays absent. An unestablished dimension is reported as unknown, not guessed.
- When nothing can be verified, the honest outcome is an **empty plan with an explanation** — that
  is already implemented and tested. Do not "improve" it by filling the gap.
- Seeded demo products (`src/enhancedData.ts` `seeds`, `src/data.ts` `catalog`, `alts()`) exist
  **only** for `?demo=` routes and e2e fixtures. A test pins that they cannot reach a live project.

### 3.3 Git hygiene

- Work on a branch off `roommuse-v2/integration`. Merge back with `--no-ff`.
- **Do not merge into `codex/sibling-roommuse-preservation` and do not push** without explicit
  instruction from the user. Nothing has left this machine yet.
- Small, single-purpose commits. Body explains *why*, and names the REQ or defect ID.
- Never `push --force`. Never commit `.env`, `storage/`, `dist/`, `.test-dist/`, screenshots, or any
  key. `.gitignore` covers these — verify before every commit anyway.
- Visual baseline regeneration goes in **its own commit**, separate from logic.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

### 3.4 Code standards

- **Most source files are minified onto very long single lines.** This is pre-existing. Match the
  surrounding density when editing them; do **not** reformat or reflow a minified line, because a
  reflow is a whole-file diff that destroys reviewability and any concurrent work. New files may be
  written normally formatted — `src/budget.ts`, `src/constraints.ts`, `src/PlanScreens.tsx`,
  `src/ShopScreens.tsx`, `src/projectStore.ts` all are.
- TypeScript `strict` **and** `noUncheckedIndexedAccess` are on. Keep them on.
- **Business rules belong in the domain layer, not in components.** Screens call `budgetSummary`,
  `priceMovement`, `canModifyItem` and so on. No money maths or policy inside a component — that is
  how every surface stays consistent.
- Comment the *why*, especially for anything that looks odd. Several non-obvious constraints in this
  codebase are documented in-line precisely so nobody "simplifies" them back into bugs.
- Accessibility is already good and is load-bearing for the e2e suite: 44 px touch targets,
  `accessibilityRole` / `accessibilityLabel` / `accessibilityState` on every control, reduced-motion
  support. Match it. Journeys locate elements by accessible name.
- Keep user-facing copy plain and honest. When the app is uncertain, it says so.

### 3.5 Verify against reality, do not assume

This is the habit that produced most of the value in this project. Repeatedly, the assumption was
wrong and one cheap probe settled it:

- Model capabilities were probed against the live API before four call sites were rewired — two of
  the four turned out not to support the new model at all.
- Multi-image rendering was tested against a real three-photo scan before the render path changed.
- The storage ceiling was measured, not estimated — and the real number was a blocker.
- The e2e baseline was measured on the untouched tag before anything was blamed on new work.

If you are about to build on "it probably works this way", spend the ten minutes to check.

---

## 4. Architecture you are inheriting

```
App.tsx  (re-export only)
  └── src/RoomMuseApp.tsx        router, orchestration, all cross-screen state
        ├── src/EnhancedScreens.tsx  capture, comparison slider, shopping, product, alternatives, refine
        ├── src/ProjectScreens.tsx   project hub, budget tiers, progress, deals
        ├── src/PlanScreens.tsx      NEW  budget setup, project library, price refresh
        ├── src/ShopScreens.tsx      NEW  constraints, in-store find, compare/favourites
        ├── src/domain.ts            pure rules: totals, normalize, lifecycle, substitution, comparison
        ├── src/budget.ts            NEW  projected spend, variance, cost drivers, substitutions
        ├── src/constraints.ts       NEW  the keep-this guard
        ├── src/projectStore.ts      NEW  multi-project list/open/delete/status
        ├── src/persistence.ts       AsyncStorage v3 + migration + server sync
        └── src/designService.ts ──► server/server.mjs
```

### Server endpoints (`server/server.mjs`, ~900 lines)

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{ok, ai}` — `ai:true` means the API key loaded |
| `POST /api/design` | analysis + 3 renders. Accepts optional `budget`, `constraints`, `retainedItems`, `roomDimensions` |
| `POST /api/shopping-plan` | resolve products for **one chosen variation**, budget- and constraint-aware |
| `POST /api/prices/refresh` | re-check the same product pages; **409 for completed projects** |
| `POST /api/identify-product` | vision analysis of a product photographed in store |
| `POST /api/refine` | regenerate one concept image from instructions |
| `GET /designs/:file` | serves generated images |
| `GET\|PUT /api/projects/:id` | optional server-side project sync |

### AI models — verified against the live API, do not change without re-probing

| Role | Model | Notes |
|---|---|---|
| Room analysis, concept brief, product parse | `gpt-5.6-luna` | `/v1/responses` + strict `json_schema` |
| Live product search | `gpt-5.6-luna` | `/v1/responses` + `tools:[{type:"web_search"}]` |
| Room render | **`gpt-image-2`** | `/v1/images/edits`. **The text model is rejected here** — that endpoint only takes image models |

All overridable via `OPENAI_TEXT_MODEL`, `OPENAI_ANALYSIS_MODEL`, `OPENAI_PRODUCT_SEARCH_MODEL`,
`OPENAI_PRODUCT_PARSE_MODEL`, `OPENAI_IMAGE_MODEL`. `web_search_options` on `chat/completions` is
**not** supported by this model — the Responses `web_search` tool is the working path.

### Non-obvious facts that will bite you

1. **Multi-image render requires `image[]`**, repeated. Repeating `image` returns
   `400 duplicate_parameter`. The **first image is the base** and sets camera and framing; the rest
   are references, and the prompt must explicitly say they are the same space from other angles or
   they barely influence the result.
2. **`normalizeProject` builds an explicit object and does not spread.** Any field you add to
   `Project` must be added there too or it is silently erased on every save/reload. A test guards
   this — do not delete it.
3. **`save()` in `RoomMuseApp` is debounced (180 ms).** Never read state straight after calling it;
   pass the updated project through explicitly. This already caused one real bug where the budget
   never reached the server.
4. **Price history is append-only and unions across sync replicas.** Last-write-wins would lose
   observations. Constraint releases likewise always beat an active row in a merge.
5. **The client and server each hold a copy of the retailer URL pattern table** (`src/productLinks.ts`
   and `server/server.mjs`) because a Node server and an Expo app cannot share a module here. A test
   asserts they stay identical.
6. **Library projects are stored with photos by reference**, not inline base64 — a 3-photo project
   is 825 KB inline versus 33 KB by reference, and eight rooms would breach Android's ~6 MB
   AsyncStorage ceiling. A photo with **no** server-side copy is never stripped.

---

## 5. What each requirement's status actually is

Be accurate about this with the user; do not overstate.

| REQ | Status | Where |
|---|---|---|
| 1 Dynamic real products | **Done, verified live** — 9/9 items with direct product URLs | `server.mjs` |
| 2 Budget intelligence | **Done** — numeric budget reaches the search; variance, categories, cost drivers, substitutions | `budget.ts`, `PlanScreens.tsx` |
| 3 In-store substitution | **Done** — identify, preview effect, apply, reversible | `ShopScreens.tsx`, `domain.ts` |
| 4 Room photos | **Done** — all three reach the render; capture copy matches reality | `server.mjs`, `EnhancedScreens.tsx` |
| 5 Three variations | **Done** — distinct images *and* distinct plans (0 of 4 products shared in a live test) | `server.mjs` |
| 6 Saveable projects | **Done** — library, v3 migration, all state round-trips | `projectStore.ts` |
| 7 Lifecycle | **Done** — refresh, price history, frozen completed snapshots | `domain.ts`, `PlanScreens.tsx` |
| 8 Design rationale | **PARTIAL** — see §6 | `server.mjs buildDesignReport` |
| 9 Favorites / comparison | **Done** | `ShopScreens.tsx` |
| 10 Constraints | **Done** — enforced by a guard, deliberate recorded release | `constraints.ts` |
| 11 Live data integrity | **Done** — provenance, price history, unresolved states | throughout |
| 12 Reuse existing AI | **Done** — extended, never replaced | `server.mjs` |
| 13 Regression coverage | **Mostly** — 70 unit + 15 e2e; visual baselines stale | `tests/`, `e2e/` |

---

## 6. Known gaps and open items — start here

### High priority

**G1. User testing feedback (your primary input).** The user is walking the full flow on a real
iPhone. Their findings are the reason you exist. Specific things they were asked to judge: whether
the three variations feel genuinely different; whether the products suit their room and the links
land on real product pages; whether the budget screen helps when over budget; whether ~60 s to build
a plan is acceptable.

**G2. Visual baselines are stale.** `e2e/visual.spec.ts-snapshots/` holds 60 approved screenshots
across 6 viewports, taken before the UI changed. `npm run test:visual` will fail. They need
reviewing diff by diff, confirming each change is intended, and regenerating **in their own commit**.
Do not regenerate blind. Note the state list in `visual.spec.ts` does not yet include the new
screens (budget, library, refresh, constraints, field, compare).

**G3. REQ-8 design rationale is templated.** `buildDesignReport` assembles prose from the room
analysis with the concept name substituted in. It is grounded and honest, but REQ-8 asks for
explanations tied to the *specific products chosen* and their relationships — style, colour, scale,
layout, materials, balance. REQ-8 also warns against generic design prose, so keep it concise. This
is the one requirement to call partially met.

**G4. Two budget screens overlap.** The new numeric `BudgetSetupScreen` (`PlanScreens.tsx`) and the
older qualitative tier `BudgetScreen` (`ProjectScreens.tsx`, save/balanced/invest) both exist and
both reachable. The intent is that tiers become the *substitution strategy* inside the numeric
budget rather than a parallel concept. The user flagged the overlap as awkward.

### Medium

**G5. Generation latency.** `/api/design` takes ~67 s and `/api/shopping-plan` ~60 s. Both are now
separate, which was the big win, but the three renders still run to completion before anything
returns. Streaming the Signature render first was considered and not done. No agreed target exists
— ask the user before optimising.

**G6. Retailer allowlist is 11 domains** (`retailerDomains` in `server.mjs`). It may starve some
categories. Widen deliberately, keeping the direct-product-URL rule intact, and add test cases for
any new pattern.

**G7. `roomPlan` fallback is keyword-based** and only used when analysis returns no items. It was
already fixed once for open-plan rooms matching the wrong zone; it is still a heuristic.

**G8. Server-side project sync is untested at scale** and `deleteProject` deliberately leaves the
server copy in place. If sync becomes important, that decision needs revisiting.

### Deliberately not done

- Not merged to trunk, not pushed. The user decides when.
- No database. Local-first was an explicit assumption.
- No new native modules — Expo Go is the distribution channel for testing.

---

## 7. Running it

```bash
powershell -ExecutionPolicy Bypass -File "C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse\scripts\start-roommuse.ps1"
```

Starts the API and Expo, derives the LAN URL from the Wi-Fi address, and prints the `exp://` link for
Expo Go. `.env` holds `OPENAI_API_KEY` and is gitignored — **never** commit it or echo its contents.
Confirm `GET /health` returns `{"ok":true,"ai":true}` before blaming the app for missing products.

Test commands: `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm run test:visual`.

Real room photos for spikes: `C:\Data\LocalNettCreative\RoomMuse Information\spike-room-photos\`
(an open-plan living room with an adjoining office — a deliberately hard case that has already
caught two bugs a simple room would not have).

---

## 8. How to work

1. **Plan before building.** Inspect first, map findings to code with file:line evidence, and record
   uncertainty as an open question rather than guessing. Do not invent facts about the repository.
2. **Update `COORDINATION.md` as you go** — decisions, measured findings, blockers, test status. It
   is the shared record and the next agent will depend on it exactly as you depend on it now.
3. **Diagnose before rewriting.** Nearly every problem in this codebase turned out to be a small
   root cause in otherwise sound code. The live product search, the citation gate, the accessibility
   work, the three-variation render, the conflict resolution — all of it was already good and was
   preserved. Prefer: understand → diagnose → repair → extend → refactor only where justified.
4. **Report honestly.** If something is partially done, say so and say why. If a test fails, show the
   output. The user has consistently been given the unvarnished state and has made good decisions
   with it.
