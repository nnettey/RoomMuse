# Room Muse v2 — Implementation Plan

Source of truth for functionality: `RoomMuse Information/Room Muse - Product Requirements.md` (referred to below as REQ-n).
Supplementary user-reported defects: `RoomMuse Information/RM Notes 1.md` (RM-n), `RM_error.PNG`.

This plan was written **after** inspecting the repository. Every claim below cites a file/line. Items I could not
verify are listed explicitly in §10 as open questions rather than asserted.

---

## 1. Current-state findings

### 1.1 Repository and Git state

- Repo root: `C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse` (the outer `Claude_RoomMuse` folder is **not** a repo).
- Branch: `codex/sibling-roommuse-preservation`, in sync with `origin/codex/sibling-roommuse-preservation`.
  There is no `main`/`master`; this branch is effectively trunk.
- Working tree clean. No stashes. 3 commits total (`2379fb2`, `a56fafd`, `4b82378`).
- Remote: `https://github.com/nnettey/RoomMuse.git`.
- Baseline health (measured, not assumed): `npm run typecheck` → clean. `npm run test:unit` → 11/11 pass
  (domain + integration). `test:e2e` / `test:visual` not run in this session (require `expo export` + Python http server).

### 1.2 Architecture as built

Expo / React Native 0.81 + react-native-web, TypeScript strict, single local Node HTTP server (no framework, no DB).

```
App.tsx ──(re-export only)──► src/RoomMuseApp.tsx      ← the live app (router + orchestration)
                                   ├── src/EnhancedScreens.tsx  (capture, comparison, shopping, product, alternatives, refine)
                                   ├── src/ProjectScreens.tsx   (hub, budget tiers, field find, progress, deals)
                                   ├── src/domain.ts            (pure logic: totals, normalize, budget, conflict merge)
                                   ├── src/persistence.ts       (AsyncStorage v2 + optional server sync)
                                   └── src/designService.ts ──► server/server.mjs
```

`server/server.mjs` (560 lines) exposes: `GET /health`, `POST /api/design`, `POST /api/refine`,
`GET /designs/:file`, `GET|PUT /api/projects/:id`.

### 1.3 Existing AI/LLM integration (REQ-12 — investigated, to be reused)

All OpenAI, key held **server-side only** (the device never sees it). Four distinct calls:

| Purpose | Model (env-overridable) | Endpoint | Location |
|---|---|---|---|
| Room understanding + item brief | `OPENAI_ANALYSIS_MODEL` → `gpt-4.1-mini` | `/v1/responses`, strict `json_schema` | `server.mjs:335-403` |
| Room render (×3 concepts) | `gpt-image-2` (hardcoded) | `/v1/images/edits` | `server.mjs:285-322` |
| Live product search | `OPENAI_PRODUCT_SEARCH_MODEL` → `gpt-4o-mini-search-preview` with `web_search_options` | `/v1/chat/completions` | `server.mjs:141-151` |
| Citation-constrained parse | `OPENAI_PRODUCT_PARSE_MODEL` → `gpt-4.1-mini` | `/v1/responses`, strict `json_schema` | `server.mjs:160-169` |

**Browsing/search already exists and is well-guarded.** Products are only accepted when the URL appears in the
search response's `url_citation` annotations (`server.mjs:154-159`), passes `isDirectProductUrl`
(`server.mjs:45-70`, mirrored client-side in `src/productLinks.ts`), belongs to an 11-domain retailer allowlist
(`server.mjs:78-102`), and carries a finite positive USD price (`server.mjs:175-181`). Retries: analysis ×2,
render ×3 with backoff, product batches of 2 with per-item retry. Timeouts: 150s render, 60s analysis, 30s search.

**This subsystem is the most valuable asset in the repo and must be preserved and extended, not replaced.**

### 1.4 Confirmed defects (root causes, not symptoms)

