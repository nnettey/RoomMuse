import test from "node:test";
import assert from "node:assert/strict";
import { demoRoute } from "../src/demoRoute";

test("native startup works when window.location is unavailable", () => {
  assert.equal(demoRoute(undefined), null);
});

test("browser startup without a demo query uses the normal home route", () => {
  assert.equal(demoRoute({ search: "" }), null);
});

test("browser demo routes remain supported", () => {
  assert.equal(demoRoute({ search: "?demo=shopping" }), "shopping");
});
