import test from "node:test";
import assert from "node:assert/strict";
import { styles, concepts } from "../src/enhancedData";
import { addFieldItem, applyBudget, appendObservation, applyDeal, applyPriceRefresh, canRefreshPrices, compareConcepts, compareProducts, completeProject, createProject, isFavorited, mergePriceHistory, priceMovement, projectStatus, reopenProject, replace, revertSubstitution, selected, substituteItem, toggleFavorite, total, updateItem } from "../src/domain";
import { budgetSummary, closesGap, costDrivers, planTotals, projectedSpend, suggestSubstitutions } from "../src/budget";
import { addConstraint, canModifyItem, constraintsFromDecisions, createConstraint, applyConstraintsToConcept, constraintPrompts, releaseConstraint } from "../src/constraints";
import type { Alternative, Item, PriceObservation, Project } from "../src/enhancedTypes";

const style = styles[0]!;
const at = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();

function verified(id: string, name: string, price: number, category = "Furniture", alternatives: Alternative[] = []): Item {
  return {
    id, name, category, description: name, quantity: 1, unitPrice: price,
    retailer: "West Elm", purchaseUrl: "https://www.westelm.com/products/" + id + "/",
    priceStatus: "verified", provenance: "verified", lastPriceCheckedAt: at(1), alternatives,
    priceHistory: [{ price, currency: "USD", observedAt: at(1), source: "verified" }],
    // Mirror what normalizeItem produces, so assertions can be strict about these flags.
    isOwned: false, isPurchased: false, isRemoved: false
  } as Item;
}
const cheaper = (id: string, price: number): Alternative => ({
  id, name: "Budget " + id, retailer: "Wayfair", purchaseUrl: "https://www.wayfair.com/furniture/pdp/" + id + ".html",
  unitPrice: price, difference: "Save tier", priceStatus: "verified", lastPriceCheckedAt: at(1), budgetTier: "save"
});
function projectWith(items: Item[]): Project {
  const base = createProject(style, []);
  return replace(base, { ...selected(base)!, shoppingItems: items });
}

// ── Budget (REQ-2) ───────────────────────────────────────────────────────────
test("projected spend excludes owned and removed pieces but keeps purchased ones", () => {
  const items = [verified("a", "Sofa", 1000), { ...verified("b", "Rug", 500), isOwned: true }, { ...verified("c", "Lamp", 200), isRemoved: true }, { ...verified("d", "Art", 300), isPurchased: true }];
  assert.equal(projectedSpend(items), 1300);
});
test("variance is positive under budget and negative over it", () => {
  const items = [verified("a", "Sofa", 1000)];
  assert.equal(budgetSummary(items, { total: 1500, currency: "USD", setAt: at(1) }).variance, 500);
  const over = budgetSummary(items, { total: 800, currency: "USD", setAt: at(1) });
  assert.equal(over.variance, -200);
  assert.equal(over.overBudget, true);
});
test("category rollup shares sum to one and are ordered by spend", () => {
  const items = [verified("a", "Sofa", 1000), verified("b", "Lamp", 200, "Lighting"), verified("c", "Rug", 800, "Textiles")];
  const lines = budgetSummary(items).byCategory;
  assert.equal(lines[0]!.category, "Furniture");
  assert.ok(Math.abs(lines.reduce((s, l) => s + l.share, 0) - 1) < 1e-9);
});
test("cost drivers are ranked by spend and only suggest verified cheaper alternatives", () => {
  const items = [verified("a", "Sofa", 1000, "Furniture", [cheaper("alt", 600)]), verified("b", "Lamp", 200, "Lighting")];
  const drivers = costDrivers(items);
  assert.equal(drivers[0]!.itemId, "a");
  assert.match(drivers[0]!.suggestion ?? "", /save about \$400/);
  assert.equal(drivers[1]!.suggestion, undefined, "an item with no alternative must not imply one exists");
});
test("substitutions stop as soon as the plan fits, and never touch protected items", () => {
  const items = [verified("a", "Sofa", 1000, "Furniture", [cheaper("s1", 400)]), verified("b", "Table", 900, "Furniture", [cheaper("s2", 500)])];
  const budget = { total: 1600, currency: "USD" as const, setAt: at(1) };
  const swaps = suggestSubstitutions(items, budget);
  assert.equal(swaps.length, 1, "only as many swaps as the gap requires");
  assert.equal(swaps[0]!.itemId, "a", "largest saving first");
  assert.equal(closesGap(items, budget, swaps), true);
  assert.equal(suggestSubstitutions(items, budget, ["a"]).some(s => s.itemId === "a"), false);
});
test("an unverified or search-page alternative is never offered as a saving", () => {
  const bad: Alternative = { id: "x", name: "Unverified", retailer: "R", purchaseUrl: "https://www.homedepot.com/s/sofa", unitPrice: 10, difference: "cheap", priceStatus: "verified" };
  const estimate: Alternative = { id: "y", name: "Estimate", retailer: "R", purchaseUrl: "https://www.westelm.com/products/y/", unitPrice: 10, difference: "cheap", priceStatus: "estimate" };
  const items = [verified("a", "Sofa", 1000, "Furniture", [bad, estimate])];
  assert.equal(suggestSubstitutions(items, { total: 100, currency: "USD", setAt: at(1) }).length, 0);
});

