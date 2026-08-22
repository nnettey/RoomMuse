import {concepts as demoConcepts,styles} from "./enhancedData";import {Alternative,Concept,ConceptName,Filter,Item,Priority,Progress,Project,Report,RoomAnalysis,Sort,Style} from "./enhancedTypes";import {DesignConcept as LegacyConcept} from "./types";import{assetUrl}from"./assetUrl";import{isDirectProductUrl}from"./productLinks";
export const STAGES=["Analyzing room proportions","Identifying existing furniture","Evaluating lighting and focal points","Building the color and material palette","Creating the room layout","Selecting coordinated pieces","Matching real products","Preparing your shopping plan"] as const;
export function progress(ms:number,ready=false,error?:string):Progress{
  const stage=Math.min(ready?7:6,Math.floor(ms/700));
  const completedStages=Array.from({length:stage},(_,i)=>i);
  if(error)return{currentStage:stage,completedStages,status:"error",error};
  return{
    currentStage:stage,
    completedStages,
    status:ready&&stage===7?"complete":ms>30000?"delayed":"working",
    message:ms>30000&&!ready?"Your room is taking a little longer to compose. We\u2019re still working.":undefined
  };
}export const itemTotal=(i:Item)=>i.unitPrice*Math.max(0,i.quantity);
export const total=(items:Item[])=>items.filter(i=>!i.isRemoved).reduce((s,i)=>s+itemTotal(i),0);
export const remaining=(items:Item[])=>items.filter(i=>!i.isRemoved&&!i.isOwned&&!i.isPurchased&&!i.checked).reduce((s,i)=>s+itemTotal(i),0);
export const updateItem=(c:Concept,id:string,x:Partial<Item>):Concept=>({...c,shoppingItems:c.shoppingItems.map(i=>i.id===id?{...i,...x,lastModifiedAt:new Date().toISOString()}:i)});
export const swapItem=(c:Concept,id:string,a:Alternative)=>updateItem(c,id,{name:a.name,retailer:a.retailer,purchaseUrl:a.purchaseUrl,unitPrice:a.unitPrice,dimensions:a.dimensions,finish:a.finish,availability:a.availability,priceStatus:a.priceStatus,lastPriceCheckedAt:a.lastPriceCheckedAt,budgetTier:a.budgetTier,rationale:"This alternative preserves the item's functional role and category while offering a "+a.difference.toLowerCase()+". Confirm retailer specifications before ordering."});
const order:Record<string,number>={Finishes:0,Furniture:1,Textiles:2,Lighting:3,"Window treatments":4,Art:5,Decor:6};const priority:Record<Priority,number>={Essential:0,"High impact":1,"Finishing touch":2};
export function arrange(items:Item[],filter:Filter="All",sort:Sort="recommended"){return items.filter(i=>!i.isRemoved&&(filter==="All"||i.priority===filter)).slice().sort((a,b)=>sort==="price-asc"?itemTotal(a)-itemTotal(b):sort==="price-desc"?itemTotal(b)-itemTotal(a):sort==="retailer"?a.retailer.localeCompare(b.retailer):(order[a.category]??99)-(order[b.category]??99)||(priority[a.priority??"Finishing touch"]-priority[b.priority??"Finishing touch"]));}
export function rank(items:Alternative[],budget?:number){return items.slice().sort((a,b)=>Number(b.available===true)-Number(a.available===true)||Number(!!b.dimensions)-Number(!!a.dimensions)||(budget?Math.abs(a.unitPrice-budget)-Math.abs(b.unitPrice-budget):a.unitPrice-b.unitPrice)).slice(0,6);}
const fallback=(style:string):Report=>({designDirection:"A considered "+style+" direction composed for this room.",layoutAndCirculation:"The furniture plan keeps the primary walking path open.",colorAndMaterials:"A restrained palette coordinates warm neutrals and natural materials.",lighting:"Layer ambient and task lighting around the available daylight.",scaleAndProportion:"Confirm final dimensions in the room before ordering.",retainedElements:"Existing architectural openings and flooring remain part of the plan.",priorityChanges:{highestImpact:["Establish the main layout"],nextBest:["Layer lighting"],optional:["Add finishing details"]},designerNotes:["Confirm field measurements before ordering."]});
export function normalizeItem(i:Item,conceptId?:string):Item{const originalSelection=i.originalSelection??{name:i.name,retailer:i.retailer,purchaseUrl:i.purchaseUrl,unitPrice:i.unitPrice,dimensions:i.dimensions,finish:i.finish,rationale:i.rationale,availability:i.availability,priceStatus:i.priceStatus,lastPriceCheckedAt:i.lastPriceCheckedAt,budgetTier:i.budgetTier};return{...i,conceptId:i.conceptId??conceptId,dimensions:i.dimensions??"Confirm retailer dimensions",rationale:i.rationale??"Selected to support the concept's palette and functional plan. Confirm dimensions and availability before ordering.",matchIndicators:i.matchIndicators??[],priority:i.priority??"High impact",isOwned:i.isOwned??false,isPurchased:i.isPurchased??i.checked??false,isRemoved:i.isRemoved??false,alternatives:i.alternatives??[],originalSelection};}
export function normalizeConcept(raw:Partial<Concept>&LegacyConcept,index=0):Concept{const name=raw.conceptName??(["Signature","Refined","Expressive"] as const)[index]??"Signature",id=raw.conceptId??raw.id??"legacy-"+index;return{...raw,id,conceptId:id,beforeImageUrl:assetUrl(raw.beforeImageUrl),imageDataUrl:assetUrl(raw.imageDataUrl),conceptName:name,title:raw.title??(raw.style??"Room")+" "+name,conceptDescription:raw.conceptDescription??raw.summary??"A coordinated room direction.",summary:raw.summary??"A coordinated room direction.",style:raw.style??"Modern",palette:raw.palette??["#D8CFC0","#262923","#F5F2EA"],materials:raw.materials??[],layoutSummary:raw.layoutSummary??"A practical layout that preserves circulation.",principles:raw.principles??[],designReport:raw.designReport??fallback(raw.style??"Modern"),shoppingItems:(raw.shoppingItems??[]).map(i=>normalizeItem(i as Item,id)),generationStatus:raw.generationStatus??"complete",generatedAt:raw.generatedAt??new Date(0).toISOString()};}
export function normalizeProject(raw:Partial<Project>&{concept?:LegacyConcept}):Project{const now=new Date().toISOString(),source=raw.concepts?.length?raw.concepts:raw.concept?[raw.concept as unknown as Concept]:[],normalized=source.map((c,i)=>normalizeConcept(c as Concept&LegacyConcept,i)),primaryImage=normalized[0]?.imageDataUrl,cs=normalized.map((c,i)=>i>0&&!c.imageDataUrl&&primaryImage?{...c,imageDataUrl:primaryImage,generationStatus:"partial" as const}:c),first=cs[0];return{projectId:raw.projectId??"project-"+Date.now(),roomName:raw.roomName,sourceImages:raw.sourceImages??[],selectedStyle:raw.selectedStyle??styles.find(s=>s.name===first?.style),concepts:cs,selectedConceptId:raw.selectedConceptId??first?.id,chosenConceptId:raw.chosenConceptId,approvedConceptId:raw.approvedConceptId,budgetTier:raw.budgetTier,fieldFinds:raw.fieldFinds??[],progressUpdates:raw.progressUpdates??[],reminders:raw.reminders??[],deals:raw.deals??[],lastDealCheckAt:raw.lastDealCheckAt,comparisonPosition:raw.comparisonPosition??50,priorityFilter:raw.priorityFilter??"All",sortPreference:raw.sortPreference??"recommended",createdAt:raw.createdAt??now,updatedAt:raw.updatedAt??now,schemaVersion:3,status:raw.status??"in-progress",completedAt:raw.completedAt,completionSnapshot:raw.completionSnapshot,lastPriceRefreshAt:raw.lastPriceRefreshAt,budget:raw.budget,constraints:raw.constraints??[],favorites:raw.favorites??[],comparisons:raw.comparisons??[],roomContext:raw.roomContext,roomDimensions:raw.roomDimensions};}
/**
 * Re-key one shopping plan onto a concept. Every concept in a live project draws from the same
 * server-resolved item list, so the list is produced once and re-keyed per concept rather than
 * being regenerated (which is what previously let concepts drift apart).
 */