**D1 — P0 native crash on launch.** `src/RoomMuseApp.tsx:20`:
```ts
const mode = typeof window!=="undefined" ? new URLSearchParams(window.location.search).get("demo") : null;
```
In React Native `window` *is* defined but `window.location` is not, so `.search` throws. This exactly matches
`RM_error.PNG` ("Render Error — Cannot read property 'search' of undefined", top frame `App` in `RoomMuseApp.tsx`).
The same `typeof window!=="undefined"` pattern in `assetUrl.ts:1`, `designService.ts:4`, `persistence.ts:7` is
short-circuited by `process.env.EXPO_PUBLIC_API_URL ?? …`, so it only crashes when that env var is unset —
`RoomMuseApp.tsx:20` has no such guard and crashes unconditionally on device.

**D2 — Hardcoded shopping list (REQ-1, RM-3).** Two seed catalogs exist:
`src/enhancedData.ts:5-14` (`seeds`, 8 items) and `src/data.ts:19-28` (`catalog`, the same 8 items).
Every one of their `purchaseUrl`s is a **search page**, not a product page
(`homedepot.com/s/…`, `westelm.com/search/results.html?words=…`, `cb2.com/search?query=…`, …) — which is
also RM-2 ("links must go directly to the product"). `src/enhancedData.ts:15` (`alts()`) fabricates three
alternatives per item with invented prices (`p-120`, `p+40`, `p+90`) and more search URLs.
They reach production because `domain.ts:26` **always** builds demo concepts first
(`const cs = demoConcepts(style, …)`) and only overwrites `cs[0].shoppingItems` when the server returned a
non-empty list (`domain.ts:33`). Any server failure, missing API key, or empty product match silently falls back
to seeded fiction presented as real recommendations.

**D3 — Three variations are not genuinely different (REQ-5).** The server *does* render three distinct images with
three different direction prompts (`server.mjs:287-291`, `524`). The sameness comes from three other places:
1. `domain.ts:38` copies **the same** `legacy.shoppingItems` array into every variant → one shopping plan for all three.
2. `buildDesignReport` (`server.mjs:405-422`) differs between concepts only by substituting the concept name into
   two sentences; layout/materials/lighting/priorities text is identical.
3. On a secondary render failure the variant is given the *Signature* image (`server.mjs:540`), so it looks like a clone.
The existing names and semantics to preserve are **Signature / Refined / Expressive**
(`enhancedTypes.ts:2`, `enhancedData.ts:4`, `server.mjs:287-291`, `522`).

**D4 — Third and second photos never reach the render (REQ-4).** Capture collects 3
(`EnhancedScreens.tsx:60`), `designService.ts:20` posts `imageBase64s`, and `analyzeRoom` **does** consume all of
them as extra `input_image` parts (`server.mjs:376-380, 523`). But `renderRoom` receives only `scans[0]`
(`server.mjs:515-516, 524`). So photos 2–3 influence the written analysis and item brief but never the image.
The "Choose a photo or video instead" path (`EnhancedScreens.tsx:95`) short-circuits to a single asset.

**D5 — Multiple saved projects are implemented but unreachable (REQ-6).** `persistence.ts:50-51` has
`loadProjects()` / `saveToLibrary()` backed by the `roommuse.projects.v1` key, but `RoomMuseApp.tsx:4` imports only
`loadProject` and `saveToLibrary`; nothing ever calls `loadProjects`, and there is no project-list screen.
The app can hold exactly one active project.

**D6 — No budget target exists (REQ-2).** `Project.budgetTier` is a qualitative enum `save|balanced|invest`
(`enhancedTypes.ts:13`) applied *after* generation by `applyBudget` (`domain.ts:75`). There is no numeric budget
anywhere: not in the type, not in the UI, not in the `/api/design` request (`designService.ts:20` sends only
`imageBase64s` + `style`), not in the product-search prompt (`server.mjs:148`).

**D7 — Field find does nothing (REQ-3).** `FieldScreen` (`ProjectScreens.tsx:15`) takes a photo and notes, then
emits a fixed template string (`"This can work if its scale and finish repeat the … palette"`) — no vision call,
no target item selection, no substitution, no totals or budget effect. `FieldFind.targetItemId`
(`enhancedTypes.ts:14`) exists in the type and is never set.

