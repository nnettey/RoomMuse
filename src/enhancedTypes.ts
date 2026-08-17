import { DesignConcept as LegacyConcept, DesignStyle as LegacyStyle } from "./types";
export type ConceptName="Signature"|"Refined"|"Expressive";
export type Priority="Essential"|"High impact"|"Finishing touch";
export type Sort="recommended"|"price-asc"|"price-desc"|"retailer";
export type Filter="All"|Priority;
export type Style=LegacyStyle&{attributes:[string,string,string];description:string};
export type Alternative={id:string;name:string;retailer:string;purchaseUrl:string;imageUrl?:string;unitPrice:number;dimensions?:string;finish?:string;difference:string;available?:boolean;availability?:string;deliveryNote?:string;priceStatus?:"verified"|"estimate";lastPriceCheckedAt?:string;budgetTier?:"save"|"balanced"|"invest"};
export type ProductSelection={name:string;retailer:string;purchaseUrl:string;unitPrice:number;dimensions?:string;finish?:string;rationale?:string;availability?:string;priceStatus?:"verified"|"estimate";lastPriceCheckedAt?:string;budgetTier?:"save"|"balanced"|"invest"};
export type Item=LegacyConcept["shoppingItems"][number]&{conceptId?:string;imageUrl?:string;dimensions?:string;color?:string;finish?:string;rationale?:string;matchIndicators?:string[];priority?:Priority;availability?:string;priceStatus?:"verified"|"estimate";lastPriceCheckedAt?:string;budgetTier?:"save"|"balanced"|"invest";lastModifiedAt?:string;isOwned?:boolean;isPurchased?:boolean;isRemoved?:boolean;isStructurallyImportant?:boolean;alternatives?:Alternative[];originalSelection?:ProductSelection;provenance?:Provenance;priceHistory?:PriceObservation[];unresolved?:Unresolved;constraintId?:string};
export type RoomAnalysis={roomType:string;proportions:string;focalPoints:string[];lighting:string;retainedElements:string[];circulation:string;confidence:string};
export type Report={designDirection:string;layoutAndCirculation:string;colorAndMaterials:string;lighting:string;scaleAndProportion:string;retainedElements:string;priorityChanges:{highestImpact:string[];nextBest:string[];optional:string[]};designerNotes:string[]};
export type Concept=Omit<LegacyConcept,"shoppingItems">&{conceptId:string;conceptName:ConceptName;conceptDescription:string;materials:string[];layoutSummary:string;roomAnalysis?:RoomAnalysis;designReport:Report;shoppingItems:Item[];generationStatus:"complete"|"partial"|"failed";generatedAt:string;revisionNotes?:string[]};
export type BudgetTier="save"|"balanced"|"invest";
export type FieldFind={id:string;image:{uri:string;base64?:string};notes:string;verdict:"considering"|"fits"|"replace"|"pass";targetItemId?:string;advice:string;createdAt:string;identified?:IdentifiedProduct;action?:FieldFindAction;replacedItemId?:string;resultingItemId?:string;appliedAt?:string};
export type ProgressUpdate={id:string;image:{uri:string;base64?:string};note:string;guidance:string;createdAt:string};
export type Deal={id:string;itemId:string;title:string;retailer:string;price:number;originalPrice:number;url:string;checkedAt:string;availability?:string;verified?:boolean};
export type Project={projectId:string;roomName?:string;sourceImages:{uri:string;base64?:string;mediaType?:"photo"|"video";videoUri?:string}[];selectedStyle?:Style;concepts:Concept[];selectedConceptId?:string;chosenConceptId?:string;approvedConceptId?:string;budgetTier?:BudgetTier;fieldFinds:FieldFind[];progressUpdates:ProgressUpdate[];reminders:string[];deals:Deal[];lastDealCheckAt?:string;comparisonPosition:number;priorityFilter:Filter;sortPreference:Sort;createdAt:string;updatedAt:string;schemaVersion?:3;status?:ProjectStatus;completedAt?:string;completionSnapshot?:CompletionSnapshot;lastPriceRefreshAt?:string;budget?:Budget;constraints?:Constraint[];favorites?:Favorite[];comparisons?:ComparisonSet[];roomContext?:RoomContext;roomDimensions?:string};
export type Progress={currentStage:number;completedStages:number[];status:"working"|"delayed"|"complete"|"error";message?:string;error?:string};


