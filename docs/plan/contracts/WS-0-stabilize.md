# WS-0 — Stabilize the baseline

**Read first:** `docs/plan/COORDINATION.md`, then `docs/plan/PLAN.md` §1.4.
**Branch:** `ws/0-stabilize` off `roommuse-v2/integration`.
**Depends on:** nothing. Ship this first — it unblocks device testing for every other workstream.

## Goal

Make the app launchable on a real device and make the repository honest about what it contains. No new features.

## Scope

1. **D1 — P0 native crash.** `src/RoomMuseApp.tsx:20` evaluates `window.location.search`. In React Native `window`
   exists but `window.location` does not, so this throws on launch. This matches `RM_error.PNG` exactly (top frame
   `App`, `RoomMuseApp.tsx`). Fix the guard so demo-mode detection is web-only and cannot throw on native. Audit
   `src/assetUrl.ts:1`, `src/designService.ts:4-5`, `src/persistence.ts:7` for the same pattern — they are currently
   protected only by `process.env.EXPO_PUBLIC_API_URL ??` short-circuiting, which is fragile.
2. **D10 — Encoding corruption.** U+FFFD replacement characters are committed in `src/ProjectScreens.tsx` lines
   11 (back chevron), 13 (`SAVED DECOR �`), 14 (`? Applied to shopping list`), 16 (`You�re`) and `App.tsx:122`
   (`AFTER �`). Restore the intended characters and save as UTF-8.
   *Exception to the ownership table:* you own `ProjectScreens.tsx` **for these character fixes only** while WS-5
   has not started. Coordinate in COORDINATION.md §8 if WS-5 is already live.
3. **D11 — Dead code.** `App.tsx` contains a complete second UI (`Home`, `Capture`, `StylePicker`, `Generating`,
   `Result`, `Shopping`, `AppContent`, plus a ~100-property stylesheet) that is never rendered, because line 138 is
   `export { default } from "./src/RoomMuseApp";`. Reduce `App.tsx` to the re-export. Confirm nothing imports the
   removed symbols first.
4. **D12 — Port defaults.** `designService.ts:5`, `persistence.ts:7`, `assetUrl.ts:1` default to `:8787`; the server
   listens on `3201` (`server.mjs:17`). `scripts/start-roommuse.ps1` never exports `EXPO_PUBLIC_API_URL`. Align the
   default to 3201 and have the startup script export the LAN `EXPO_PUBLIC_API_URL` it already computes
   (`start-roommuse.ps1:66-69`). Update `README.md` if the setup steps change.
5. **Establish the missing baselines.** Run `npm run test:e2e` and `npm run test:visual` and record the results in
   COORDINATION.md §10. If the 60 visual baselines are already stale, say so — do not re-baseline here.
6. **Reproduce, do not guess (RM-1, RM-4, RM-5).**
   - RM-1 "Allow Camera not working": `allowCamera` (`EnhancedScreens.tsx:56-59`) looks correct, including the
     `canAskAgain === false` settings deep-link. `README.md:35` already documents that mobile browsers block camera
     on plain-HTTP LAN pages, and `scripts/serve_https.py` exists. **Reproduce and identify the root cause before
     changing any code.** If it is HTTPS/origin, the fix is documentation + startup script, not the component.
   - RM-4 "video capture doesn't work": video recording *is* implemented (`EnhancedScreens.tsx:68-94`, native +
     web `MediaRecorder`). Verify on device; only fix what actually fails.
   - RM-5 "no back button": in-app back is already implemented (`RoomMuseApp.tsx:24-38`, Android `BackHandler` +
     web `popstate`). Verify; report if it fails on iOS Safari specifically.

## Prohibited

- No feature work. No type changes. No changes to `server/server.mjs`, `src/domain.ts`, `src/persistence.ts` logic
  (the port default in `persistence.ts` is the single exception).
- Do **not** reformat or reflow minified lines — a reflow is a whole-file diff and will destroy other workstreams'
  merges.
- Do not re-baseline visual snapshots.

## Test expectations

- `npm run typecheck`, `npm run test:unit` stay green (11/11).
- `npm run test:e2e`, `npm run test:visual` results recorded in COORDINATION.md §10 whatever they are.
- Add a unit test asserting demo-mode detection does not throw when `window.location` is undefined.

## Definition of done

- App launches on the physical iPhone through Expo Go without a render error.
- No U+FFFD characters remain in the tree (`grep -r $'�' src App.tsx`).
- `App.tsx` contains only the re-export.
- A device with no hand-written `.env` reaches the API on the correct port.
- RM-1/RM-4/RM-5 each have a written root-cause verdict in COORDINATION.md §9.

## Required handoff

Post to COORDINATION.md: e2e/visual baseline results; root-cause verdicts for RM-1/RM-4/RM-5; the answer to Q3
(is the phone running the OneDrive checkout rather than this repo?); any file you touched outside your ownership.
