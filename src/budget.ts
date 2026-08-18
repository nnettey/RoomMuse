// Budget intelligence (REQ-2).
//
// Pure functions only — no fetch, no storage, no components. Screens call these rather than
// recomputing money in a component, so every surface agrees on what the numbers mean.
//
// Definitions, fixed here so they mean the same thing everywhere:
//   planTotal           every piece in the plan, including ones the user already owns
//   projectedSpend      money actually leaving the user's pocket: excludes owned and removed
//   remainingToPurchase projectedSpend minus what is already bought
//   variance            budget.total − projectedSpend. POSITIVE is under budget, negative is over.
import { isDirectProductUrl } from "./productLinks";
import type { Budget, BudgetCategoryLine, BudgetSummary, CostDriver, Filter, Item } from "./enhancedTypes";

const lineTotal = (item: Item) => item.unitPrice * Math.max(0, item.quantity);
const inPlan = (item: Item) => !item.isRemoved;
const isSpend = (item: Item) => inPlan(item) && !item.isOwned;

export const planTotal = (items: Item[]) => items.filter(inPlan).reduce((sum, item) => sum + lineTotal(item), 0);
export const projectedSpend = (items: Item[]) => items.filter(isSpend).reduce((sum, item) => sum + lineTotal(item), 0);
export const remainingToPurchase = (items: Item[]) =>
  items.filter(item => isSpend(item) && !item.isPurchased && !item.checked).reduce((sum, item) => sum + lineTotal(item), 0);
/** Money already spent on this plan: bought pieces the user is not buying again. */
export const alreadyPurchased = (items: Item[]) =>
  items.filter(item => isSpend(item) && (item.isPurchased || item.checked)).reduce((sum, item) => sum + lineTotal(item), 0);
/** What the user already owns and is keeping. Counted in the plan, never in what they will spend. */
export const alreadyOwned = (items: Item[]) =>
  items.filter(item => inPlan(item) && item.isOwned).reduce((sum, item) => sum + lineTotal(item), 0);

/** The priority filter the shopping plan applies to its list. Kept next to arrange() in domain.ts. */
const matchesFilter = (item: Item, filter: Filter) => filter === "All" || item.priority === filter;
export const applyFilter = (items: Item[], filter: Filter = "All") => items.filter(item => matchesFilter(item, filter));

export type PlanTotals = {
  estimatedTotal: number;
  remainingToPurchase: number;
  alreadyPurchased: number;
  alreadyOwned: number;
  itemCount: number;
  filter: Filter;
};

/**
 * The one place a screen gets the two headline figures.
 *
 * Both are derived from the SAME predicate set, which is the fix for F6: the shopping plan used to
 * take its "estimated project total" from domain.total(), which counts pieces the user already
 * owns, while "remaining to purchase" excluded them. Changing the quantity of an owned or
 * already-bought item therefore moved the top number and not the bottom one. Here the estimated
 * total is projected spend — money that will actually leave the user's pocket — so the two figures
 * can never disagree again.
 *
 * The filter argument is F12: when the user narrows the plan to a priority band, the totals must
 * describe the band they are looking at, otherwise the figures cannot inform the decision the
 * filter exists to support.
 */
export function planTotals(items: Item[], filter: Filter = "All"): PlanTotals {
  const scoped = applyFilter(items, filter);
  return {
    estimatedTotal: projectedSpend(scoped),
    remainingToPurchase: remainingToPurchase(scoped),
    alreadyPurchased: alreadyPurchased(scoped),
    alreadyOwned: alreadyOwned(scoped),
    itemCount: scoped.filter(inPlan).length,
    filter
  };
}

/** An alternative is only usable as a substitution if it is a verified product on a real product page. */
const usableAlternative = (item: Item) =>
  (item.alternatives ?? [])
    .filter(a => a.priceStatus === "verified" && isDirectProductUrl(a.purchaseUrl) && a.unitPrice < item.unitPrice)
    .sort((a, b) => a.unitPrice - b.unitPrice)[0];

