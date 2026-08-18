# Tracy's Room Muse — Handoff

You are taking over a working application after a completed upgrade and a round of real user
testing. **The user's test findings in §6 are your primary input.** Everything before that exists so
you can act on them without breaking what already works.

Read in this order before touching anything:

1. This document, in full.
2. `docs/plan/COORDINATION.md` — decisions, measured findings, open questions. Keep updating it.
3. `docs/plan/PLAN.md` — original inspection findings and the numbered defect list (D1–D15).
4. `docs/CONTRACTS_V2.md` — the frozen data model and API contracts.

**Functional source of truth:** `C:\Data\LocalNettCreative\RoomMuse Information\Room Muse - Product Requirements.md`
(REQ-1 … REQ-14). It outranks this document. Where they conflict, the requirements win and you
record the resolution in `COORDINATION.md`.

---

## 1. The product

An Expo / React Native 0.81 app (iPhone via Expo Go, plus react-native-web for tests) with a single
local Node HTTP server. A user photographs a room, picks a style, gets three AI-rendered variations,
chooses one, sets a budget, and receives a shopping plan of **real, verified, currently purchasable
products with direct product-page links**. They then keep using the app while shopping — substituting
products found in store, tracking price changes, saving multiple rooms.

No database, no framework. AsyncStorage on device plus JSON files on the server.

---

## 2. Repository state — you start from a clean slate

| | |
|---|---|
| Repo root | `C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse` (the outer folder is **not** a repo) |
| Trunk | `codex/sibling-roommuse-preservation` at `8106182` — **all v2 work is merged and pushed** |
| Remote | `https://github.com/nnettey/RoomMuse.git` — in sync |
| Rollback | tag `baseline/pre-v2` (`2379fb2`), pushed |
| v2 history | `roommuse-v2/integration` and `ws/*` branches remain locally for archaeology; all merged |

Branch from trunk. There is no in-flight work to coordinate with.

### Test gates — the bar you must not fall below

```bash
npm run typecheck && npm run test:unit && npm run test:e2e
```

| Gate | Before v2 | Now |
|---|---|---|
| `typecheck` | clean | clean |
| `test:unit` | 11 pass | **70 pass** across 5 files |
| `test:e2e` | **6 failed / 3 passed** | **15 pass** |
| `test:visual` | not run | **stale — see G2** |

---

## 3. Rules of engagement — not negotiable

### 3.1 No regressions

- Run all three gates **before** you start, so you know what you inherited.
- Run them again before every commit.
- A previously passing test that fails is a regression until proven otherwise.
- **Never** make a failing test pass by weakening an assertion, loosening a matcher, raising a diff
  threshold, deleting a case, or skipping it. If a test blocks you, either your change is wrong or
  the requirement changed — and the second case is written into `COORDINATION.md` §9 with the
  reasoning *before* the test is touched.
- Updating a **stale locator** to match an intentional UI change is not weakening a test. Changing
  what a test *asserts about behaviour* is. Know which you are doing and say so in the commit.
- Several findings in §6 change user flows. Expect journeys to need updating — update the steps,
  never the guarantees.

### 3.2 Data integrity — the spine of this product

This outranks any feature. REQ-1 and REQ-11 are why the product exists, and fabricated shopping data
was the user's original complaint.

- **Never fabricate a price, availability, discount, retailer, product, or URL.** Not as a
  placeholder, not as a fallback, not "just for the demo path".
- A product may be marked `verified` only if it was confirmed on the retailer's own product page,
  with a current price, at a recorded time. The mechanism is the citation gate in `server.mjs`
  (`resolveProductBatch`): only URLs the model actually cited are eligible, and they must also pass
  `isDirectProductUrl` and the retailer allowlist. **Do not remove or soften any of those checks.**
- `user-supplied` (photographed or typed by the shopper) is **never** `verified`.
- An unknown value stays absent. An unestablished dimension is reported as unknown, never guessed.
- When nothing can be verified, the honest outcome is an **empty plan with an explanation**. That is
  implemented and tested. Do not "improve" it by filling the gap.
