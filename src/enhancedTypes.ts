import { DesignConcept as LegacyConcept, DesignStyle as LegacyStyle } from "./types";
export type ConceptName="Signature"|"Refined"|"Expressive";
export type Priority="Essential"|"High impact"|"Finishing touch";
export type Sort="recommended"|"price-asc"|"price-desc"|"retailer";
export type Filter="All"|Priority;
export type Style=LegacyStyle&{attributes:[string,string,string];description:string};
export type Alternative={id:string;name:string;retailer:string;purchaseUrl:string;imageUrl?:string;unitPrice:number;dimensions?:string;finish?:string;difference:string;available?:boolean;deliveryNote?:string};
export type Item=LegacyConcept["shoppingItems"][number]&{conceptId?:string;imageUrl?:string;dimensions?:string;color?:string;finish?:string;rationale?:string;matchIndicators?:string[];priority?:Priority;availability?:string;lastPriceCheckedAt?:string;lastModifiedAt?:string;isOwned?:boolean;isPurchased?:boolean;isRemoved?:boolean;isStructurallyImportant?:boolean;alternatives?:Alternative[]};
export type RoomAnalysis={roomType:string;proportions:string;focalPoints:string[];lighting:string;retainedElements:string[];circulation:string;confidence:string};
export type Report={designDirection:string;layoutAndCirculation:string;colorAndMaterials:string;lighting:string;scaleAndProportion:string;retainedElements:string;priorityChanges:{highestImpact:string[];nextBest:string[];optional:string[]};designerNotes:string[]};
export type Concept=Omit<LegacyConcept,"shoppingItems">&{conceptId:string;conceptName:ConceptName;conceptDescription:string;materials:string[];layoutSummary:string;roomAnalysis?:RoomAnalysis;designReport:Report;shoppingItems:Item[];generationStatus:"complete"|"partial"|"failed";generatedAt:string;revisionNotes?:string[]};
export type BudgetTier="save"|"balanced"|"invest";
export type FieldFind={id:string;image:{uri:string;base64?:string};notes:string;verdict:"considering"|"fits"|"replace"|"pass";targetItemId?:string;advice:string;createdAt:string};
export type ProgressUpdate={id:string;image:{uri:string;base64?:string};note:string;guidance:string;createdAt:string};
export type Deal={id:string;itemId:string;title:string;retailer:string;price:number;originalPrice:number;url:string;checkedAt:string};
export type Project={projectId:string;roomName?:string;sourceImages:{uri:string;base64?:string}[];selectedStyle?:Style;concepts:Concept[];selectedConceptId?:string;chosenConceptId?:string;approvedConceptId?:string;budgetTier?:BudgetTier;fieldFinds:FieldFind[];progressUpdates:ProgressUpdate[];reminders:string[];deals:Deal[];lastDealCheckAt?:string;comparisonPosition:number;priorityFilter:Filter;sortPreference:Sort;createdAt:string;updatedAt:string};
export type Progress={currentStage:number;completedStages:number[];status:"working"|"delayed"|"complete"|"error";message?:string;error?:string};

