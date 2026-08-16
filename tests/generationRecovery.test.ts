import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("failed generation stops spinning and shows a bounded retry state", () => {
  const app = readFileSync("src/RoomMuseApp.tsx", "utf8");
  const service = readFileSync("src/designService.ts", "utf8");
  assert.match(app, /!error&&!reducedMotion/);
  assert.match(app, /error&&<Text style=\{s\.tip\}>\{error\}<\/Text>/);
  assert.match(app, /label="Try again"/);
  assert.match(service, /controller\.abort\(\), 180_000/);
});