**D8 — Constraints are ephemeral (REQ-10).** The only constraint mechanism is four hardcoded toggles in
`RefineScreen` (`EnhancedScreens.tsx:150`) mapped to `ShoppingDecision` (`domain.ts:45`), applied once by
`refineConcept` (`domain.ts:46-53`) and then forgotten. They are not persisted as constraints, never sent to
`/api/design`, and a later `applyBudget` or `swapItem` will silently overwrite a "keep my sofa" decision.

**D9 — No lifecycle, refresh, or price history (REQ-7, REQ-11).** `Project` has no status field. Nothing re-checks
prices. `DealsScreen` (`ProjectScreens.tsx:17`) only re-reads alternatives captured at generation time —
correctly labelled, but it is not a refresh.

**D10 — Text encoding corruption.** Replacement characters (U+FFFD) are committed in
`ProjectScreens.tsx:11` (the back chevron renders as `�`), `:13` (`SAVED DECOR �`), `:14` (`? Applied to shopping
list`), `:16` (`You�re`), and `App.tsx:122` (`AFTER �`).

**D11 — ~700 lines of dead code.** `App.tsx` defines a complete second UI (`Home`, `Capture`, `StylePicker`,
`Generating`, `Result`, `Shopping`, `AppContent`, and a 100-property stylesheet) that is never rendered, because
line 138 is `export { default } from "./src/RoomMuseApp";`. It is a live source of confusion and duplicate-edit risk.

**D12 — Port/URL default mismatch.** `designService.ts:5`, `persistence.ts:7`, `assetUrl.ts:1` all default to
port **8787**; the server listens on **3201** (`server.mjs:17`). `scripts/start-roommuse.ps1` never exports
`EXPO_PUBLIC_API_URL`, so anything not covered by a hand-written `.env` silently talks to a dead port.

**D13 — Generation latency (RM-2).** `/api/design` blocks until analysis + **three** 150s-budget renders + the full
product search have all completed (`server.mjs:523-526`). The renders are parallel, but products are chained behind
analysis, and nothing is returned until the slowest branch finishes.

**D14 — Camera permission (RM-1).** `allowCamera` (`EnhancedScreens.tsx:56-59`) is implemented correctly, including
the `canAskAgain === false` settings deep-link. The README (line 35) already documents that mobile browsers block
camera on plain-HTTP LAN pages, and `scripts/serve_https.py` exists. **Most likely an HTTPS/origin problem, not a
code defect** — must be reproduced before any code is changed.

### 1.5 What already works and must be preserved

Citation-gated live product search; `isDirectProductUrl` allowlisting; `priceStatus` verified/estimate labelling
and the disabled "Exact product currently unavailable" buy button (`EnhancedScreens.tsx:135`); three-image render;
before/after comparison with keyboard + screen-reader affordances; in-app back navigation for Android hardware back
and web popstate (`RoomMuseApp.tsx:24-38` — RM-5 is already addressed); undo; conflict-aware project sync;
`ResilientImage` retry; the 8-stage progress view; 60 approved visual baselines; typed analytics.

---

## 2. Requirement → code map