export const conceptItems=(items:Item[],conceptId:string):Item[]=>items.map((item,index)=>normalizeItem({...item,id:`${conceptId}-room-${index}`,conceptId},conceptId));
export function createProject(style:Style,images:Project["sourceImages"],legacy?:LegacyConcept):Project{
  const cs=demoConcepts(style,legacy?.beforeImageUrl??images[0]?.uri,legacy?.imageDataUrl);
  if(legacy){
    // A live generation happened, so the server response is the ONLY source of shopping items.
    // Seeded demo products must never appear in a real plan — not even when the product search
    // resolved nothing, in which case an honest empty plan is the correct result (REQ-1, REQ-11).
    // Previously Signature fell back to seeded fiction here while the other two concepts were
    // handed an empty array, so one concept showed eight invented products and two showed none.
    const serverItems=(legacy.shoppingItems??[]) as Item[];
    const server=legacy as LegacyConcept&{
      designReport?:Report;
      roomAnalysis?:RoomAnalysis;
      variants?:Array<{conceptName:ConceptName;imageDataUrl?:string;designReport?:Report;generationStatus?:"complete"|"partial"|"failed"}>
    };
    cs[0]=normalizeConcept({...cs[0],...legacy,conceptName:"Signature",roomAnalysis:server.roomAnalysis,designReport:server.designReport??cs[0]!.designReport,shoppingItems:conceptItems(serverItems,cs[0]!.id)},0);
    for(const variant of server.variants??[]){
      const index=cs.findIndex(c=>c.conceptName===variant.conceptName);
      if(index>=0){
        const current=cs[index]!;
        cs[index]={...current,imageDataUrl:assetUrl(variant.imageDataUrl??cs[0]?.imageDataUrl),designReport:variant.designReport??current.designReport,roomAnalysis:server.roomAnalysis,shoppingItems:conceptItems(serverItems,current.id),generationStatus:variant.generationStatus==="complete"?"complete":"partial"};
      }
    }
    // Guarantee: once a live response exists, no concept keeps seeded demo products — including
    // concepts the server reported no variant for (older responses, partial render failures).
    for(let index=0;index<cs.length;index+=1){const current=cs[index]!;cs[index]={...current,shoppingItems:conceptItems(serverItems,current.id)};}
  }
  const now=new Date().toISOString();
  return{projectId:"project-"+Date.now(),sourceImages:images,selectedStyle:style,concepts:cs,selectedConceptId:cs[0]!.id,fieldFinds:[],progressUpdates:[],reminders:[],deals:[],comparisonPosition:50,priorityFilter:"All",sortPreference:"recommended",createdAt:now,updatedAt:now};
}
export type ShoppingDecision="keep-sofa"|"keep-chairs"|"exclude-art"|"lower-price";
export function refineConcept(concept:Concept,imageDataUrl:string,instructions:string,decisions:ShoppingDecision[]):Concept{
  let shoppingItems=concept.shoppingItems.map(item=>({...item}));
  if(decisions.includes("keep-sofa"))shoppingItems=shoppingItems.map(item=>item.name.toLowerCase().includes("sofa")?{...item,isOwned:true,isPurchased:false,rationale:"Retained from the existing room by design decision; excluded from the remaining purchase total."}:item);
  if(decisions.includes("keep-chairs"))shoppingItems=shoppingItems.map(item=>item.name.toLowerCase().includes("chair")?{...item,isOwned:true,isPurchased:false,rationale:"Retained from the existing room by design decision; excluded from the remaining purchase total."}:item);
  if(decisions.includes("exclude-art"))shoppingItems=shoppingItems.map(item=>item.category==="Art"||item.name.toLowerCase().includes("art")?{...item,isRemoved:true}:item);
  if(decisions.includes("lower-price"))shoppingItems=shoppingItems.map(item=>{if(item.isOwned||item.isRemoved)return item;const cheaper=(item.alternatives??[]).filter(a=>a.unitPrice<item.unitPrice).sort((a,b)=>a.unitPrice-b.unitPrice)[0];return cheaper?{...item,name:cheaper.name,retailer:cheaper.retailer,purchaseUrl:cheaper.purchaseUrl,unitPrice:cheaper.unitPrice,dimensions:cheaper.dimensions,finish:cheaper.finish,rationale:"Selected as the lower-priced compatible alternative while preserving this item’s role in the approved design."}:item});
  return{...concept,imageDataUrl:assetUrl(imageDataUrl),shoppingItems,generationStatus:"complete",generatedAt:new Date().toISOString(),revisionNotes:[...(concept.revisionNotes??[]),instructions]};
}
const unionById=<T extends{id:string}>(a:T[]=[],b:T[]=[]):T[]=>{const byId=new Map<string,T>();for(const entry of [...a,...b])if(entry?.id)byId.set(entry.id,entry);return [...byId.values()];};
/** A release must never be lost to a sync conflict, so a released row always beats an active one. */
const mergeConstraints=(a:Project["constraints"]=[],b:Project["constraints"]=[])=>{const byId=new Map<string,NonNullable<Project["constraints"]>[number]>();for(const c of [...a,...b]){if(!c?.id)continue;const existing=byId.get(c.id);byId.set(c.id,existing?.releasedAt?existing:c)}return [...byId.values()];};
export function resolveProjectConflict(local:Project,server:Project):Project{
  const localNewer=Date.parse(local.updatedAt)>=Date.parse(server.updatedAt);
  const base=localNewer?local:server,other=localNewer?server:local;
  const concepts=base.concepts.map(concept=>{
    const otherConcept=other.concepts.find(c=>c.id===concept.id);
    if(!otherConcept)return concept;
    const shoppingItems=concept.shoppingItems.map(item=>{
      const candidate=otherConcept.shoppingItems.find(i=>i.id===item.id);
      if(!candidate)return item;
      const itemTime=Date.parse(item.lastModifiedAt??base.updatedAt);
      const candidateTime=Date.parse(candidate.lastModifiedAt??other.updatedAt);
      const winner=candidateTime>itemTime?candidate:item;
      return{...winner,priceHistory:mergePriceHistory(item.priceHistory,candidate.priceHistory)};
    });
    return{...concept,shoppingItems};
  });
  return{...base,concepts,constraints:mergeConstraints(local.constraints,server.constraints),favorites:unionById(base.favorites,other.favorites),updatedAt:new Date(Math.max(Date.parse(local.updatedAt),Date.parse(server.updatedAt))).toISOString()};
}
export const selected=(p:Project)=>p.concepts.find(c=>c.id===p.selectedConceptId)??p.concepts[0];
export const replace=(p:Project,c:Concept):Project=>({...p,concepts:p.concepts.map(x=>x.id===c.id?c:x),updatedAt:new Date().toISOString()});


