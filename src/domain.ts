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
export function normalizeProject(raw:Partial<Project>&{concept?:LegacyConcept}):Project{const now=new Date().toISOString(),source=raw.concepts?.length?raw.concepts:raw.concept?[raw.concept as unknown as Concept]:[],normalized=source.map((c,i)=>normalizeConcept(c as Concept&LegacyConcept,i)),primaryImage=normalized[0]?.imageDataUrl,cs=normalized.map((c,i)=>i>0&&!c.imageDataUrl&&primaryImage?{...c,imageDataUrl:primaryImage,generationStatus:"partial" as const}:c),first=cs[0];return{projectId:raw.projectId??"project-"+Date.now(),roomName:raw.roomName,sourceImages:raw.sourceImages??[],selectedStyle:raw.selectedStyle??styles.find(s=>s.name===first?.style),concepts:cs,selectedConceptId:raw.selectedConceptId??first?.id,chosenConceptId:raw.chosenConceptId,approvedConceptId:raw.approvedConceptId,budgetTier:raw.budgetTier,fieldFinds:raw.fieldFinds??[],progressUpdates:raw.progressUpdates??[],reminders:raw.reminders??[],deals:raw.deals??[],lastDealCheckAt:raw.lastDealCheckAt,comparisonPosition:raw.comparisonPosition??50,priorityFilter:raw.priorityFilter??"All",sortPreference:raw.sortPreference??"recommended",createdAt:raw.createdAt??now,updatedAt:raw.updatedAt??now};}
export function createProject(style:Style,images:Project["sourceImages"],legacy?:LegacyConcept):Project{
  const cs=demoConcepts(style,legacy?.beforeImageUrl??images[0]?.uri,legacy?.imageDataUrl);
  if(legacy){
    const server=legacy as LegacyConcept&{
      designReport?:Report;
      roomAnalysis?:RoomAnalysis;
      variants?:Array<{conceptName:ConceptName;imageDataUrl?:string;designReport?:Report;generationStatus?:"complete"|"partial"|"failed"}>
    };
    cs[0]=normalizeConcept({...cs[0],...legacy,conceptName:"Signature",roomAnalysis:server.roomAnalysis,designReport:server.designReport??cs[0]!.designReport,shoppingItems:legacy.shoppingItems.length?legacy.shoppingItems as Item[]:cs[0]!.shoppingItems},0);
    for(const variant of server.variants??[]){
      const index=cs.findIndex(c=>c.conceptName===variant.conceptName);
      if(index>=0){
        const current=cs[index]!;
        cs[index]={...current,imageDataUrl:assetUrl(variant.imageDataUrl??cs[0]?.imageDataUrl),designReport:variant.designReport??current.designReport,roomAnalysis:server.roomAnalysis,shoppingItems:(legacy.shoppingItems as Item[]).map((item,itemIndex)=>normalizeItem({...item,id:`${current.id}-room-${itemIndex}`,conceptId:current.id},current.id)),generationStatus:variant.generationStatus==="complete"?"complete":"partial"};
      }
    }
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
      return candidateTime>itemTime?candidate:item;
    });
    return{...concept,shoppingItems};
  });
  return{...base,concepts,updatedAt:new Date(Math.max(Date.parse(local.updatedAt),Date.parse(server.updatedAt))).toISOString()};
}
export const selected=(p:Project)=>p.concepts.find(c=>c.id===p.selectedConceptId)??p.concepts[0];
export const replace=(p:Project,c:Concept):Project=>({...p,concepts:p.concepts.map(x=>x.id===c.id?c:x),updatedAt:new Date().toISOString()});


export function applyBudget(p:Project,tier:import("./enhancedTypes").BudgetTier):Project{const c=selected(p);if(!c)return p;const items=c.shoppingItems.map(item=>{const base=item.originalSelection??{name:item.name,retailer:item.retailer,purchaseUrl:item.purchaseUrl,unitPrice:item.unitPrice,dimensions:item.dimensions,finish:item.finish,rationale:item.rationale,availability:item.availability,priceStatus:item.priceStatus,lastPriceCheckedAt:item.lastPriceCheckedAt,budgetTier:item.budgetTier};if(item.isOwned||item.isRemoved)return{...item,originalSelection:base};const alternatives=(item.alternatives??[]).filter(a=>a.priceStatus==="verified"&&isDirectProductUrl(a.purchaseUrl));const exact=base.budgetTier===tier&&base.priceStatus==="verified"&&isDirectProductUrl(base.purchaseUrl)?base:alternatives.find(a=>a.budgetTier===tier);const fallback=tier==="save"?alternatives.filter(a=>a.unitPrice<base.unitPrice).sort((a,b)=>a.unitPrice-b.unitPrice)[0]:tier==="invest"?alternatives.slice().sort((a,b)=>b.unitPrice-a.unitPrice)[0]:base;const choice=exact??fallback??base;return{...item,name:choice.name,retailer:choice.retailer,purchaseUrl:choice.purchaseUrl,unitPrice:choice.unitPrice,dimensions:choice.dimensions,finish:choice.finish,availability:choice.availability,priceStatus:choice.priceStatus,lastPriceCheckedAt:choice.lastPriceCheckedAt,budgetTier:choice.budgetTier,rationale:("rationale" in choice?choice.rationale:undefined)??`${tier.charAt(0).toUpperCase()+tier.slice(1)} verified product for the same ${item.category.toLowerCase()} role in this room.`,originalSelection:base}});return{...replace(p,{...c,shoppingItems:items}),budgetTier:tier}}
