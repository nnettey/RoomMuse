import test from "node:test";
import assert from "node:assert/strict";
import { styles, concepts } from "../src/enhancedData";
import { completeProject, createProject, normalizeProject, replace, resolveProjectConflict, selected } from "../src/domain";
import { addConstraint, createConstraint } from "../src/constraints";
import type { Item, PriceObservation, Project } from "../src/enhancedTypes";

const style = styles[0]!;
const at = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
const observation = (price: number, day: number): PriceObservation => ({ price, currency: "USD", observedAt: at(day), source: "verified" });

function item(id: string, price: number, history: PriceObservation[]): Item {
  return { id, name: "Sofa " + id, category: "Furniture", description: "d", quantity: 1, unitPrice: price,
    retailer: "West Elm", purchaseUrl: "https://www.westelm.com/products/" + id + "/",
    priceStatus: "verified", provenance: "verified", priceHistory: history, isOwned: false, isPurchased: false, isRemoved: false } as Item;
}
const withItems = (items: Item[]): Project => { const base = createProject(style, []); return replace(base, { ...selected(base)!, shoppingItems: items }); };

// ── The regression that would have made WS-1 and WS-3 invisible ──────────────
test("normalizeProject preserves every v3 field across a save and reload", () => {
  let project = withItems([item("a", 1000, [observation(1000, 1)])]);
  project = addConstraint(project, createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  project = { ...project, budget: { total: 8000, currency: "USD", setAt: at(1) },
    favorites: [{ id: "f1", kind: "product", refId: "a", label: "Sofa", createdAt: at(1) }],
    roomDimensions: "12 ft x 16 ft",
    roomContext: { mode: "multi-image", imageCount: 3, imagesUsedForAnalysis: 3, imagesUsedForRender: 3, note: "All three used", derivedAt: at(1) } };
  const reloaded = normalizeProject(JSON.parse(JSON.stringify(project)) as Project);
  assert.equal(reloaded.budget?.total, 8000);
  assert.equal(reloaded.constraints?.length, 1);
  assert.equal(reloaded.favorites?.length, 1);
  assert.equal(reloaded.roomDimensions, "12 ft x 16 ft");
  assert.equal(reloaded.roomContext?.imagesUsedForRender, 3);
  assert.equal(reloaded.status, "in-progress");
  assert.equal(reloaded.schemaVersion, 3);
  assert.equal(selected(reloaded)!.shoppingItems[0]!.priceHistory?.length, 1);
});
test("a completed project keeps its status and snapshot across a reload", () => {
  const reloaded = normalizeProject(JSON.parse(JSON.stringify(completeProject(withItems([item("a", 1000, [observation(1000, 1)])])))) as Project);
  assert.equal(reloaded.status, "complete");
  assert.equal(reloaded.completionSnapshot?.projectTotal, 1000);
  assert.ok(reloaded.completedAt);
});
test("a v1 legacy record still migrates and gains v3 defaults", () => {
  const migrated = normalizeProject({ concept: { id: "old", title: "Old", summary: "Saved", style: "Modern", palette: [], principles: [], shoppingItems: [] } });
  assert.equal(migrated.status, "in-progress");
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.constraints, []);
});
test("normalizeProject is idempotent", () => {
  const once = normalizeProject(withItems([item("a", 1000, [observation(1000, 1)])]));
  const twice = normalizeProject(JSON.parse(JSON.stringify(once)) as Project);
  assert.equal(twice.status, once.status);
  assert.equal(twice.constraints?.length, once.constraints?.length);
  assert.equal(selected(twice)!.shoppingItems[0]!.priceHistory?.length, 1);
});