| REQ | Where it lives today | State | Workstream |
|---|---|---|---|
| 1 Dynamic real products | `server.mjs:103-257` (good) vs `enhancedData.ts:5-15`, `data.ts:19-28`, `domain.ts:26-33` (seeds leak) | Partly built, corrupted by fallback | WS-2, WS-3 |
| 2 Budget intelligence | `enhancedTypes.ts:13`, `domain.ts:75`, `ProjectScreens.tsx:14` | Qualitative tiers only; no numeric budget | WS-1, WS-3, WS-2, WS-5 |
| 3 In-store substitution | `ProjectScreens.tsx:15`, `enhancedTypes.ts:14` | Shell only | WS-2, WS-3, WS-5 |
| 4 Room photos | `EnhancedScreens.tsx:60,95`, `server.mjs:511-524` | Analysis uses 3, render uses 1 | S-1 spike → WS-2/WS-5 |
| 5 Three variations | `server.mjs:285-322,405-422,532-541`, `domain.ts:34-40` | Images differ; plans/reports do not | WS-2, WS-3 |
| 6 Saveable projects | `persistence.ts:50-51` | Storage exists, no UI, not wired | WS-4, WS-5 |
| 7 Lifecycle + refresh | — | Absent | WS-1, WS-2, WS-3, WS-4, WS-5 |
| 8 Design rationale | `server.mjs:405-422`, `RoomMuseApp.tsx:15`, `EnhancedScreens.tsx:138` | Present but templated/generic | WS-2 |
| 9 Favorites / comparison | `EnhancedScreens.tsx:105` (before/after only) | Absent for products | WS-1, WS-3, WS-5 |
| 10 Constraints | `EnhancedScreens.tsx:150`, `domain.ts:45-53` | Ephemeral, overridable | WS-1, WS-2, WS-3, WS-5 |
| 11 Live data integrity | `productLinks.ts`, `server.mjs:45-70,154-181` | Strong core, undermined by seeds | WS-1, WS-2, WS-3 |
| 12 Existing AI integration | §1.3 | Reuse and extend | WS-2 |
| 13 Regression coverage | `tests/`, `e2e/` | 11 unit + 12 journeys + 60 visual, green | WS-6 |
| RM-1 camera | `EnhancedScreens.tsx:56-59` | Reproduce first (D14) | WS-0 |
| RM-2 latency | `server.mjs:523-526` | Architectural (D13) | WS-2 |
| RM-2b direct links | `productLinks.ts` ✔ / seeds ✘ | Fixed by removing seeds | WS-3 |
| RM-4 video | `EnhancedScreens.tsx:68-94` | Implemented; verify on device | WS-0 |
| RM-5 back nav | `RoomMuseApp.tsx:24-38` | Already implemented; verify | WS-0 |

---

## 3. Architecture and implementation approach

Guiding rule from REQ-14: understand → diagnose → repair → extend → refactor only where justified.
Six decisions, each with its rationale:

**A1 — Keep the OpenAI pipeline exactly as it is; extend its inputs.** No provider change, no parallel
architecture. `/api/design` gains additive optional request fields (`budget`, `constraints`, `roomDimensions`,
`retainedItems`); the existing `{imageBase64, style}` shape keeps working, honouring `docs/CURRENT_CONTRACTS.md`.

**A2 — Split product resolution out of `/api/design` into `POST /api/shopping-plan`.**
This one change resolves four requirements at once:
- REQ-5: the plan can be generated **for the chosen variation**, with concept-specific specs, so the three
  concepts stop sharing one list.
- REQ-2: the budget is known by then, so the search prompt can be budget-aware instead of post-hoc filtered.
- REQ-10: constraints are known and injected.
- RM-2/D13: `/api/design` no longer blocks on the search, cutting perceived generation time substantially.
REQ-5 explicitly states the user selects one variation before proceeding, so this matches the intended flow.

**A3 — Seeded data becomes demo-only, never a production fallback.** `demoConcepts` is gated behind an explicit
demo flag. When the server cannot verify products, the UI shows an explicit unresolved state
("No verified product found for this role — retry or enter one yourself") instead of inventing one. `data.ts`
`catalog` and `enhancedData.ts` `seeds`/`alts` stay in the tree because `?demo=` routes and the Playwright
journeys depend on their exact strings — they must remain reachable **only** through `?demo=`/test fixtures.

**A4 — Introduce explicit provenance, replacing the binary `priceStatus`.** New `Item.provenance`:
`generated | discovered | verified | cached | historical | user-supplied`, plus an append-only
`Item.priceHistory: PriceObservation[]`. `priceStatus` is retained as a derived alias so existing UI and tests
keep working. This is REQ-11's required distinction and is the substrate for REQ-7's refresh/history.

**A5 — Constraints become first-class and enforced.** `Project.constraints: Constraint[]` (persisted, with
`createdAt`, `scope`, `releasedAt`). Injected into the analysis prompt, the render prompt, and the shopping brief.
Enforced in `domain.ts` by a guard: a constrained item cannot be swapped, removed, or re-tiered by `applyBudget`
without an explicit release action. This is REQ-10's "a later action must not casually override a constraint".

**A6 — Lifecycle governs refreshability.** `Project.status: "in-progress" | "complete"` with `completedAt`.
`POST /api/prices/refresh` re-verifies items for in-progress projects only and appends observations rather than
overwriting. Completed projects are frozen snapshots; the refresh path refuses them server-side *and* client-side.

