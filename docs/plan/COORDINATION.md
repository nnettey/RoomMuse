# Room Muse v2 — Shared Coordination State

**This is the single source of shared truth for all implementation agents/sessions.**

Rules:
1. **Read this whole file before you start.** Do not begin work until you have read your own `contracts/WS-*.md` brief too.
2. **Update it at every handoff**, and whenever you make a decision, hit a blocker, or change a shared interface.
3. **Never edit a file you do not own** (§3). If you need a change in someone else's file, record it in §8 Handoffs and let the owner make it.
4. **Never weaken or delete a test** to make your work pass. Record the conflict in §9 instead.
5. Append to logs; do not rewrite history in this file.

Last updated: 2026-08-16 — by: Lead planner — reason: initial plan committed.

---

## 1. Plan and architecture decisions

Full reasoning: [`PLAN.md`](PLAN.md). Binding decisions:

| ID | Decision | Status |
|---|---|---|
| A1 | Keep the existing OpenAI pipeline (gpt-image-2 render, gpt-4.1-mini analysis/parse, gpt-4o-mini-search-preview product search). Extend inputs; do not build a parallel AI architecture. | Accepted |
| A2 | Move product resolution out of `/api/design` into `POST /api/shopping-plan`, run for the **selected** variation. Fixes REQ-2/5/10 and generation latency at once. | Accepted |
| A3 | Seeded catalogs (`enhancedData.seeds`, `data.catalog`, `alts()`) become **demo/test only**. Never a production fallback. Unresolved products get an explicit unresolved state. | Accepted |
| A4 | `Item.provenance` (`generated\|discovered\|verified\|cached\|historical\|user-supplied`) + append-only `Item.priceHistory`. `priceStatus` kept as a derived alias for back-compat. | Accepted |
| A5 | `Project.constraints` is first-class, persisted, injected into analysis/render/shopping prompts, and enforced by a domain guard. Release must be explicit. | Accepted |
| A6 | `Project.status: in-progress \| complete`. Refresh allowed only for in-progress; completed projects are frozen snapshots. | Accepted |
| S-1 | Multi-image render support is **unverified**. Spike first, then choose one of the three REQ-4-sanctioned outcomes. | **OPEN — blocks WS-2 render work and WS-5 capture copy** |

### Decision log (append new rows; never delete)

| Date | ID | Decision | Made by | Rationale |
|---|---|---|---|---|
| 2026-08-16 | A1–A6 | See above | Lead planner | Post-inspection; see PLAN.md §3 |
| 2026-08-16 | E1 | **Execution model: sequential in one session, parallel only for genuinely disjoint lanes.** Order: WS-0 + WS-1 → WS-2/3/4 → WS-5 → WS-6. | User | Minified single-line files make concurrent edits unmergeable (PLAN.md §4.2); lowest merge risk |
| 2026-08-16 | E2 | **Q3 resolved: `C:\Data\LocalNettCreative\Claude_RoomMuse\RoomMuse` is the live checkout.** The `OneDrive\…\roommuse` path in `RM_error.PNG` is a stale copy. Device verification against this repo is meaningful. | User | — |

---

## 2. Workstream ownership and status

| WS | Title | Owner | Branch | Status | Blocked by |
|---|---|---|---|---|---|
| WS-0 | Stabilize (P0 defects) | _unassigned_ | `ws/0-stabilize` | Not started | — |
| WS-1 | Contracts & types | _unassigned_ | `ws/1-contracts` | Not started | — |
| WS-2 | Server / AI / commerce | _unassigned_ | `ws/2-server` | Not started | WS-1 |
| WS-3 | Domain logic | _unassigned_ | `ws/3-domain` | Not started | WS-1 |
| WS-4 | Persistence & project store | _unassigned_ | `ws/4-persistence` | Not started | WS-1 |
| WS-5 | UI | _unassigned_ | `ws/5-ui` | Not started | WS-1 (soft: WS-3, WS-4) |
| WS-6 | Integration & regression | _unassigned_ | `ws/6-integration` | Not started | all |

Status vocabulary: `Not started` → `In progress` → `Ready for review` → `Merged to integration` → `Done`.

---

## 3. File ownership (anti-collision — this is binding)

Source files in this repo are **minified onto very long single lines**. Two agents editing one file produces
conflicts that cannot be resolved mechanically. Ownership is exclusive.

| File | Owner |
|---|---|
| `App.tsx` | WS-0 |
| `scripts/start-roommuse.ps1`, `README.md` | WS-0 |
| `src/enhancedTypes.ts` | WS-1 (**frozen after WS-1 merges** — changes require a §8 request) |
| `docs/CONTRACTS_V2.md` | WS-1 |
| `server/server.mjs` | WS-2 |
| `src/domain.ts`, `src/budget.ts`, `src/constraints.ts`, `src/productLinks.ts` | WS-3 |
| `tests/domain.test.ts` | WS-3 |
| `src/persistence.ts`, `src/projectStore.ts` | WS-4 |
| `src/RoomMuseApp.tsx` | WS-0 until merged, then **WS-5** |
| `src/EnhancedScreens.tsx`, `src/ProjectScreens.tsx`, new `src/*Screen.tsx` | WS-5 |
| `src/designService.ts` | WS-2 (owns the request/response shape it calls) |
| `e2e/**`, `tests/integration.test.ts`, `playwright.config.ts` | WS-6 |
| `src/data.ts`, `src/enhancedData.ts`, `src/demo.ts` | WS-3 (demo-gating only; strings must stay intact for e2e) |
| `package.json` | WS-6 (script additions only; others request via §8) |
| `docs/plan/**` | Any agent may append to COORDINATION.md; `PLAN.md` is lead-planner-owned |