- Seeded demo products (`src/enhancedData.ts` `seeds`, `src/data.ts` `catalog`, `alts()`) exist
  **only** for `?demo=` routes and e2e fixtures. A test pins that they cannot reach a live project.
  **This matters for finding F13 below — read that note carefully before concluding anything.**

### 3.3 Git hygiene

- Branch off trunk. Merge back with `--no-ff`. Small, single-purpose commits.
- Commit bodies explain *why* and name the REQ or finding ID.
- Never `push --force`. Never commit `.env`, `storage/`, `dist/`, `.test-dist/`, screenshots, or any
  key. `.gitignore` covers these — verify before every commit anyway.
- Visual baseline regeneration goes in **its own commit**, separate from logic.
- End commit messages with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

### 3.4 Code standards

- **Most source files are minified onto very long single lines.** Pre-existing. Match the surrounding
  density when editing them and **do not reformat or reflow a minified line** — a reflow is a
  whole-file diff that destroys reviewability. New files may be normally formatted; `src/budget.ts`,
  `src/constraints.ts`, `src/projectStore.ts`, `src/PlanScreens.tsx`, `src/ShopScreens.tsx` all are.
- TypeScript `strict` **and** `noUncheckedIndexedAccess` are on. Keep them on.
- **Business rules live in the domain layer, not in components.** Screens call `budgetSummary`,
  `priceMovement`, `canModifyItem`. No money maths or policy inside a component — that is how every
  surface stays consistent. Several §6 findings are about numbers disagreeing between screens; fix
  those in the domain, not per-screen.
- Comment the *why*, especially for anything that looks odd. Several non-obvious constraints are
  documented in-line precisely so nobody "simplifies" them back into bugs.
- Accessibility is load-bearing for the e2e suite: 44 px touch targets, `accessibilityRole` /
  `accessibilityLabel` / `accessibilityState` on every control, reduced-motion support. Journeys
  locate elements by accessible name — if you rename a button, update its journey.
- Keep user-facing copy plain and honest. When the app is uncertain, it says so.

### 3.5 Verify against reality; do not assume

This habit produced most of the value in the previous phase. Repeatedly the assumption was wrong and
one cheap probe settled it: model capabilities were probed live before four call sites were rewired
(two did not support the new model at all); multi-image rendering was tested against a real
three-photo scan; the storage ceiling was measured and turned out to be a blocker; the e2e baseline
was measured on the untouched tag before anything was blamed on new work.

If you are about to build on "it probably works this way", spend the ten minutes.

---

## 4. Architecture

```
App.tsx  (re-export only)
  └── src/RoomMuseApp.tsx        router, orchestration, all cross-screen state
        ├── src/EnhancedScreens.tsx  capture, comparison slider, shopping, product, alternatives, refine
        ├── src/ProjectScreens.tsx   project hub, budget tiers, progress, deals
        ├── src/PlanScreens.tsx      budget setup, project library, price refresh
        ├── src/ShopScreens.tsx      constraints, in-store find, compare/favourites
        ├── src/domain.ts            pure rules: totals, normalize, lifecycle, substitution, comparison
        ├── src/budget.ts            projected spend, variance, cost drivers, substitutions
        ├── src/constraints.ts       the keep-this guard
        ├── src/projectStore.ts      multi-project list/open/delete/status
        ├── src/persistence.ts       AsyncStorage v3 + migration + server sync
        └── src/designService.ts ──► server/server.mjs
```

### Server endpoints (`server/server.mjs`, ~900 lines)

| Endpoint | Purpose | Typical time |
|---|---|---|
| `GET /health` | `{ok, ai}` — `ai:true` means the key loaded | — |
| `POST /api/design` | analysis + 3 renders; accepts `budget`, `constraints`, `retainedItems`, `roomDimensions` | ~67 s |
| `POST /api/shopping-plan` | resolve products for **one chosen variation**, budget- and constraint-aware | ~60 s |
| `POST /api/prices/refresh` | re-check the same product pages; **409 for completed projects** | ~30 s |
| `POST /api/identify-product` | vision analysis of a product photographed in store | ~10 s |
| `POST /api/refine` | regenerate one concept image from instructions | ~35 s |
| `GET /designs/:file` | serves generated images | — |
| `GET\|PUT /api/projects/:id` | optional server-side project sync | — |