// ── Constraints (REQ-10) ─────────────────────────────────────────────────────
test("a constraint blocks swapping or removing the item it protects", () => {
  const item = verified("a", "Performance linen sofa", 1000);
  const project = addConstraint(projectWith([item]), createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  assert.equal(canModifyItem(project, item, { isRemoved: true }).allowed, false);
  assert.equal(canModifyItem(project, item, { name: "Other sofa", unitPrice: 20 }).allowed, false);
  assert.match(canModifyItem(project, item, { isRemoved: true }).reason ?? "", /Keep my existing sofa/);
});
test("a constraint still allows bookkeeping such as quantity and purchased", () => {
  const item = verified("a", "Performance linen sofa", 1000);
  const project = addConstraint(projectWith([item]), createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  assert.equal(canModifyItem(project, item, { isPurchased: true }).allowed, true);
  assert.equal(canModifyItem(project, item, { quantity: 2 }).allowed, true);
});
test("release is explicit, recorded, and only then unblocks the item", () => {
  const item = verified("a", "Performance linen sofa", 1000);
  let project = addConstraint(projectWith([item]), createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  project = releaseConstraint(project, "c1", "Changed my mind");
  assert.equal(canModifyItem(project, item, { isRemoved: true }).allowed, true);
  const released = (project.constraints ?? [])[0]!;
  assert.ok(released.releasedAt, "the constraint row is kept with a release time, not deleted");
  assert.equal(released.releaseReason, "Changed my mind");
});
test("applyBudget cannot re-tier a constrained item", () => {
  const item = verified("a", "Performance linen sofa", 1000, "Furniture", [cheaper("s1", 200)]);
  const project = addConstraint(projectWith([item]), createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  const budgeted = applyBudget(project, "save");
  assert.equal(selected(budgeted)!.shoppingItems[0]!.name, "Performance linen sofa", "a keep-this decision must survive a budget change");
});
test("constrained items are marked owned and excluded from the purchase total", () => {
  const project = addConstraint(projectWith([verified("a", "Performance linen sofa", 1000), verified("b", "Rug", 500, "Textiles")]), createConstraint("keep-item", "Keep my existing sofa", { id: "c1" }));
  const concept = applyConstraintsToConcept(project, selected(project)!);
  assert.equal(concept.shoppingItems[0]!.isOwned, true);
  assert.equal(concept.shoppingItems[0]!.constraintId, "c1");
  assert.equal(concept.shoppingItems[1]!.isOwned, false);
  assert.equal(projectedSpend(concept.shoppingItems), 500);
});
test("legacy refine decisions become durable constraints and reach the server prompt", () => {
  const project = constraintsFromDecisions(["keep-sofa", "exclude-art"]).reduce(addConstraint, projectWith([verified("a", "Sofa", 1000)]));
  assert.equal(constraintPrompts(project).length, 2);
  assert.match(constraintPrompts(project).join(" "), /Keep my existing sofa/);
});

// ── Price history and lifecycle (REQ-7) ──────────────────────────────────────
test("price history is append-only, de-duplicated and ordered", () => {
  const a: PriceObservation = { price: 100, currency: "USD", observedAt: at(2), source: "verified" };
  const b: PriceObservation = { price: 90, currency: "USD", observedAt: at(1), source: "verified" };
  const merged = mergePriceHistory([a], [b, a]);
  assert.deepEqual(merged.map(o => o.price), [90, 100]);
});
test("a new observation preserves the previous one and reports the change", () => {
  const item = appendObservation(verified("a", "Sofa", 1000), { price: 1200, currency: "USD", observedAt: at(5), source: "verified", availability: "In stock" });
  assert.equal(item.unitPrice, 1200);
  assert.equal(item.priceHistory!.length, 2, "the old price is kept, not overwritten");
  const movement = priceMovement({ ...item, quantity: 2 });
  assert.equal(movement.previous!.price, 1000);
  assert.equal(movement.changeAmount, 200);
  assert.equal(Math.round(movement.changePercent * 100), 20);
  assert.equal(movement.totalEffect, 400, "the effect on the project total accounts for quantity");
});
test("a completed project snapshots its prices and refuses refreshes", () => {
  const project = completeProject(projectWith([verified("a", "Sofa", 1000)]));
  assert.equal(projectStatus(project), "complete");
  assert.equal(canRefreshPrices(project), false);
  assert.equal(project.completionSnapshot!.projectTotal, 1000);
  const attempted = applyPriceRefresh(project, selected(project)!.id, [{ itemId: "a", observation: { price: 5000, currency: "USD", observedAt: at(9), source: "verified" } }]);
  assert.equal(selected(attempted)!.shoppingItems[0]!.unitPrice, 1000, "a completed project must not be silently repriced");
});
test("an in-progress project accepts a refresh and reopening preserves the snapshot", () => {
  const refreshed = applyPriceRefresh(projectWith([verified("a", "Sofa", 1000)]), selected(projectWith([verified("a", "Sofa", 1000)]))!.id, []);
  assert.equal(canRefreshPrices(refreshed), true);
  const reopened = reopenProject(completeProject(projectWith([verified("a", "Sofa", 1000)])));
  assert.equal(projectStatus(reopened), "in-progress");
  assert.ok(reopened.completionSnapshot, "the completion snapshot survives reopening");
});

// ── Substitution and addition (REQ-3) ────────────────────────────────────────
test("substituting a photographed product keeps the role and recomputes the total", () => {
  const project = projectWith([verified("a", "Sofa", 1000), verified("b", "Rug", 500, "Textiles")]);
  const concept = substituteItem(selected(project)!, "a", { name: "Floor model sectional", price: 700, priceSource: "user-entered", approximateDimensions: "96 in W", dimensionsConfidence: "inferred" });
  const item = concept.shoppingItems[0]!;
  assert.equal(item.id, "a", "the item keeps its identity so the plan position is preserved");
  assert.equal(item.category, "Furniture");
  assert.equal(item.unitPrice, 700);
  assert.equal(item.provenance, "user-supplied");
  assert.notEqual(item.priceStatus, "verified", "a user-supplied price must never read as verified");
  assert.equal(total(concept.shoppingItems), 1200);
});
test("a substitution is reversible from the recorded original", () => {
  const project = projectWith([verified("a", "Sofa", 1000)]);
  const swapped = substituteItem(selected(project)!, "a", { name: "Floor model", price: 700 });
  const reverted = revertSubstitution(swapped, "a");
  assert.equal(reverted.shoppingItems[0]!.name, "Sofa");
  assert.equal(reverted.shoppingItems[0]!.unitPrice, 1000);
});
test("a photographed product can be added without replacing anything", () => {
  const project = projectWith([verified("a", "Sofa", 1000)]);
  const concept = addFieldItem(selected(project)!, { name: "Brass floor lamp", category: "Lighting", price: 150 });
  assert.equal(concept.shoppingItems.length, 2);
  assert.equal(concept.shoppingItems[1]!.category, "Lighting");
  assert.equal(total(concept.shoppingItems), 1150);
});

// ── Favorites and comparison (REQ-9) ─────────────────────────────────────────
test("favorites toggle on and off", () => {
  let project = projectWith([verified("a", "Sofa", 1000)]);
  project = toggleFavorite(project, { id: "f1", kind: "product", refId: "a", label: "Sofa", createdAt: at(1) });
  assert.equal(isFavorited(project, "a"), true);
  assert.equal(isFavorited(toggleFavorite(project, { id: "f1", kind: "product", refId: "a", label: "Sofa", createdAt: at(1) }), "a"), false);
});
test("product comparison flags an unverified price rather than comparing it as equal", () => {
  const result = compareProducts([verified("a", "Sofa", 1000), { ...verified("b", "Other sofa", 900), provenance: "generated", priceStatus: "estimate" }]);
  assert.ok(result.rows.some(r => r.label === "Budget impact"));
  assert.match(result.tradeoffs.join(" "), /no verified retailer price/);
});
test("concept comparison reports the cost gap and whether the plans really differ", () => {
  const base = createProject(style, []);
  const a = { ...base.concepts[0]!, shoppingItems: [verified("a", "Sofa", 1000)] };
  const b = { ...base.concepts[1]!, shoppingItems: [verified("b", "Cheaper sofa", 600)] };
  const project = { ...base, concepts: [a, b, base.concepts[2]!] };
  const result = compareConcepts(project, [a.id, b.id]);
  assert.match(result.tradeoffs.join(" "), /costs about \$400 more/);
  assert.match(result.tradeoffs.join(" "), /share no products/);
});

// ---------------------------------------------------------------------------------------------
// F6: the shopping plan showed "estimated project total" from domain.total(), which counts pieces
// the user already owns, while "remaining to purchase" excluded them. Changing the quantity of an
// owned or already-bought item therefore moved one figure and not the other. Both figures now come
// from the same predicate set, so the two must move together or not at all.
test("both headline figures respond to a quantity change on the same item", () => {
  const items = [verified("a", "Sofa", 1000), verified("b", "Rug", 500)];
  const before = planTotals(items);
  const after = planTotals([{ ...items[0]!, quantity: 2 }, items[1]!]);
  assert.equal(before.estimatedTotal, 1500);
  assert.equal(before.remainingToPurchase, 1500);
  assert.equal(after.estimatedTotal, 2500);
  assert.equal(after.remainingToPurchase, 2500);
});

test("an owned item is excluded from both figures, not just one of them", () => {
  const owned = { ...verified("a", "Existing sofa", 1000), isOwned: true } as Item;
  const items = [owned, verified("b", "Rug", 500)];
  const totals = planTotals(items);
  // The old estimated total would have read 1500 here while remaining read 500 — the F6 symptom.
  assert.equal(totals.estimatedTotal, 500);
  assert.equal(totals.remainingToPurchase, 500);
  assert.equal(totals.alreadyOwned, 1000);
  // And raising its quantity must not move either figure, because no money is involved.
  const raised = planTotals([{ ...owned, quantity: 3 } as Item, items[1]!]);
  assert.equal(raised.estimatedTotal, 500);
  assert.equal(raised.remainingToPurchase, 500);
});

test("a purchased item leaves remaining but stays in the estimated total", () => {
  const items = [{ ...verified("a", "Sofa", 1000), isPurchased: true } as Item, verified("b", "Rug", 500)];
  const totals = planTotals(items);
  assert.equal(totals.estimatedTotal, 1500);
  assert.equal(totals.remainingToPurchase, 500);
  assert.equal(totals.alreadyPurchased, 1000);
});

// F12: the priority chips filtered the list but not the numbers, so narrowing to "Essential" left
// the totals describing the whole plan and could not inform the decision the filter exists for.
test("the priority filter narrows both headline figures and the item count", () => {
  const items = [
    { ...verified("a", "Sofa", 1000), priority: "Essential" } as Item,
    { ...verified("b", "Rug", 500), priority: "High impact" } as Item,
    { ...verified("c", "Vase", 80), priority: "Finishing touch" } as Item
  ];
  assert.equal(planTotals(items, "All").estimatedTotal, 1580);
  assert.equal(planTotals(items, "All").itemCount, 3);
  const essential = planTotals(items, "Essential");
  assert.equal(essential.estimatedTotal, 1000);
  assert.equal(essential.remainingToPurchase, 1000);
  assert.equal(essential.itemCount, 1);
  assert.equal(essential.filter, "Essential");
});

test("budgetSummary reports variance against the filtered slice it is asked about", () => {
  const items = [
    { ...verified("a", "Sofa", 1000), priority: "Essential" } as Item,
    { ...verified("b", "Rug", 500), priority: "Finishing touch" } as Item
  ];
  const budget = { total: 1200, currency: "USD" as const, setAt: at(1) };
  const all = budgetSummary(items, budget);
  assert.equal(all.projectedSpend, 1500);
  assert.equal(all.overBudget, true);
  assert.equal(all.variance, -300);
  const essentialOnly = budgetSummary(items, budget, "Essential");
  assert.equal(essentialOnly.projectedSpend, 1000);
  assert.equal(essentialOnly.overBudget, false);
  assert.equal(essentialOnly.variance, 200);
});

// A removed item is out of the plan entirely, whatever the filter says.
test("removed items are absent from every figure", () => {
  const items = [verified("a", "Sofa", 1000), { ...verified("b", "Rug", 500), isRemoved: true } as Item];
  const totals = planTotals(items);
  assert.equal(totals.estimatedTotal, 1000);
  assert.equal(totals.remainingToPurchase, 1000);
  assert.equal(totals.itemCount, 1);
});

// ---------------------------------------------------------------------------------------------
// F17 — "Check shopping deals" was display-only: it stored project.deals and never touched a price,
// so a better verified price never reached the shopping list or the remaining-to-purchase figure.
const dealAlternative = (price: number): Alternative => ({
  id: "alt-deal", name: "Haven compact linen sofa", retailer: "Wayfair",
  purchaseUrl: "https://www.wayfair.com/furniture/pdp/haven-sofa-w001.html",
  unitPrice: price, dimensions: "80 in W", finish: "Linen", difference: "Balanced tier verified product",
  available: true, availability: "In stock", priceStatus: "verified", lastPriceCheckedAt: at(5),
  budgetTier: "balanced", provenance: "verified"
} as Alternative);

function projectWithDeal(price = 899) {
  const base = createProject(style, []);
  const item = { ...verified("sofa", "Fielding sofa", 1299), alternatives: [dealAlternative(price)] } as Item;
  return replace(base, { ...selected(base)!, shoppingItems: [item] });
}

test("taking a deal moves the price, the plan total and the remaining figure", () => {
  const project = projectWithDeal();
  const conceptId = selected(project)!.id;
  assert.equal(planTotals(selected(project)!.shoppingItems).remainingToPurchase, 1299);
  const next = applyDeal(project, conceptId, "sofa", dealAlternative(899));
  const item = selected(next)!.shoppingItems[0]!;
  assert.equal(item.unitPrice, 899);
  assert.equal(item.name, "Haven compact linen sofa");
  assert.equal(planTotals(selected(next)!.shoppingItems).estimatedTotal, 899);
  assert.equal(planTotals(selected(next)!.shoppingItems).remainingToPurchase, 899);
});

test("taking a deal records the price change rather than overwriting it", () => {
  const project = projectWithDeal();
  const next = applyDeal(project, selected(project)!.id, "sofa", dealAlternative(899));
  const history = selected(next)!.shoppingItems[0]!.priceHistory ?? [];
  // Append-only: the price it was, and the price it became, each identified by its own url.
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(o => o.price).sort((a, b) => a - b), [899, 1299]);
  const applied = history.find(o => o.price === 899)!;
  assert.equal(applied.source, "verified");
  assert.equal(applied.url, "https://www.wayfair.com/furniture/pdp/haven-sofa-w001.html");
});

test("a deal is refused for a piece already purchased or owned, and for a completed project", () => {
  const purchased = (() => { const p = projectWithDeal(); const c = selected(p)!; return replace(p, { ...c, shoppingItems: [{ ...c.shoppingItems[0]!, isPurchased: true }] }); })();
  assert.equal(selected(applyDeal(purchased, selected(purchased)!.id, "sofa", dealAlternative(899)))!.shoppingItems[0]!.unitPrice, 1299);
  const owned = (() => { const p = projectWithDeal(); const c = selected(p)!; return replace(p, { ...c, shoppingItems: [{ ...c.shoppingItems[0]!, isOwned: true }] }); })();
  assert.equal(selected(applyDeal(owned, selected(owned)!.id, "sofa", dealAlternative(899)))!.shoppingItems[0]!.unitPrice, 1299);
  const done = completeProject(projectWithDeal());
  assert.equal(selected(applyDeal(done, selected(done)!.id, "sofa", dealAlternative(899)))!.shoppingItems[0]!.unitPrice, 1299);
});

test("a deal that is not actually cheaper is refused", () => {
  const project = projectWithDeal(1400);
  const next = applyDeal(project, selected(project)!.id, "sofa", dealAlternative(1400));
  assert.equal(selected(next)!.shoppingItems[0]!.unitPrice, 1299);
});