**Never touched by anyone:** `.env`, `storage/`, `dist/`, `.test-dist/`, `package-lock.json` (unless adding a dep,
which requires a §8 note), `e2e/visual.spec.ts-snapshots/**` (WS-6 only, in its own commit).

---

## 4. Branches and worktrees

- Baseline tag: `baseline/pre-v2` → commit `2379fb2` — **the rollback point.**
- Integration branch: `roommuse-v2/integration`, cut from `codex/sibling-roommuse-preservation`.
- Nothing merges into `codex/sibling-roommuse-preservation` until WS-6 reports green.
- Workstream branches are cut from the integration branch and rebased onto it immediately before merge.
- Merge with `--no-ff` so every workstream is a single revertable unit.

| WS | Worktree path | Branch | Live? |
|---|---|---|---|
| _(fill in as sessions start)_ | | | |

---

## 5. Interfaces and contracts

Authoritative definitions land in `docs/CONTRACTS_V2.md` (WS-1). Summary of what each workstream may rely on:

| Interface | Producer | Consumers | Status |
|---|---|---|---|
| `Project` v3 (status, budget, constraints, favorites, price history) | WS-1 | WS-2, WS-3, WS-4, WS-5 | Not defined |
| `Item.provenance` + `PriceObservation` | WS-1 | WS-2, WS-3, WS-5 | Not defined |
| `POST /api/design` (v2 request: `budget`, `constraints`, `roomDimensions`, `retainedItems`; old shape still accepted) | WS-2 | WS-5 via `designService.ts` | Not defined |
| `POST /api/shopping-plan` | WS-2 | WS-3, WS-5 | Not defined |
| `POST /api/prices/refresh` | WS-2 | WS-3, WS-4, WS-5 | Not defined |
| `POST /api/identify-product` (REQ-3 vision) | WS-2 | WS-5 | Not defined |
| Budget selectors (`projectedSpend`, `remaining`, `variance`, `byCategory`, `costDrivers`) | WS-3 | WS-5 | Not defined |
| Constraint guard (`canModifyItem`, `applyConstraints`, `releaseConstraint`) | WS-3 | WS-4, WS-5 | Not defined |
| Project store (`listProjects`, `openProject`, `setStatus`, migration v2→v3) | WS-4 | WS-5 | Not defined |

Rule: **publish the interface here before you build against it.** If you change a published interface, update this
table and post a §8 handoff note naming every affected workstream.

---

## 6. Progress log

| Date | WS | Event |
|---|---|---|
| 2026-08-16 | — | Repository inspected. Baseline measured: `typecheck` clean, `test:unit` 11/11 pass, tree clean at `2379fb2`. Plan committed. |

---

## 7. Files materially changed

| WS | File | Change | Merged? |
|---|---|---|---|
| _(fill in as work lands)_ | | | |

---

## 8. Handoffs, cross-workstream requests, and blockers

Format: `[date] WS-x → WS-y — request/blocker — status`

| Entry | Status |
|---|---|
| _(none yet)_ | |

---

## 9. Unresolved issues and open questions

Mirrors `PLAN.md` §10; update here as they resolve.

| # | Question | Owner | Status |
|---|---|---|---|
| Q1 | Does `gpt-image-2` `/v1/images/edits` accept multiple input images usefully? (S-1) | WS-2 | **Open — blocking** |
| Q2 | Is the RM-1 camera failure HTTPS/origin or code? Reproduce before changing code. | WS-0 | Open |
| Q3 | `RM_error.PNG` shows the crash in a `OneDrive\…\roommuse` path. Which checkout does the phone run? | WS-0 / user | **Resolved 2026-08-16** — this repo is live; the OneDrive path is a stale copy (decision E2) |
| Q4 | Budget: project-level target only, or category caps too? Planned: project-level + category rollup. | WS-1 | Assumed |
| Q5 | Acceptable ceiling for concept-generation latency (RM-2 gives no number). | WS-2 / user | Open |
| Q6 | May a completed project be reopened to in-progress? Planned: yes, deliberate action, completion snapshot preserved. | WS-1 | Assumed |

---

## 10. Test status

| Gate | Baseline (2026-08-16) | Current |
|---|---|---|
| `npm run typecheck` | Pass | Pass |
| `npm run test:unit` | Pass 11/11 | Pass 11/11 |
| `npm run test:e2e` | **Not yet run** — WS-0 must establish this | — |
| `npm run test:visual` | **Not yet run** — WS-0 must establish this | — |
| `npm run test:live` (manual, real key) | Does not exist yet — WS-2 | — |

---

## 11. Integration status

Not started. WS-6 owns final integration, the full regression sweep, visual re-baselining, the live-data smoke
test, and the end-to-end acceptance checklist in `PLAN.md` §11.