export function byCategory(items: Item[]): BudgetCategoryLine[] {
  const spend = projectedSpend(items);
  const totals = new Map<string, { projected: number; itemCount: number }>();
  for (const item of items.filter(isSpend)) {
    const line = totals.get(item.category) ?? { projected: 0, itemCount: 0 };
    line.projected += lineTotal(item);
    line.itemCount += 1;
    totals.set(item.category, line);
  }
  return [...totals.entries()]
    .map(([category, line]) => ({ category, projected: line.projected, itemCount: line.itemCount, share: spend > 0 ? line.projected / spend : 0 }))
    .sort((a, b) => b.projected - a.projected);
}

/**
 * The pieces actually driving the cost, largest first, each with a concrete substitution where a
 * cheaper verified product exists. REQ-2 asks for the drivers *and* a way to act on them, so a
 * driver without a real alternative says so rather than implying one is available.
 */
export function costDrivers(items: Item[], limit = 5): CostDriver[] {
  const spend = projectedSpend(items);
  return items
    .filter(isSpend)
    .sort((a, b) => lineTotal(b) - lineTotal(a))
    .slice(0, limit)
    .map(item => {
      const cheaper = usableAlternative(item);
      const saving = cheaper ? lineTotal(item) - cheaper.unitPrice * Math.max(0, item.quantity) : 0;
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        amount: lineTotal(item),
        share: spend > 0 ? lineTotal(item) / spend : 0,
        suggestion: cheaper
          ? `Swap to ${cheaper.name} at ${cheaper.retailer} to save about $${Math.round(saving)} while keeping this ${item.category.toLowerCase()} role.`
          : undefined
      };
    });
}

export function budgetSummary(items: Item[], budget?: Budget, filter: Filter = "All"): BudgetSummary {
  const scoped = applyFilter(items, filter);
  const spend = projectedSpend(scoped);
  const total = Number(budget?.total) > 0 ? Number(budget!.total) : undefined;
  return {
    budget,
    projectedSpend: spend,
    remainingToPurchase: remainingToPurchase(scoped),
    variance: total === undefined ? 0 : total - spend,
    overBudget: total !== undefined && spend > total,
    byCategory: byCategory(scoped),
    costDrivers: costDrivers(scoped)
  };
}

export type Substitution = { itemId: string; from: string; to: string; retailer: string; purchaseUrl: string; saving: number; newUnitPrice: number };

/**
 * The cheapest route back to budget that preserves the design.
 *
 * Substitutions are taken largest-saving first and stop as soon as the plan fits, so the user is
 * asked to give up as little as possible. Only verified products on real product pages are
 * offered, and constrained or owned items are never touched — a "keep my sofa" decision must not
 * be quietly undone to hit a number (REQ-10).
 */
export function suggestSubstitutions(items: Item[], budget?: Budget, protectedItemIds: string[] = []): Substitution[] {
  const total = Number(budget?.total) > 0 ? Number(budget!.total) : undefined;
  if (total === undefined) return [];
  let gap = projectedSpend(items) - total;
  if (gap <= 0) return [];
  const protectedIds = new Set(protectedItemIds);
  const candidates = items
    .filter(item => isSpend(item) && !item.isPurchased && !protectedIds.has(item.id) && !item.constraintId)
    .map(item => {
      const cheaper = usableAlternative(item);
      if (!cheaper) return undefined;
      const quantity = Math.max(0, item.quantity);
      return { itemId: item.id, from: item.name, to: cheaper.name, retailer: cheaper.retailer, purchaseUrl: cheaper.purchaseUrl, newUnitPrice: cheaper.unitPrice, saving: lineTotal(item) - cheaper.unitPrice * quantity };
    })
    .filter((value): value is Substitution => Boolean(value) && value!.saving > 0)
    .sort((a, b) => b.saving - a.saving);

  const chosen: Substitution[] = [];
  for (const candidate of candidates) {
    if (gap <= 0) break;
    chosen.push(candidate);
    gap -= candidate.saving;
  }
  return chosen;
}

/** Whether the offered substitutions actually close the gap, so the UI can be honest when they do not. */
export function closesGap(items: Item[], budget?: Budget, substitutions?: Substitution[]) {
  const total = Number(budget?.total) > 0 ? Number(budget!.total) : undefined;
  if (total === undefined) return true;
  const saved = (substitutions ?? []).reduce((sum, s) => sum + s.saving, 0);
  return projectedSpend(items) - saved <= total;
}