### AI models — verified live; re-probe before changing

| Role | Model | Notes |
|---|---|---|
| Room analysis, concept brief, product parse | `gpt-5.6-luna` | `/v1/responses` + strict `json_schema` |
| Live product search | `gpt-5.6-luna` | `/v1/responses` + `tools:[{type:"web_search"}]` |
| Room render | **`gpt-image-2`** | `/v1/images/edits`. **Text models are rejected here** |

Overridable via `OPENAI_TEXT_MODEL`, `OPENAI_ANALYSIS_MODEL`, `OPENAI_PRODUCT_SEARCH_MODEL`,
`OPENAI_PRODUCT_PARSE_MODEL`, `OPENAI_IMAGE_MODEL`. `web_search_options` on `chat/completions` is
**not** supported by this model — the Responses `web_search` tool is the working path.

### Non-obvious facts that will bite you

1. **Multi-image render requires repeated `image[]`.** Repeating `image` returns
   `400 duplicate_parameter`. The **first image is the base** and sets camera and framing; the rest
   are references, and the prompt must explicitly say they show the same space from other angles or
   they barely influence the result.
2. **`normalizeProject` builds an explicit object and does not spread.** Any field added to
   `Project` must be added there too or it is silently erased on every save/reload. A test guards
   this — do not delete it. **This will catch you when you add branding or new state.**
3. **`save()` in `RoomMuseApp` is debounced (180 ms).** Never read state straight after calling it;
   pass the updated project through explicitly. This already caused a real bug where the budget
   never reached the server.
4. **Price history is append-only and unions across sync replicas.** Last-write-wins loses
   observations. Constraint releases always beat an active row in a merge.
5. **The client and server each hold a copy of the retailer URL pattern table**
   (`src/productLinks.ts` and `server.mjs`) because a Node server and an Expo app cannot share a
   module here. A test asserts they stay identical.
6. **Library projects store photos by reference**, not inline base64 — 825 KB versus 33 KB per
   project, and eight rooms would breach Android's ~6 MB AsyncStorage ceiling. A photo with **no**
   server-side copy is never stripped.
7. **`Alert.alert` on react-native-web** behaves differently from device. If you add confirmations,
   check the journeys still pass.

---

## 5. Requirement status inherited

| REQ | Status |
|---|---|
| 1 Dynamic real products | Done, verified live — 9/9 items with direct product URLs |
| 2 Budget intelligence | Done at engine level; **UX incomplete — see F9, F10** |
| 3 In-store substitution | Done — identify, preview effect, apply, reversible |
| 4 Room photos | Done — all three reach the render |
| 5 Three variations | Done — distinct images *and* distinct plans |
| 6 Saveable projects | Done at engine level; **recall incomplete — see F18** |
| 7 Lifecycle | Done — refresh, price history, frozen snapshots |
| 8 Design rationale | **PARTIAL** — templated; see G3 |
| 9 Favorites / comparison | Done |
| 10 Constraints | Done — enforced by a guard, deliberate recorded release |
| 11 Live data integrity | Done — provenance throughout |
| 12 Reuse existing AI | Done — extended, never replaced |
| 13 Regression coverage | Mostly — 70 unit + 15 e2e; visual baselines stale |

---

## 6. User test findings — your primary input

Verbatim findings from a real iPhone session, grouped and ID'd. **Triage these against the codebase
before planning: some are bugs, some are flow changes, and at least one may not be what it looks
like.** Confirm each against the code rather than assuming the diagnosis.

### Branding (new requirement, not in the original REQ document)

- **F1 — Rename to "Tracy's Room Muse".** **User interfaces only.** Do not change package names,
  storage keys, API paths, repo name, log strings, or any technical identifier. Storage keys in
  particular (`roommuse.project.v3`, `roommuse.projects.v3`) must not change or saved projects are
  lost.
- **F2 — Red accents.** Tracy's favourite colour is red. "Splashed" thoughtfully on strategic parts,
  *not* everywhere, preserving elegance and sophistication. The existing palette is forest green
  `#244C3B`, clay `#B87958`, paper `#FCFBF7`, ink `#17211B`. Note red currently signals *errors and
  destructive actions* (`#963C33` warn, delete, over-budget) — resolve that collision deliberately
  so a decorative red never reads as a warning.

