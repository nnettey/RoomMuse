// Design constraints — "keep this" (REQ-10).
//
// The requirement is specific: a constraint must influence generation AND recommendations, and
// "a later action must not casually override an explicit constraint". So this module is not just
// storage — it is a guard that mutation paths consult before changing a constrained item.
//
// Release is a deliberate, recorded event. A released constraint keeps its row with `releasedAt`
// set rather than being deleted, so the history of the decision survives.
import type { Concept, Constraint, ConstraintKind, Item, Project } from "./enhancedTypes";
import type { ShoppingDecision } from "./domain";

export const isActive = (constraint: Constraint) => !constraint.releasedAt;
export const activeConstraints = (project: Pick<Project, "constraints">) => (project.constraints ?? []).filter(isActive);

/** Constraints that cover a given item, either by explicit target or by matching its name/category. */
export function constraintsForItem(project: Pick<Project, "constraints">, item: Item): Constraint[] {
  const haystack = `${item.name} ${item.category}`.toLowerCase();
  return activeConstraints(project).filter(constraint =>
    constraint.targetItemId === item.id ||
    (constraint.targetItemId === undefined && constraint.kind === "keep-item" && keywords(constraint.label).some(word => haystack.includes(word)))
  );
}

/** Content words from a constraint label, used to match "keep my existing sofa" to a sofa line. */
function keywords(label: string) {
  const stop = new Set(["keep", "my", "the", "existing", "this", "that", "do", "not", "dont", "don't", "change", "our", "a", "an", "and", "please", "retain", "preserve"]);
  return label.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(word => word.length > 2 && !stop.has(word));
}

export type GuardResult = { allowed: boolean; reason?: string; constraint?: Constraint };

/**
 * Whether a change to an item is permitted.
 *
 * Blocks the changes that would defeat the constraint — replacing the product, removing it from
 * the plan, or re-tiering it to something else. Deliberately still allows harmless bookkeeping
 * such as marking it purchased or adjusting quantity: a constraint protects the *choice*, not the
 * user's ability to track it.
 */
export function canModifyItem(project: Pick<Project, "constraints">, item: Item, changes: Partial<Item>): GuardResult {
  const covering = constraintsForItem(project, item)[0];
  if (!covering) return { allowed: true };
  const replacesProduct = ["name", "retailer", "purchaseUrl", "unitPrice", "budgetTier"].some(key => key in changes && (changes as Record<string, unknown>)[key] !== (item as unknown as Record<string, unknown>)[key]);
  const removes = changes.isRemoved === true;
  if (!replacesProduct && !removes) return { allowed: true };
  return {
    allowed: false,
    constraint: covering,
    reason: removes
      ? `“${covering.label}” is an active constraint on this project, so ${item.name} cannot be removed. Release the constraint first if you have changed your mind.`
      : `“${covering.label}” is an active constraint on this project, so ${item.name} cannot be swapped for a different product. Release the constraint first if you have changed your mind.`
  };
}

export const createConstraint = (kind: ConstraintKind, label: string, options: { targetItemId?: string; scope?: string; id?: string; createdAt?: string } = {}): Constraint => ({
  id: options.id ?? `constraint-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  kind,
  label: label.trim(),
  targetItemId: options.targetItemId,
  scope: options.scope,
  createdAt: options.createdAt ?? new Date().toISOString()
});

export const addConstraint = (project: Project, constraint: Constraint): Project => ({
  ...project,
  constraints: [...(project.constraints ?? []), constraint],
  updatedAt: new Date().toISOString()
});

/** Release is explicit and recorded. The constraint row is kept so the decision's history survives. */
export const releaseConstraint = (project: Project, constraintId: string, releaseReason = "Released by the user"): Project => ({
  ...project,
  constraints: (project.constraints ?? []).map(constraint =>
    constraint.id === constraintId && isActive(constraint)
      ? { ...constraint, releasedAt: new Date().toISOString(), releaseReason }
      : constraint),
  updatedAt: new Date().toISOString()
});

/** Items a constraint says to keep should not read as things to buy. */
export function applyConstraintsToConcept(project: Pick<Project, "constraints">, concept: Concept): Concept {
  return {
    ...concept,
    shoppingItems: concept.shoppingItems.map(item => {
      const covering = constraintsForItem(project, item)[0];
      if (!covering) return item.constraintId ? { ...item, constraintId: undefined } : item;
      return { ...item, constraintId: covering.id, isOwned: true, isPurchased: false, rationale: `Retained by your constraint “${covering.label}”. Kept in the design and excluded from the purchase total.` };
    })
  };
}

/** Text handed to the server so generation and product search respect the same decisions. */
export const constraintPrompts = (project: Pick<Project, "constraints">) => activeConstraints(project).map(constraint => constraint.label);

/**
 * The four legacy refine toggles become real, durable constraints.
 * They used to be applied once by refineConcept and then forgotten, which is exactly the
 * "casually overridden" failure REQ-10 names.
 */
export function constraintsFromDecisions(decisions: ShoppingDecision[], now = new Date().toISOString()): Constraint[] {
  const map: Partial<Record<ShoppingDecision, [ConstraintKind, string]>> = {
    "keep-sofa": ["keep-item", "Keep my existing sofa"],
    "keep-chairs": ["keep-item", "Keep my existing chairs"],
    "exclude-art": ["no-change", "Do not include wall art"]
  };
  return decisions
    .map((decision, index) => {
      const entry = map[decision];
      return entry ? createConstraint(entry[0], entry[1], { id: `constraint-${decision}`, createdAt: now }) : undefined;
    })
    .filter((value): value is Constraint => Boolean(value));
}