**S-1 — Multi-image render is a time-boxed spike, not an assumption.** Whether `/v1/images/edits` with
`gpt-image-2` accepts and usefully fuses multiple input images without destroying room geometry is **unverified**.
The spike (≤1 day, first task in WS-2) tries multi-image edit against a real 3-photo scan and records a decision
in `COORDINATION.md`. Outcomes:
- *(a) works* → send all three to the render; keep the 3-photo flow.
- *(b) does not work* → keep 3 photos feeding analysis (which demonstrably works and is already a material
  contribution), and **tell the user plainly** which single photo drives the rendered image, with capture guidance
  for that hero shot.
- *(c) analysis gain also unconvincing* → switch the flow to REQ-4's sanctioned fallback: request **one excellent
  photograph**, with explicit guidance.
REQ-4 forbids only one thing — asking for three and silently ignoring two. All three outcomes satisfy it.

---

## 4. Work breakdown

| WS | Scope | Exclusive file ownership |
|---|---|---|
| **WS-0** Stabilize | D1 native crash, D10 encoding, D11 dead code removal, D12 port defaults, reproduce RM-1/RM-4/RM-5 on device | `App.tsx`, `src/RoomMuseApp.tsx` (line-20 fix only), `scripts/start-roommuse.ps1`, `README.md` |
| **WS-1** Contracts | Freeze the v2 data model + API contract. Types + docs only, **no behaviour** | `src/enhancedTypes.ts`, `docs/CONTRACTS_V2.md` |
| **WS-2** Server / AI | S-1 spike; `/api/shopping-plan`; budget+constraint-aware search; per-concept specs; differentiated reports; `/api/prices/refresh`; `/api/identify-product`; latency | `server/server.mjs` |
| **WS-3** Domain | Budget math + variance + category rollup; constraint guard; price-history merge; substitution/addition merge; favorites/compare selectors; status transitions; kill seed fallback | `src/domain.ts`, `src/budget.ts`(new), `src/constraints.ts`(new), `src/productLinks.ts`, `tests/domain.test.ts` |
| **WS-4** Persistence | Multi-project store, status-aware load/save, migration from v2 → v3, server project sync for new fields | `src/persistence.ts`, `src/projectStore.ts`(new) |
| **WS-5** UI | Budget entry + variance display; constraints screen; project library; favorites/compare; field-find substitution flow; price-change display; unresolved-product state | `src/RoomMuseApp.tsx`, `src/EnhancedScreens.tsx`, `src/ProjectScreens.tsx`, new `src/*Screen.tsx` |
| **WS-6** Integration | Cross-WS wiring, e2e extension, visual re-baseline, live smoke test with a real key, final report | `e2e/**`, `tests/integration.test.ts`, `playwright.config.ts`, `docs/IMPLEMENTATION_REPORT.md` |

### 4.1 Dependency graph

```
WS-0 ──┐                        (independent, ship first — unblocks device testing)
       │
WS-1 ──┼──► WS-2 ──┐
       ├──► WS-3 ──┼──► WS-5 ──► WS-6
       └──► WS-4 ──┘
```
- WS-0 and WS-1 touch disjoint files and may run concurrently.
- WS-2, WS-3, WS-4 are fully parallel once WS-1's types are frozen.
- WS-5 needs WS-3's selectors and WS-4's store; it can start against WS-1's types with local stubs and integrate as
  they land.
- WS-6 is last and owns all baseline changes.

### 4.2 Why this shape, and not a bigger fan-out

**The source files are minified onto very long single lines** (`RoomMuseApp.tsx` is 41 lines for ~26 KB;
`domain.ts` packs whole functions per line). Git merges line-by-line, so two agents editing the same file produce
conflicts that are effectively unresolvable without manual re-authoring. Exclusive per-file ownership is therefore
not a stylistic preference here, it is a hard correctness constraint, and it caps useful parallelism at roughly the
four lanes above. A larger fan-out would spend more time in conflict resolution than it saves.

### 4.3 Sequencing (suggested)

1. WS-0 + WS-1 (parallel) → merge → tag.
2. S-1 spike; record decision. This gates part of WS-2 and WS-5's capture copy.
3. WS-2 + WS-3 + WS-4 (parallel).
4. WS-5.
5. WS-6.