export function applyBudget(p:Project,tier:import("./enhancedTypes").BudgetTier):Project{const c=selected(p);if(!c)return p;const items=c.shoppingItems.map(item=>{const base=item.originalSelection??{name:item.name,retailer:item.retailer,purchaseUrl:item.purchaseUrl,unitPrice:item.unitPrice,dimensions:item.dimensions,finish:item.finish,rationale:item.rationale,availability:item.availability,priceStatus:item.priceStatus,lastPriceCheckedAt:item.lastPriceCheckedAt,budgetTier:item.budgetTier};if(item.isOwned||item.isRemoved||constraintsForItem(p,item).length)return{...item,originalSelection:base};const alternatives=(item.alternatives??[]).filter(a=>a.priceStatus==="verified"&&isDirectProductUrl(a.purchaseUrl));const exact=base.budgetTier===tier&&base.priceStatus==="verified"&&isDirectProductUrl(base.purchaseUrl)?base:alternatives.find(a=>a.budgetTier===tier);const fallback=tier==="save"?alternatives.filter(a=>a.unitPrice<base.unitPrice).sort((a,b)=>a.unitPrice-b.unitPrice)[0]:tier==="invest"?alternatives.slice().sort((a,b)=>b.unitPrice-a.unitPrice)[0]:base;const choice=exact??fallback??base;return{...item,name:choice.name,retailer:choice.retailer,purchaseUrl:choice.purchaseUrl,unitPrice:choice.unitPrice,dimensions:choice.dimensions,finish:choice.finish,availability:choice.availability,priceStatus:choice.priceStatus,lastPriceCheckedAt:choice.lastPriceCheckedAt,budgetTier:choice.budgetTier,rationale:("rationale" in choice?choice.rationale:undefined)??`${tier.charAt(0).toUpperCase()+tier.slice(1)} verified product for the same ${item.category.toLowerCase()} role in this room.`,originalSelection:base}});return{...replace(p,{...c,shoppingItems:items}),budgetTier:tier}}

