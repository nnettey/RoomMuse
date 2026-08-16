# WS-4 — Persistence and the project store

**Read first:** `docs/plan/COORDINATION.md`, `docs/plan/PLAN.md` §1.4 (D5, D9), §3 A6.
**Branch:** `ws/4-persistence` off `roommuse-v2/integration`. **Depends on:** WS-1.

## Goal

Make Room Muse hold many projects, restore them faithfully, and honour the in-progress/complete lifecycle.

## Files owned

`src/persistence.ts`, `src/projectStore.ts` (new).

## Context

Most of this already exists but is unreachable. `persistence.ts:50-51` provides `loadProjects()` and
`saveToLibrary()` over the `roommuse.projects.v1` key, but `RoomMuseApp.tsx:4` imports only `loadProject` and
`saveToLibrary` — nothing ever calls `loadProjects` and there is no project-list screen, so the app holds exactly
one active project. Server-side project sync (`GET|PUT /api/projects/:id`, `server.mjs:443-458`) and
timestamp-based conflict resolution (`domain.ts:54-70`) work today. **Extend this; do not rewrite it.**

## Tasks

### T1 — Multi-project store (REQ-6) → `src/projectStore.ts`
`listProjects`, `openProject`, `createProject`, `renameProject`, `deleteProject` (with confirmation semantics
surfaced to the UI), ordered by `updatedAt`. Keep `loadProject`'s "current project" concept working so nothing
regresses. Every field in REQ-6's list must round-trip: source images, derived room context, room info, style,
generated variations, selected variation, budget, retained/fixed items, constraints, recommended products,
shopping/cart state, substitutions/additions, favorites/comparisons, price history, status, rationale.

### T2 — v2 → v3 migration (REQ-6)
Implement WS-1's migration contract. Preserve the existing rollback guarantee: `roommuse.project.v2` and the
legacy `roommuse.concept` key must remain readable and must not be deleted (`persistence.ts:34-35`,
`docs/CURRENT_CONTRACTS.md`). Migration must be idempotent and safe to run on a partially-migrated store.

### T3 — Lifecycle-aware load/save (REQ-7)
Persist `status`, `completedAt`, `lastPriceRefreshAt`, and the completion snapshot. On opening an **in-progress**
project, signal to the UI that a price refresh is available. On opening a **complete** project, guarantee no
refresh is triggered by any code path and the completion-time prices are what is loaded.

### T4 — Sync the new fields
Extend `pushProject`/`remoteProject` (`persistence.ts:15-26`) and the conflict resolution
(`domain.ts:54-70`) so constraints, favorites, price history, substitutions, and status merge correctly. Price
history is append-only and must **union** across replicas rather than last-write-wins.

### T5 — Payload size (risk R8)
Projects embed base64 images in `sourceImages`; `PUT /api/projects/:id` destroys requests over 50 MB
(`server.mjs:448`) and AsyncStorage has its own limits. Measure real payloads at three photos across several
projects. If they approach the limits, store images by reference (the server already serves `/designs/:file`
immutably, `server.mjs:423-432`) instead of inline. Report the measurement in COORDINATION.md whatever it shows.

## Prohibited

- No UI. No AI calls. Do not edit `src/domain.ts` (WS-3), `src/enhancedTypes.ts` (WS-1), `server/server.mjs` (WS-2),
  or any screen.
- Do not delete or stop reading any legacy storage key — the rollback path depends on them.
- Do not make persistence failures silent. The existing pattern surfaces "saved locally, sync unavailable"
  (`RoomMuseApp.tsx:39`); preserve that honesty.

## Test expectations

- Migration: v1 legacy concept → v3; v2 → v3; already-v3 (idempotent); corrupt/partial record.
- Multiple projects saved, listed, reopened independently, and unaffected by each other's edits.
- Full round-trip: every REQ-6 field survives save → close → reopen.
- Complete project loads with no refresh triggered by any path.
- Conflict merge: price history unions; a newer item edit wins; constraints are not lost.
- Sync unavailable → local save still succeeds and the user is told.

## Definition of done

`typecheck` + `test:unit` green; a device can hold several projects and reopen any of them into a restored
experience rather than a re-created one; lifecycle status is durable; payload measurement recorded.

## Required handoff

Publish the `projectStore` API in COORDINATION.md §5 for WS-5, plus the migration guarantees and the payload
measurement.