---

## 5. Git and integration strategy

- Tag the known-good baseline before anything changes: `git tag baseline/pre-v2 2379fb2` — the rollback point.
- Integration branch `roommuse-v2/integration`, cut from `codex/sibling-roommuse-preservation`.
  **Nothing merges into `codex/sibling-roommuse-preservation` until WS-6 is green.**
- One branch per workstream off the integration branch: `ws/0-stabilize`, `ws/1-contracts`, … If workstreams run as
  separate Claude sessions, use `git worktree` so each has its own checkout and no shared index.
- Rebase onto integration immediately before opening a merge; merge with `--no-ff` so each workstream is a
  revertable unit.
- Commits: small, single-purpose, imperative subject, body naming the REQ/defect ID. No unrelated reformatting —
  reflowing a minified line is a whole-file diff and is forbidden outside the file's owner.
- Never `push --force`. Never commit `.env`, `storage/`, `dist/`, `.test-dist/`, screenshots, or API keys
  (`.gitignore` already covers these — verify before every commit).
- Visual baseline changes go in their own commit, separate from logic, so review can see them.

---

## 6. Testing and regression strategy

**Baseline (measured this session — the bar nothing may fall below):** `typecheck` clean; `test:unit` 11/11 pass.
`test:e2e` and `test:visual` must be run and recorded by WS-0 before other work lands, so we know whether the
60 visual baselines are currently valid.

Per-workstream gates (all must pass before merge to integration):
```bash
npm run typecheck && npm run test:unit && npm run test:e2e
```

- **WS-3** carries the bulk of new unit tests: budget math and variance, over-budget driver identification,
  constraint guard rejection, price-history append/ordering, substitution and addition merges recomputing totals,
  status transition rules, seed-fallback removal.
- **WS-2** gets server tests against **recorded** OpenAI fixtures — no network in CI. A separate, explicitly
  manual `npm run test:live` exercises the real key for REQ-1/REQ-11 verification and is never part of the gate.
