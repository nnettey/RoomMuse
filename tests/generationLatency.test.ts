import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("initial design response performs only one blocking image render", () => {
  const source = readFileSync("server/server.mjs", "utf8");
  assert.equal(
    source.includes("const secondaryImage = await renderRoom"),
    false,
  );
  assert.match(source, /generationStatus: "partial"/);
  assert.match(source, /Use Make changes to render its unique direction/);
});