// ─────────────────────────────────────────────────────────────────────────────
// v2 additions (WS-1). Every field above that references these types is optional,
// so v1/v2 records keep parsing. See docs/CONTRACTS_V2.md for the API contracts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a commercial fact came from. This is the distinction REQ-11 requires between a design
 * recommendation, a discovered product, a verified attribute, a cached value, and a historical one.
 *  generated     – RoomMuse proposed the role/piece; no real product is attached yet
 *  discovered    – a real product was found, but its price or page was not confirmed
 *  verified      – confirmed on the retailer's own product page, with a current price, at a known time
 *  cached        – previously verified; may now be stale
 *  historical    – a superseded observation retained for price history
 *  user-supplied – the user supplied it (in-store photo, manual entry). Never presented as verified.
 * `Item.priceStatus` remains as a coarse alias: "verified" iff provenance === "verified".
 */
export type Provenance="generated"|"discovered"|"verified"|"cached"|"historical"|"user-supplied";
/** One price sighting. Append-only; never overwrite an earlier observation (REQ-7). */
export type PriceObservation={price:number;currency:"USD";observedAt:string;availability?:string;source:Provenance;url?:string};
export type UnresolvedReason="no-match"|"no-verified-price"|"no-direct-product-page"|"search-unavailable";
/** Why a role has no purchasable product. Lets the UI be honest instead of substituting a placeholder. */
export type Unresolved={reason:UnresolvedReason;note:string;lastAttemptedAt:string};

/** The numeric project budget (REQ-2). Distinct from `budgetTier`, which is the substitution strategy. */
export type Budget={total:number;currency:"USD";setAt:string};
export type BudgetCategoryLine={category:string;projected:number;share:number;itemCount:number};
export type CostDriver={itemId:string;name:string;category:string;amount:number;share:number;suggestion?:string};
/** `variance` = budget.total − projectedSpend. Positive is under budget; negative is over. */
export type BudgetSummary={budget?:Budget;projectedSpend:number;remainingToPurchase:number;variance:number;overBudget:boolean;byCategory:BudgetCategoryLine[];costDrivers:CostDriver[]};

export type ConstraintKind="keep-item"|"keep-surface"|"keep-feature"|"no-change";
/**
 * A durable "keep this" decision (REQ-10). Release is an explicit event with its own timestamp —
 * a constraint is never silently dropped, and `releasedAt` preserves that it once existed.
 */
export type Constraint={id:string;kind:ConstraintKind;label:string;targetItemId?:string;scope?:string;createdAt:string;releasedAt?:string;releaseReason?:string};

export type ProjectStatus="in-progress"|"complete";
/** Frozen commercial state captured at completion. Completed projects never auto-refresh (REQ-7). */
export type CompletionSnapshot={completedAt:string;projectTotal:number;items:Array<{itemId:string;name:string;retailer:string;purchaseUrl:string;unitPrice:number;quantity:number;availability?:string;observedAt?:string}>};

export type FavoriteKind="product"|"alternative"|"concept";
export type Favorite={id:string;kind:FavoriteKind;refId:string;conceptId?:string;label:string;createdAt:string};
export type ComparisonSet={id:string;kind:"product"|"concept";refIds:string[];createdAt:string};
export type ComparisonRow={label:string;values:(string|number|undefined)[]};
export type ComparisonResult={kind:"product"|"concept";refIds:string[];rows:ComparisonRow[];tradeoffs:string[]};

export type FieldFindAction="replace"|"add";
/**
 * What vision analysis could establish about a photographed in-store product (REQ-3).
 * Everything is optional on purpose: an unknown dimension or price must stay absent rather than
 * be invented, and `dimensionsConfidence` keeps an inferred size from reading as a measured one.
 */
export type IdentifiedProduct={category?:string;productType?:string;approximateDimensions?:string;dimensionsConfidence?:"measured"|"inferred"|"unknown";compatibility?:string;designImplications?:string[];price?:number;currency?:"USD";priceSource?:"user-entered"|"discovered";retailer?:string;purchaseUrl?:string};

/**
 * Derived room understanding (REQ-4). Shaped to hold either outcome of the S-1 spike without
 * presupposing it: `imagesUsedForRender` and `imagesUsedForAnalysis` are recorded separately so the
 * UI can tell the user exactly what its photos contributed, and `note` carries that wording.
 */
export type RoomContextMode="multi-image"|"single-hero-image";
export type RoomContext={mode:RoomContextMode;imageCount:number;imagesUsedForAnalysis:number;imagesUsedForRender:number;note:string;analysis?:RoomAnalysis;derivedAt:string};