// ── Conflict resolution ──────────────────────────────────────────────────────
test("price history unions across replicas instead of last-write-wins", () => {
  const local = { ...withItems([item("a", 1100, [observation(1000, 1), observation(1100, 3)])]), updatedAt: at(3) };
  const server = { ...withItems([item("a", 1050, [observation(1000, 1), observation(1050, 2)])]), updatedAt: at(4) };
  const merged = resolveProjectConflict(local, { ...server, projectId: local.projectId, concepts: local.concepts.map((c, i) => ({ ...server.concepts[i]!, id: c.id })) });
  const history = selected(merged)!.shoppingItems[0]!.priceHistory ?? [];
  assert.equal(history.length, 3, "an append-only log must not lose observations to a sync conflict");
  assert.deepEqual(history.map(o => o.price), [1000, 1050, 1100], "and it stays ordered");
});
test("a constraint release survives a conflict even when the other side still has it active", () => {
  const base = addConstraint(withItems([item("a", 1000, [])]), createConstraint("keep-item", "Keep my sofa", { id: "c1", createdAt: at(1) }));
  const released = { ...base, constraints: (base.constraints ?? []).map(c => ({ ...c, releasedAt: at(2), releaseReason: "Changed my mind" })), updatedAt: at(2) };
  const stale = { ...base, updatedAt: at(3) };
  for (const merged of [resolveProjectConflict(released, stale), resolveProjectConflict(stale, released)]) {
    assert.equal(merged.constraints?.length, 1);
    assert.ok(merged.constraints?.[0]?.releasedAt, "a release must never be lost to a sync conflict");
  }
});
test("favorites union rather than one replica overwriting the other", () => {
  const local = { ...withItems([item("a", 1000, [])]), favorites: [{ id: "f1", kind: "product" as const, refId: "a", label: "A", createdAt: at(1) }], updatedAt: at(2) };
  const server = { ...local, favorites: [{ id: "f2", kind: "product" as const, refId: "b", label: "B", createdAt: at(1) }], updatedAt: at(3) };
  assert.equal(resolveProjectConflict(local, server).favorites?.length, 2);
});

// ── Storage budget (risk R8) ─────────────────────────────────────────────────
test("library entries drop redundant inline photos but keep irreplaceable ones", async () => {
  const { stripInlineImages } = await import("../src/persistence");
  const photos = [{ uri: "file:///a.jpg", base64: "x".repeat(200000) }];
  const withServerCopy = { ...withItems([item("a", 1000, [])]), sourceImages: photos };
  withServerCopy.concepts = withServerCopy.concepts.map(c => ({ ...c, beforeImageUrl: "http://host/designs/a-before.jpg" }));
  const stripped = stripInlineImages(withServerCopy);
  assert.equal(stripped.sourceImages[0]!.base64, undefined, "a photo the server already holds need not be stored twice");
  assert.equal(stripped.sourceImages[0]!.uri, "file:///a.jpg");
  // Assert the exact weight removed rather than a ratio: the ratio depends on how many photos the
  // fixture happens to carry, the byte count does not.
  assert.ok(JSON.stringify(withServerCopy).length - JSON.stringify(stripped).length >= 200000, "the whole base64 payload is removed");

  const noServerCopy = { ...withItems([item("a", 1000, [])]), sourceImages: photos };
  noServerCopy.concepts = noServerCopy.concepts.map(c => ({ ...c, beforeImageUrl: undefined }));
  assert.equal(stripInlineImages(noServerCopy).sourceImages[0]!.base64?.length, 200000, "the only copy of a scan must never be discarded");
});

// The single-photo fixture above could not see this: only scans[0] is written server-side, so
// stripping every source image lost the second and third angles for good (F18).
test("library entries keep the photos the server does not hold", async () => {
  const { stripInlineImages } = await import("../src/persistence");
  const photos = [
    { uri: "file:///a.jpg", base64: "a".repeat(1000) },
    { uri: "file:///b.jpg", base64: "b".repeat(1000) },
    { uri: "file:///c.jpg", base64: "c".repeat(1000) }
  ];
  const project = { ...withItems([item("a", 1000, [])]), sourceImages: photos };
  project.concepts = project.concepts.map(c => ({ ...c, beforeImageUrl: "http://host/designs/a-before.jpg" }));
  const stripped = stripInlineImages(project);
  assert.equal(stripped.sourceImages[0]!.base64, undefined, "the server holds the first scan");
  assert.equal(stripped.sourceImages[1]!.base64, "b".repeat(1000), "the second angle has no server copy");
  assert.equal(stripped.sourceImages[2]!.base64, "c".repeat(1000), "the third angle has no server copy");
  // Every photo is still addressable either way.
  assert.deepEqual(stripped.sourceImages.map(i => i.uri), ["file:///a.jpg", "file:///b.jpg", "file:///c.jpg"]);
});
