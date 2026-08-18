# RoomMuse v2 contracts

Companion to `docs/CURRENT_CONTRACTS.md`, which describes the v1 surface and still holds. Everything here is
**additive**: existing requests, responses, and stored records keep working unchanged. Types live in
`src/enhancedTypes.ts` and are frozen — changes require a request in `docs/plan/COORDINATION.md` §8.

## Compatibility rules

1. Every new field is optional at the read boundary and has a safe default.
2. No existing field is renamed, retyped, or removed.
3. `Item.priceStatus` stays as a coarse alias for `Item.provenance` (`"verified"` iff provenance is `"verified"`).
   Existing UI (`EnhancedScreens.tsx:135`) and tests read it and must keep working.
4. `roommuse.project.v2` and the legacy `roommuse.concept` storage keys stay readable and are never deleted.
5. A client that ignores every v2 field still functions.

## Provenance and price history (REQ-7, REQ-11)

`Provenance` distinguishes a design recommendation from a discovered product, a verified attribute, a cached
value, a historical value, and something the user supplied. `PriceObservation[]` on `Item.priceHistory` is
**append-only**: a refresh adds an observation, it never overwrites one. `Unresolved` records why a role has no
purchasable product, so the UI can say so instead of substituting a placeholder.

**Hard rule, and the reason these types exist:** nothing may be presented as verified unless it was confirmed on
the retailer's own product page with a current price at a recorded time. `user-supplied` is never verified.

## Data model additions

| Type | Attaches to | Requirement |
|---|---|---|
| `Provenance`, `PriceObservation`, `Unresolved` | `Item.provenance`, `Item.priceHistory`, `Item.unresolved` | 1, 7, 11 |
| `Budget`, `BudgetSummary`, `BudgetCategoryLine`, `CostDriver` | `Project.budget`; summary is computed, not stored | 2 |
| `Constraint`, `ConstraintKind` | `Project.constraints`, `Item.constraintId` | 10 |
| `ProjectStatus`, `CompletionSnapshot` | `Project.status`, `.completedAt`, `.completionSnapshot`, `.lastPriceRefreshAt` | 7 |
| `Favorite`, `ComparisonSet`, `ComparisonResult` | `Project.favorites`, `Project.comparisons` | 9 |
| `IdentifiedProduct`, `FieldFindAction` | `FieldFind.identified`, `.action`, `.replacedItemId`, `.resultingItemId` | 3 |
| `RoomContext` | `Project.roomContext`, `Project.roomDimensions` | 4 |

`Project.budgetTier` (`save|balanced|invest`) is **not** the budget. It is the substitution strategy used to move
a plan toward `Project.budget.total`. Both coexist.

`BudgetSummary.variance` = `budget.total − projectedSpend`. Positive is under budget, negative is over.

## HTTP API

Existing and unchanged: `GET /health`, `POST /api/refine`, `GET /designs/:file`, `GET|PUT /api/projects/:id`
(the last now round-trips the v2 project fields).

### `POST /api/design`

Request gains optional fields. **The existing `{imageBase64, style}` request must keep working.**

```jsonc
{
  "imageBase64":  "…",            // existing
  "imageBase64s": ["…"],          // existing, up to 3
  "style":        "Modern",       // existing
  "budget":         { "total": 8000, "currency": "USD" },   // new, optional
  "constraints":    [ { "kind": "keep-item", "label": "Keep my existing sofa" } ],  // new, optional
  "roomDimensions": "12 ft x 16 ft",                        // new, optional, free text
  "retainedItems":  ["sofa", "dining table"]                // new, optional
}
```

Response keeps its current shape (legacy concept + `roomAnalysis` + `designReport` + `variants`) and may add
`roomContext`. **Product resolution moves out of this endpoint** — see `/api/shopping-plan` and decision A2.
`shoppingItems` may therefore be absent or empty here, which is a normal outcome, not an error.

### `POST /api/shopping-plan` (new)

Called after the user selects a variation, so the plan can be specific to that concept, the budget, and the
constraints — the four requirements decision A2 resolves at once.

Request: `{ projectId, conceptId, conceptName, style, roomAnalysis, budget?, constraints?, retainedItems?, roomDimensions? }`
Response: `{ conceptId, items: Item[], resolvedAt, unresolvedCount }`

- Every item carries `provenance` and, where verified, an initial `priceHistory` entry.
- An item that could not be resolved carries `unresolved` and **no** `purchaseUrl`.
- Returning zero resolved items is a valid response. The client renders an honest empty plan.

### `POST /api/prices/refresh` (new) — REQ-7

Request: `{ projectId, conceptId, itemIds? }`
Response: `{ refreshedAt, results: [ { itemId, previous: PriceObservation, current: PriceObservation, changeAmount, changePercent, availabilityChanged } ], failed: [ { itemId, reason } ] }`

- **Refuses a project whose status is `complete`**, with an explicit error. Enforced here *and* in the domain.
- Appends observations; never overwrites.
- Partial success is normal and reported honestly in `failed`.

### `POST /api/identify-product` (new) — REQ-3

Request: `{ imageBase64, conceptId, targetItemId?, action: "replace" | "add", userNotes?, userPrice? }`
Response: `{ identified: IdentifiedProduct, compatibility, designImplications[], confidence }`

Never invents a dimension or a price. An unknown value is omitted, and an inferred dimension is marked
`dimensionsConfidence: "inferred"` so it cannot be mistaken for a measurement.

## Storage: `roommuse.project.v3`

- New key `roommuse.project.v3`; `Project.schemaVersion = 3`.
- Migration is additive and idempotent: v2 → v3 sets `schemaVersion`, defaults `status` to `"in-progress"`, and
  leaves every existing field alone. v1 (`roommuse.concept`) migrates through the existing normalizer first.
- `roommuse.project.v2` and `roommuse.concept` are **not** deleted, preserving the existing rollback path.
- `priceHistory` merges as a **union** across replicas, not last-write-wins — an append-only log must not lose
  observations to a sync conflict.