### Bugs

- **F3 — "Allow Camera" button on the Camera Access page does nothing.** "Choose a photo or video
  instead" works (offers Drive / Files / Take Photo / Photo Library). User asks whether Allow Camera
  is a one-time setup action and whether it is needed at all. Relevant code: `allowCamera` in
  `src/EnhancedScreens.tsx`. Note the previous phase found this *not* reproducible and left it
  uncoded — it is now reproduced, so investigate properly.
- **F4 — Share on the "Your Concepts" page does nothing.** `shareProject` / `safeShare` in
  `EnhancedScreens.tsx`.
- **F5 — Share icon (top right) on the Shopping Plan page does nothing.** Same helpers.
- **F6 — "Remaining to purchase" does not update on quantity change**, though "Estimated total"
  does. Should update unless already purchased. This is a domain-layer inconsistency, not a
  rendering one — fix in `domain.ts`/`budget.ts` so every screen agrees.
- **F7 — Back buttons feel random.** Pages reached by Back seem arbitrary. The route map is
  `previous` in `src/RoomMuseApp.tsx`; it was extended several times and needs a coherent pass.

### Flow and UX

- **F8 — "Save as selected design" appears too early** on Your Concepts. The user can still change
  the design further down the same page, so the button should come after review and changes.
- **F9 — "Review before & after" at the page end is redundant.** It only scrolls back to the same
  comparison already seen mid-page. Its one useful effect is flipping the CTA to "Approve final
  design". Since review and changes already happen above, the button should just be **"Approve final
  design"**.
- **F10 — Budget page is read-only in practice.** Good information, but no way to *react* to it. The
  user should be able to modify the budget amount **and/or the items** and see the budget update in
  real time.
- **F11 — No "Enter" affordance on the numeric keyboard** when entering a budget; only a key that
  hides the keyboard. Not intuitive. Pairs with F10 — the user wants to enter a lower figure, read
  "what's driving the cost", then adjust money or purchases.
- **F12 — Priority filter (All / Essential / …) should update the totals.** Estimated total and
  remaining should reflect the current filter, so the user can make decisions per priority band.
- **F16 — No "Finish" button on the Shopping Plan page.** The user must press Back to reach the
  summary page, which is unintuitive. Add an explicit Finish that goes to the summary; Back should
  go back.
- **F19 — After finishing a project, offer a way home** to start a new one.

### Data and behaviour

- **F13 — "The Shopping plan seemed quite different from my style and budget. Is this still
  placeholder/seed data?"**
  **Important context before you diagnose:** seeded data was removed from every production path in
  the previous phase and a test pins that it cannot reach a live project, so this is *probably not*
  seed data. More likely candidates: the user skipped the budget step ("Skip for now"), the plan was
  built before the budget was entered, the concept brief drifted from the chosen variation, or the
  product search returned poorly matched items. **Reproduce first, then diagnose.** Whatever the
  cause, the requirement is unambiguous — REQ-1: the plan must reflect the exact choices made.
- **F17 — "Check shopping deals" must update the plan.** When a better price is found for an item
  not yet purchased, the shopping list should take the new price and the remaining-to-purchase
  figure on the summary must change. The user also asks that price changes be *stored* — note
  `Item.priceHistory` already exists and does exactly this; wire the deals flow into it rather than
  building something parallel.
- **F18 — The app should let the user recall anything saved** — projects, images, and so on. A
  project library exists (`projectStore.ts`, `ProjectLibraryScreen`); this finding suggests it is
  either not discoverable enough or not complete. Check what is actually recoverable.

### Performance — the user raised this three times

- **F14 — "Matching Real products" stage takes ~40 s** (during concept generation).
- **F15 — "Finding real products" takes ~1 min 40 s** (the shopping plan build). *Longer than the
  ~60 s measured in testing — investigate the difference.*
- **F20 — Refine/regenerate takes ~35 s.**

No agreed target exists. Ask the user what "fast enough" means before optimising. Note that a live
web search over multiple retailers has a floor; some of this may be better addressed by making the
wait *informative* rather than shorter. Both are legitimate — get direction first.

