# WS-6 — Integration, regression, and end-to-end validation

**Read first:** `docs/plan/COORDINATION.md` in full, `docs/plan/PLAN.md` §6 and §11.
**Branch:** `ws/6-integration` off `roommuse-v2/integration`. **Depends on:** all other workstreams.

## Goal

Turn a set of independently completed workstreams into one coherent Room Muse product, and prove nothing regressed.
REQ-14: "The desired outcome is a coherent Room Muse product, not a collection of independently completed tickets."

## Files owned

`e2e/**` (including `e2e/visual.spec.ts-snapshots/**`), `tests/integration.test.ts`, `playwright.config.ts`,
`package.json` (scripts), `docs/IMPLEMENTATION_REPORT.md`, `docs/CURRENT_CONTRACTS.md`.

## Tasks

### T1 — Cross-workstream wiring
Walk every interface in COORDINATION.md §5 and confirm producer and consumer actually agree in code, not just on
paper. Find and fix the seams: a domain selector nobody calls, a server field nobody renders, an error shape the
UI does not handle, two workstreams solving the same problem differently. Duplicate or contradictory
implementations are the specific failure this workstream exists to catch.

### T2 — Regression sweep
`npm run typecheck && npm run test:unit && npm run test:e2e && npm run test:visual`, all green.
Compare against the baseline recorded in COORDINATION.md §10. Any pre-existing test that now fails is a regression
until proven otherwise — **never** resolve one by weakening an assertion (REQ-13).

### T3 — Extend the journeys to REQ-13's full list
Every bullet gets an automated journey or, where automation is impractical, a scripted manual check with recorded
evidence: new project; image intake; multi-image behaviour or the deliberate single-image fallback; style
selection; three genuinely different variations; variation selection; budget behaviour; dynamic shopping results;
direct product links; price/availability handling; substitutions; additions; recalculated totals; design
constraints; favorites/comparison; save/close/reopen; in-progress refresh; price history; completed-project
snapshot; multiple saved projects; error/timeout/partial-live-data scenarios.

### T4 — Visual re-baseline
New UI legitimately changes the 60 baselines across six viewports. Review each diff, confirm it is intended, and
commit the regenerated snapshots **in their own commit**, separate from logic, so review can see exactly what
changed visually.

### T5 — Live-data smoke test (REQ-1, REQ-11)
With a real API key, run a genuine room through the full flow and verify by hand: every purchasable link opens the
specific product page; prices match the retailer page; no seeded item appears anywhere; unresolved items say so.
This is the requirement that automated fixtures cannot prove. Record the evidence.

### T6 — Repository hygiene
Review `git diff baseline/pre-v2` in full before merging to `codex/sibling-roommuse-preservation`. Confirm: no
secrets or `.env`, no `storage/`/`dist/`/`.test-dist/`/screenshots, no stray local configuration, no unrelated
edits, no leftover debug logging, commits small and reviewable, rollback to `baseline/pre-v2` still clean.

### T7 — Documentation
Update `docs/CURRENT_CONTRACTS.md` to describe the contracts as they now stand, and rewrite
`docs/IMPLEMENTATION_REPORT.md` for this release: what changed, what was deliberately preserved, migration and
rollback, known limitations, and the completed acceptance checklist.

### T8 — Final acceptance
Walk `PLAN.md` §11 line by line and tick each item with evidence. Any unticked line is reported plainly to the
user as not done, with the reason — scaling the work down is the user's call, not ours.

## Prohibited

- Never make a failing test pass by weakening or deleting it, loosening a matcher, or raising a diff threshold.
- Do not silently absorb another workstream's unfinished work. Send it back through COORDINATION.md §8.
- Do not merge to `codex/sibling-roommuse-preservation` until every gate is green and the user has approved.

## Definition of done

All four gates green; every REQ-13 scenario covered; live smoke test evidence recorded; clean diff against the
baseline tag; documentation current; §11 checklist complete or its gaps explicitly reported.

## Required handoff

A final report to the user: what shipped, what was preserved and why, what is deliberately not done, known
limitations, how to roll back (`baseline/pre-v2`), and the open questions that remain.
