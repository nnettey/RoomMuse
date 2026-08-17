import test from "node:test";
import assert from "node:assert/strict";
import { demoRoute } from "../src/runtimeEnv";

// React Native defines `window` but not `window.location`. The previous
// `typeof window !== "undefined" ? new URLSearchParams(window.location.search)...` guard
// therefore threw on launch ("Cannot read property 'search' of undefined") and took the
// whole app down. These tests pin the safe behaviour on every runtime shape.

const scope = globalThis as unknown as { window?: unknown };

function withWindow(value: unknown, run: () => void) {
  const had = "window" in scope;
  const previous = scope.window;
  scope.window = value;
  try {
    run();
  } finally {
    if (had) scope.window = previous;
    else delete scope.window;
  }
}

test("demo detection does not throw when window has no location (React Native)", () => {
  withWindow({}, () => assert.equal(demoRoute(), null));
});

test("demo detection tolerates a location without a search string", () => {
  withWindow({ location: {} }, () => assert.equal(demoRoute(), null));
});

test("demo detection reads the demo parameter on web", () => {
  withWindow({ location: { search: "?demo=shopping" } }, () => assert.equal(demoRoute(), "shopping"));
});

test("demo detection returns null for a web location with no demo parameter", () => {
  withWindow({ location: { search: "" } }, () => assert.equal(demoRoute(), null));
});

test("demo detection returns null when window is absent entirely", () => {
  assert.equal(demoRoute(), null);
});