### Distribution

- **F21 — External testers must be able to test from their phones.** Currently LAN-only via Expo Go
  on the same Wi-Fi. This needs a real decision (Expo tunnel, EAS build, TestFlight) and has
  security implications: **the server currently has no authentication and the API key lives on it.**
  Do not expose it to the internet without addressing that. Raise it with the user explicitly.

---

## 7. Other known gaps

- **G2 — Visual baselines are stale.** `e2e/visual.spec.ts-snapshots/` holds 60 approved screenshots
  across 6 viewports, taken before the UI changed. `npm run test:visual` will fail. Review diff by
  diff, confirm each change is intended, regenerate **in its own commit**. The state list in
  `visual.spec.ts` also does not yet include the newer screens (budget, library, refresh,
  constraints, field, compare). **Do this after the F1/F2 branding work**, not before, or you will
  regenerate twice.
- **G3 — REQ-8 rationale is templated.** `buildDesignReport` assembles prose from the room analysis
  with the concept name substituted in. Grounded and honest, but REQ-8 asks for explanations tied to
  the *specific products chosen* and their relationships. REQ-8 also warns against generic design
  prose, so keep it concise.
- **G4 — Two budget screens overlap.** The numeric `BudgetSetupScreen` (`PlanScreens.tsx`) and the
  older qualitative tier `BudgetScreen` (`ProjectScreens.tsx`, save/balanced/invest) both exist and
  are both reachable. Intent: tiers become the *substitution strategy* inside the numeric budget.
  **This overlaps with F10** — solve them together.
- **G6 — Retailer allowlist is 11 domains** (`retailerDomains` in `server.mjs`). May starve some
  categories, and is a plausible contributor to F13. Widen deliberately, keep the direct-product-URL
  rule intact, add test cases for any new pattern.
- **G7 — `roomPlan` fallback is keyword-based**, used only when analysis returns no items. Already
  fixed once for open-plan rooms matching the wrong zone; still a heuristic.
- **G8 — Server-side project sync is untested at scale**, and `deleteProject` deliberately leaves
  the server copy. Revisit if sync becomes important.

---

## 8. Running it

```bash
powershell -ExecutionPolicy Bypass -File "C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse\scripts\start-roommuse.ps1"
```

Starts the API and Expo, derives the LAN URL from the Wi-Fi address, and prints the `exp://` link for
Expo Go. `.env` holds `OPENAI_API_KEY` and is gitignored — **never** commit it or echo its contents.
Confirm `GET /health` returns `{"ok":true,"ai":true}` before blaming the app for missing products.

Tests: `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm run test:visual`.

Real room photos for spikes: `C:\Data\LocalNettCreative\RoomMuse Information\spike-room-photos\` —
an open-plan living room with an adjoining office. A deliberately hard case that has already caught
two bugs a simple room would not have. **It is also the room the user tested with**, so it is the
right fixture for reproducing F13.

---

## 9. How to work

1. **Plan before building.** Inspect first, map findings to code with file:line evidence, record
   uncertainty as an open question rather than guessing. Do not invent facts about the repository.
2. **Reproduce before diagnosing.** Several findings above come with a suspected cause. Confirm it.
   F13 in particular has a tempting wrong answer.
3. **Sequence deliberately.** Branding (F1/F2) touches nearly every screen and will invalidate visual
   baselines, so land it before G2. Flow changes (F8, F9, F16, F19, F7) will change e2e journeys —
   group them. Domain fixes (F6, F12) should land before the screens that display them.
4. **Update `COORDINATION.md` as you go** — decisions, measured findings, blockers, test status. The
   next agent will depend on it exactly as you depend on it now.
5. **Diagnose before rewriting.** Nearly every problem here turned out to be a small root cause in
   otherwise sound code. The live product search, the citation gate, the accessibility work, the
   three-variation render, the conflict resolution — all were already good and were preserved.
   Prefer: understand → diagnose → repair → extend → refactor only where justified.
6. **Report honestly.** If something is partly done, say so and why. If a test fails, show the
   output. The user has consistently been given the unvarnished state and has made good decisions
   with it.
