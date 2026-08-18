# WS-2 — Server, AI pipeline, and live commerce

**Read first:** `docs/plan/COORDINATION.md`, `docs/plan/PLAN.md` §1.3, §1.4 (D3, D4, D13), §3.
**Branch:** `ws/2-server` off `roommuse-v2/integration`. **Depends on:** WS-1 (types + contracts frozen).

## Goal

Make the AI pipeline produce genuinely different variations and genuinely live, budget-aware,
constraint-aware product recommendations — by extending what already works, not replacing it.

## Files owned

`server/server.mjs`, `src/designService.ts`.

## Context you must not undo

The existing product-search subsystem is the most valuable code in the repo. It already: runs a live web search
(`server.mjs:141-151`), collects `url_citation` annotations (`:154-159`), refuses any product whose URL is not in
those citations (`:177`), enforces `isDirectProductUrl` (`:45-70`) and an 11-domain retailer allowlist (`:95-102`),
and requires a finite positive USD price (`:178-180`). It never fabricates. **Preserve every one of those guards.**

## Tasks

### T0 — S-1 spike (do this first; it blocks others)
Determine whether `/v1/images/edits` with `gpt-image-2` accepts multiple input images and whether doing so improves
room-geometry fidelity versus the current single-image call (`server.mjs:285-322` uses only `scans[0]`, while
`analyzeRoom` already consumes all three at `:376-380`). Time-box to one day. Record the verdict and the chosen
REQ-4 outcome (a/b/c per `PLAN.md` §3 S-1) in COORDINATION.md §1 and §9 **before** building on it, and tell WS-5 —
their capture copy depends on it.

### T1 — Differentiate the three variations (REQ-5, D3)
Signature / Refined / Expressive already render with distinct prompts (`:287-291`). The sameness comes from
downstream. Fix all three causes:
- Produce a **concept-specific item brief** (silhouette, material, finish, scale emphasis) per direction, not one
  shared list. The single shared list is created in `domain.ts:38` — coordinate with WS-3, who owns that file.
- Make `buildDesignReport` (`:405-422`) genuinely per-concept. Today only two sentences change.
- Stop substituting the Signature image when a secondary render fails (`:540`) — that is what makes them look like
  clones. Surface an honest per-variant failure the UI can retry.

### T2 — Split out `POST /api/shopping-plan` (REQ-1/2/5/10, RM-2)
Move product resolution out of `/api/design` (`:525-526`) into its own endpoint, called after the user selects a
variation. This makes the plan concept-specific, budget-aware, and constraint-aware, and removes the search from
the generation critical path. Keep `/api/design` returning the legacy concept shape so existing clients and the
Playwright fixtures keep working.

### T3 — Budget- and constraint-aware search (REQ-1, REQ-2, REQ-10)
Feed budget target, remaining budget, retained items, room dimensions, and constraints into the analysis prompt
(`:376-380`) and the product-search prompt (`:148`). Return save/balanced/invest options *within* the budget frame
rather than filtering after the fact. Constraints must exclude items the user is keeping from the plan entirely.

### T4 — `POST /api/prices/refresh` (REQ-7, REQ-11)
Re-verify price and availability for the items of an **in-progress** project. Append `PriceObservation` records;
never overwrite. Return previous value, previous date, current value, current date, and delta. Refuse completed
projects server-side with a clear error. Handle partial success — some items refresh, some do not — honestly.

### T5 — `POST /api/identify-product` (REQ-3)
Vision call over a photographed in-store product. Return category, inferred approximate dimensions where the
evidence supports it, visual compatibility notes against the selected concept, and a price if discoverable.
Reuse the existing strict `json_schema` pattern (`:381-388`). **Never invent dimensions or price** — the existing
prompt already says "Never invent exact room measurements"; hold that line.

### T6 — Rationale quality (REQ-8)
`buildDesignReport` and the per-item rationale are template strings assembled from `roomAnalysis`. Make them
specific to the actual room, chosen products, and their relationships (style, colour, scale, layout, materials,
balance, retained features) — and keep them concise. REQ-8 explicitly warns against generic design prose.

### T7 — Latency (RM-2, D13)
T2 removes the biggest blocker. Also consider returning the Signature render as soon as it lands and streaming the
secondary variants, rather than awaiting all three (`:524-526`). Any contract change goes through COORDINATION.md §5.

## Prohibited

- Do not remove or weaken the citation gate, `isDirectProductUrl`, the retailer allowlist, or the USD/price checks.
- Do not fabricate a price, availability, discount, retailer, or URL under any circumstance (REQ-1, REQ-11).
- Do not introduce a second AI provider or a parallel AI architecture (REQ-12, decision A1).
- Do not edit `src/domain.ts`, `src/enhancedTypes.ts`, or any screen. Request changes via COORDINATION.md §8.
- Do not commit an API key, `.env`, or anything from `storage/`.

## Test expectations

- Server tests run against **recorded OpenAI fixtures** — no network in the standard gate.
- Add a manual-only `npm run test:live` for real-key verification of REQ-1/REQ-11 (never part of the merge gate).
- Cover: zero search results; citations present but no parseable price; one variant render fails; refresh timeout
  mid-project; refresh attempted on a completed project; search returns a category page (must be rejected).
- `npm run typecheck`, `npm run test:unit`, `npm run test:e2e` stay green.

## Definition of done

- Three variations differ in image, report, **and** item list.
- A generated plan for a real room contains no seeded item and every purchasable link is a specific product page.
- Unresolvable items return an explicit unresolved state, never a substitute.
- Budget and constraints demonstrably change what the search returns.
- Refresh appends history and refuses completed projects.
- S-1 decision recorded; generation latency measured before and after.

## Required handoff

Publish every endpoint's final request/response in COORDINATION.md §5; post the S-1 verdict; give WS-5 the exact
error/unresolved shapes they must render; give WS-3 the exact per-item payload they must merge.