- **WS-6** extends the Playwright journeys to cover every item in REQ-13's list and re-baselines visuals.
- Error/timeout/partial-data scenarios (REQ-13's last bullet) are first-class tests, not an afterthought:
  search returns nothing, one variant render fails, refresh times out mid-project, project sync unavailable.

**Non-negotiable:** no test is deleted, skipped, or weakened to make a change pass (REQ-13). If a test blocks a
change, either the change is wrong or the requirement changed — and the second case gets recorded in
`COORDINATION.md` with the reasoning before the test is edited.

---

## 7. Coordination mechanism

`docs/plan/COORDINATION.md` is the single shared living document. Every implementation agent **must** read it
before starting and update it at every handoff. It carries: architecture decisions, workstream ownership and
status, active branches/worktrees, the file-ownership table (the anti-collision mechanism), interfaces and
contracts, decisions and assumptions, files materially changed, tests completed, integration status, handoff
notes, and unresolved issues.

Per-agent briefs live in `docs/plan/contracts/WS-*.md` — scope, files owned, prohibited changes, interfaces,
dependencies, test expectations, definition of done, and required handoff information.

---

## 8. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Minified single-line files make concurrent edits unmergeable | High | Exclusive file ownership; §4.2; rebase-before-merge |
| R2 | Multi-image render may be unsupported by `gpt-image-2` | Medium | S-1 spike with a documented decision gate and two sanctioned fallbacks (§3) |
| R3 | Per-concept product search triples OpenAI cost/latency | Medium | A2 — resolve products only for the **selected** variation; share results across identical roles |
| R4 | Live search returns nothing for a legitimate item | Medium | Explicit unresolved state (A3); never substitute a fabricated product; user can supply one via REQ-3 |
| R5 | Removing seeds breaks existing Playwright journeys that assert seeded names | Medium | Keep seeds reachable via `?demo=` only; WS-6 owns any journey updates |
| R6 | 60 visual baselines invalidate as UI grows | Low | Deliberate, separately-committed re-baseline in WS-6 |
| R7 | RM-1 camera may be an HTTPS/origin issue misread as a code bug | Medium | Reproduce before changing code (D14); `scripts/serve_https.py` already exists |
| R8 | Project payloads embed base64 images; the 50 MB cap and AsyncStorage limits are untested at 3 photos × N projects | Medium | WS-4 measures payload size and moves images to `/designs/`-style references if needed |
| R9 | Retailer allowlist of 11 domains may starve some categories | Low | Widen deliberately in WS-2, keeping the direct-product-URL rule intact |

## 9. Assumptions

1. `codex/sibling-roommuse-preservation` is the trunk; there is no protected `main` to respect.
2. OpenAI remains the provider and the user's key is available for live verification.
3. US/USD retail scope (`server.mjs:147` pins `country: "US"`; the product schema requires `currency: "USD"`).
4. Local-first storage (AsyncStorage + local JSON files) remains acceptable; no database is being introduced.
5. Expo Go remains the distribution channel for testing, so no native modules may be added.
6. "Three named variation types" in REQ-5 = **Signature / Refined / Expressive** (evidenced in §1.4-D3).

## 10. Open technical questions

1. **S-1:** Does `/v1/images/edits` with `gpt-image-2` accept multiple input images, and does it improve geometry
   fidelity? Unverified — blocks the REQ-4 decision.
2. **RM-1:** Is the camera failure HTTPS/origin-related or a code path? Not reproduced yet.
3. **Environment drift:** `RM_error.PNG`'s stack shows `C:\Users\nnett\OneDrive\…\roommuse\src\RoomMuseApp.tsx` —
   a *different* working copy from the one inspected here. Is the device running an older OneDrive checkout? If so,
   fixes made here may not appear on the phone. **This needs answering before any device-side verification.**
4. Is a numeric budget entered per project only, or also per category? Requirements say project-level; category
   information is "where appropriate" (REQ-2). Planned: project-level target + category rollup, no category caps.
5. What is the acceptable ceiling for concept-generation latency? RM-2 says "very long" without a number; A2 will
   improve it, but the target is undefined.
6. Should completed projects be reopenable to in-progress? REQ-7 does not say. Planned: yes, via an explicit
   deliberate action that starts a new refresh epoch and preserves the completion snapshot.

---

## 11. End-to-end acceptance checklist

Derived from REQ-13. Every line is verified on a real device or in an automated journey before the work is called done.

- [ ] Create a new project; it appears in the project library
- [ ] Image intake: 3 photos, single photo, and video-frame paths all produce a usable scan
- [ ] Multi-image behaviour matches the S-1 decision, and the UI's promise matches what the pipeline actually uses
- [ ] Style selection persists through navigation
- [ ] Three variations differ visibly in image, report, **and** shopping plan
- [ ] Variation selection gates the shopping plan
- [ ] Numeric budget can be set; projected spend, remaining, and variance are correct and update on every change
- [ ] Over-budget projects explain their cost drivers and offer substitutions that hold the design intent
- [ ] Shopping results are specific to room, style, variation, budget, and constraints — no seeded item ever appears outside `?demo=`
- [ ] Every purchasable link resolves to a specific product page; unresolved items say so instead of inventing one
- [ ] Price and availability carry an observation timestamp and provenance
- [ ] Photograph a product in-store → replace a named planned item → design, plan, totals, and budget all update and persist
- [ ] Photograph a product → add it as a new item → same updates
- [ ] Constraints ("keep my sofa", "don't repaint") influence generation and recommendations and cannot be silently overridden; release is deliberate
- [ ] Favorites save; product-vs-product and variation-vs-variation comparison work
- [ ] Save, close, reopen: the experience is restored, not re-created
- [ ] Reopening an in-progress project offers a price refresh; changes show previous/current price with dates, delta, and project-total effect
- [ ] A completed project never auto-refreshes and retains its completion-time prices
- [ ] Multiple saved projects coexist and open independently
- [ ] Error, timeout, and partial-live-data paths degrade with honest messaging and no fabricated data
- [ ] `typecheck`, `test:unit`, `test:e2e`, `test:visual` all green; no test weakened
- [ ] `git diff baseline/pre-v2` contains no secrets, artifacts, or unrelated edits