// ─────────────────────────────────────────────────────────────────────────────
// WS-3 rules: price history, lifecycle, substitution, favorites, comparison.
// Pure functions. Screens call these rather than recomputing behaviour locally.
// ─────────────────────────────────────────────────────────────────────────────
import type {ComparisonResult,ComparisonRow,Favorite,IdentifiedProduct,PriceObservation} from "./enhancedTypes";
import {constraintsForItem} from "./constraints";

/** Append-only, de-duplicated by observation time, oldest first (REQ-7, REQ-11). */
export function mergePriceHistory(existing:PriceObservation[]=[],incoming:PriceObservation[]=[]):PriceObservation[]{
  const byTime=new Map<string,PriceObservation>();
  for(const observation of [...existing,...incoming])if(observation&&observation.observedAt)byTime.set(observation.observedAt,observation);
  return [...byTime.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
}
/** Records a new sighting WITHOUT discarding the old one, then makes it the current price. */
export function appendObservation(item:Item,observation:PriceObservation):Item{
  const priceHistory=mergePriceHistory(item.priceHistory,[observation]);
  return{...item,priceHistory,unitPrice:observation.price,availability:observation.availability??item.availability,provenance:observation.source,priceStatus:observation.source==="verified"?"verified":item.priceStatus,lastPriceCheckedAt:observation.observedAt,lastModifiedAt:observation.observedAt};
}
export type PriceMovement={itemId:string;name:string;previous?:PriceObservation;current?:PriceObservation;changeAmount:number;changePercent:number;quantity:number;totalEffect:number};
/** Previous vs current price with the effect on the project total (REQ-7). */
export function priceMovement(item:Item):PriceMovement{
  const history=item.priceHistory??[];
  const current=history[history.length-1],previous=history.length>1?history[history.length-2]:undefined;
  const changeAmount=current&&previous?current.price-previous.price:0;
  const quantity=Math.max(0,item.quantity);
  return{itemId:item.id,name:item.name,previous,current,changeAmount,changePercent:previous&&previous.price>0?changeAmount/previous.price:0,quantity,totalEffect:changeAmount*quantity};
}
export const priceMovements=(items:Item[])=>items.map(priceMovement).filter(m=>m.changeAmount!==0);

// ── Lifecycle (REQ-7) ────────────────────────────────────────────────────────
export const projectStatus=(p:Project)=>p.status??"in-progress";
/** Completed projects are historical snapshots and are never auto-refreshed. */
export const canRefreshPrices=(p:Project)=>projectStatus(p)==="in-progress";
export function completeProject(p:Project):Project{
  const concept=selected(p),completedAt=new Date().toISOString();
  const items=(concept?.shoppingItems??[]).filter(i=>!i.isRemoved);
  return{...p,status:"complete",completedAt,updatedAt:completedAt,completionSnapshot:{completedAt,projectTotal:total(items),items:items.map(i=>({itemId:i.id,name:i.name,retailer:i.retailer,purchaseUrl:i.purchaseUrl,unitPrice:i.unitPrice,quantity:i.quantity,availability:i.availability,observedAt:i.lastPriceCheckedAt}))}};
}
/** Reopening starts a new refresh epoch but keeps the completion snapshot for comparison. */
export const reopenProject=(p:Project):Project=>({...p,status:"in-progress",updatedAt:new Date().toISOString()});
/**
 * Applies refreshed prices. Refuses completed projects here as well as at the API boundary —
 * a snapshot that any other code path can silently rewrite is not a snapshot.
 */
export function applyPriceRefresh(p:Project,conceptId:string,results:Array<{itemId:string;observation:PriceObservation}>):Project{
  if(!canRefreshPrices(p))return p;
  const refreshedAt=new Date().toISOString();
  const byId=new Map(results.map(r=>[r.itemId,r.observation]));
  return{...p,lastPriceRefreshAt:refreshedAt,updatedAt:refreshedAt,concepts:p.concepts.map(c=>c.id!==conceptId?c:{...c,shoppingItems:c.shoppingItems.map(i=>{const observation=byId.get(i.id);return observation?appendObservation(i,observation):i})})};
}

// ── In-store substitution and addition (REQ-3) ───────────────────────────────
export type FieldProduct=IdentifiedProduct&{name:string;quantity?:number};
const userSuppliedItem=(found:FieldProduct,base:Partial<Item>,id:string,conceptId:string,at:string):Item=>normalizeItem({
  ...base,id,conceptId,name:found.name,category:found.category??base.category??"Decor",
  description:found.productType??found.compatibility??base.description??found.name,
  quantity:Math.max(1,Math.round(found.quantity??base.quantity??1)),
  unitPrice:Number.isFinite(Number(found.price))?Number(found.price):0,
  retailer:found.retailer??"Found in store",purchaseUrl:found.purchaseUrl??"",
  dimensions:found.approximateDimensions??base.dimensions,finish:base.finish,
  // Never "verified": the user supplied this, so it must not read as a confirmed retailer listing.
  provenance:"user-supplied",priceStatus:"estimate",lastPriceCheckedAt:undefined,
  availability:found.priceSource==="user-entered"?"Price entered by you in store":"Confirm with the retailer",
  rationale:found.compatibility??"Added from a product you photographed while shopping.",
  matchIndicators:found.designImplications??["Added from an in-store photo"],
  lastModifiedAt:at,priceHistory:Number.isFinite(Number(found.price))?[{price:Number(found.price),currency:"USD",observedAt:at,source:"user-supplied",availability:"Entered while shopping"}]:[]
} as Item,conceptId);
/** Replaces a planned item, preserving its role, category and constraint linkage. */
export function substituteItem(concept:Concept,targetItemId:string,found:FieldProduct):Concept{
  const at=new Date().toISOString();
  return{...concept,shoppingItems:concept.shoppingItems.map(item=>item.id!==targetItemId?item:
    {...userSuppliedItem(found,{category:item.category,description:item.description,quantity:item.quantity,dimensions:item.dimensions,finish:item.finish,priority:item.priority,constraintId:item.constraintId},item.id,concept.id,at),
     // The original stays recorded so the substitution is reversible.
     originalSelection:item.originalSelection??{name:item.name,retailer:item.retailer,purchaseUrl:item.purchaseUrl,unitPrice:item.unitPrice,dimensions:item.dimensions,finish:item.finish,rationale:item.rationale,availability:item.availability,priceStatus:item.priceStatus,lastPriceCheckedAt:item.lastPriceCheckedAt,budgetTier:item.budgetTier}})};
}
/** Adds a photographed product as a new line rather than replacing one. */
export function addFieldItem(concept:Concept,found:FieldProduct):Concept{
  const at=new Date().toISOString();
  return{...concept,shoppingItems:[...concept.shoppingItems,userSuppliedItem(found,{},concept.id+"-found-"+concept.shoppingItems.length,concept.id,at)]};
}
/** Restores the product a substitution replaced. */
export function revertSubstitution(concept:Concept,itemId:string):Concept{
  return{...concept,shoppingItems:concept.shoppingItems.map(item=>{
    if(item.id!==itemId||!item.originalSelection)return item;
    const o=item.originalSelection;
    return{...item,name:o.name,retailer:o.retailer,purchaseUrl:o.purchaseUrl,unitPrice:o.unitPrice,dimensions:o.dimensions,finish:o.finish,rationale:o.rationale,availability:o.availability,priceStatus:o.priceStatus,lastPriceCheckedAt:o.lastPriceCheckedAt,budgetTier:o.budgetTier,provenance:o.priceStatus==="verified"?"verified":"generated",lastModifiedAt:new Date().toISOString()};
  })};
}

// ── Favorites and comparison (REQ-9) ─────────────────────────────────────────
export const isFavorited=(p:Project,refId:string)=>(p.favorites??[]).some(f=>f.refId===refId);
export function toggleFavorite(p:Project,favorite:Favorite):Project{
  const existing=(p.favorites??[]).find(f=>f.refId===favorite.refId);
  return{...p,favorites:existing?(p.favorites??[]).filter(f=>f.refId!==favorite.refId):[...(p.favorites??[]),favorite],updatedAt:new Date().toISOString()};
}
const money=(n?:number)=>n===undefined?undefined:"$"+Math.round(n).toLocaleString();
/** Product A vs product B across the axes REQ-9 names, plus honest tradeoffs. */
export function compareProducts(items:Item[]):ComparisonResult{
  const rows:ComparisonRow[]=[
    {label:"Product",values:items.map(i=>i.name)},
    {label:"Retailer",values:items.map(i=>i.retailer)},
    {label:"Price",values:items.map(i=>money(i.unitPrice))},
    {label:"Quantity",values:items.map(i=>i.quantity)},
    {label:"Budget impact",values:items.map(i=>money(i.unitPrice*Math.max(0,i.quantity)))},
    {label:"Dimensions",values:items.map(i=>i.dimensions??"Not stated")},
    {label:"Finish",values:items.map(i=>i.finish??"Not stated")},
    {label:"Style fit",values:items.map(i=>(i.matchIndicators??[]).join(", ")||"Not assessed")},
    {label:"Availability",values:items.map(i=>i.availability??"Confirm with retailer")},
    {label:"Price confidence",values:items.map(i=>i.provenance==="verified"?"Verified on the product page":"Not verified")}
  ];
  const cheapest=items.slice().sort((a,b)=>a.unitPrice-b.unitPrice)[0];
  const tradeoffs:string[]=[];
  if(items.length>1&&cheapest)tradeoffs.push(cheapest.name+" is the lowest cost at "+money(cheapest.unitPrice)+".");
  const unverified=items.filter(i=>i.provenance!=="verified");
  if(unverified.length)tradeoffs.push(unverified.map(i=>i.name).join(", ")+(unverified.length>1?" have":" has")+" no verified retailer price yet, so the comparison is not like for like.");
  const missing=items.filter(i=>!i.dimensions||i.dimensions==="Confirm retailer dimensions");
  if(missing.length)tradeoffs.push("Confirm dimensions for "+missing.map(i=>i.name).join(", ")+" before ordering.");
  return{kind:"product",refIds:items.map(i=>i.id),rows,tradeoffs};
}
/** Variation vs variation, so the choice is not made on the image alone (REQ-9). */
export function compareConcepts(p:Project,conceptIds:string[]):ComparisonResult{
  const concepts=conceptIds.map(id=>p.concepts.find(c=>c.id===id)).filter((c):c is Concept=>Boolean(c));
  const rows:ComparisonRow[]=[
    {label:"Direction",values:concepts.map(c=>c.conceptName)},
    {label:"Description",values:concepts.map(c=>c.conceptDescription)},
    {label:"Plan total",values:concepts.map(c=>money(total(c.shoppingItems)))},
    {label:"Remaining to purchase",values:concepts.map(c=>money(remaining(c.shoppingItems)))},
    {label:"Pieces",values:concepts.map(c=>c.shoppingItems.filter(i=>!i.isRemoved).length)},
    {label:"Verified products",values:concepts.map(c=>c.shoppingItems.filter(i=>i.provenance==="verified").length+" of "+c.shoppingItems.filter(i=>!i.isRemoved).length)},
    {label:"Materials",values:concepts.map(c=>(c.materials??[]).join(", ")||"Not stated")},
    {label:"Layout",values:concepts.map(c=>c.layoutSummary)}
  ];
  const sorted=concepts.slice().sort((a,b)=>total(a.shoppingItems)-total(b.shoppingItems));
  const tradeoffs:string[]=[];
  if(sorted.length>1&&sorted[0]&&sorted[sorted.length-1]){
    const low=sorted[0]!,high=sorted[sorted.length-1]!;
    const gap=total(high.shoppingItems)-total(low.shoppingItems);
    if(gap>0)tradeoffs.push(high.conceptName+" costs about "+money(gap)+" more than "+low.conceptName+".");
  }
  const shared=concepts.length>1?concepts[0]!.shoppingItems.filter(i=>concepts.every(c=>c.shoppingItems.some(x=>x.name===i.name))).length:0;
  if(concepts.length>1)tradeoffs.push(shared?shared+" product"+(shared>1?"s are":" is")+" common to these directions; the rest differ.":"These directions share no products, so they are genuinely different plans.");
  return{kind:"concept",refIds:concepts.map(c=>c.id),rows,tradeoffs};
}

/**
 * Take a verified lower price into the plan (F17).
 *
 * "Check shopping deals" used to be display-only: it stored project.deals and nothing else, so a
 * better price the app had already verified never reached the shopping list and never moved the
 * remaining-to-purchase figure the user was making decisions from.
 *
 * This reuses the machinery that already exists rather than building a parallel one: swapItem for
 * the product change, appendObservation for the append-only price record the user asked us to keep.
 * Each observation carries its own url, so a history that spans a swap still says exactly which
 * product each price belonged to.
 *
 * Refused for anything already bought or owned — their price is a record of what was paid — and for
 * completed projects, which are frozen snapshots.
 */
export function applyDeal(p:Project,conceptId:string,itemId:string,alternative:Alternative):Project{
  if(!canRefreshPrices(p))return p;
  const concept=p.concepts.find(c=>c.id===conceptId);
  if(!concept)return p;
  const item=concept.shoppingItems.find(i=>i.id===itemId);
  if(!item||item.isRemoved||item.isPurchased||item.isOwned||item.checked)return p;
  if(!(alternative.unitPrice<item.unitPrice))return p;
  const swapped=swapItem(concept,itemId,alternative);
  const observation:PriceObservation={price:alternative.unitPrice,currency:"USD",observedAt:alternative.lastPriceCheckedAt??new Date().toISOString(),availability:alternative.availability,source:"verified",url:alternative.purchaseUrl};
  return replace(p,{...swapped,shoppingItems:swapped.shoppingItems.map(i=>i.id===itemId?appendObservation(i,observation):i)});
}
