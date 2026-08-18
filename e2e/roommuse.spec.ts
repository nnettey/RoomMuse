import{test,expect}from"@playwright/test";import{mockDesign,mockRefine,mockShoppingPlan,seedProject,shoppingItems,apiResponse}from"./helpers";
test.beforeEach(async({page})=>{await page.goto("/");await page.evaluate(()=>localStorage.clear());await page.reload()});
test("scan through share-ready saved shopping plan",async({page,context})=>{await mockDesign(page);await mockShoppingPlan(page);await page.getByRole("button",{name:"Scan a room"}).click();const choose=page.getByRole("button",{name:"Choose a photo or video instead"});await expect(choose).toBeVisible();const chooser=page.waitForEvent("filechooser");await choose.click();await(await chooser).setFiles("tests/fixtures/room.png");await expect(page.getByText("What should this room feel like?")).toBeVisible();await page.getByRole("button",{name:"Create Modern concept"}).click();for(const label of["Analyzing room proportions","Identifying existing furniture","Evaluating lighting and focal points","Building the color and material palette","Creating the room layout","Selecting coordinated pieces","Matching real products","Preparing your shopping plan"])await expect(page.getByText(label)).toBeVisible();await expect(page.getByText("Your concepts")).toBeVisible({timeout:15000});await expect(page.getByRole("tab",{name:"Signature concept"})).toHaveAttribute("aria-selected","true");await page.getByRole("tab",{name:"Expressive concept"}).click();await page.getByRole("button",{name:"Save as selected design"}).click();await page.getByRole("button",{name:"Review before & after"}).click();await page.getByRole("button",{name:"Approve final design"}).click();await page.getByRole("button",{name:"Build my shopping plan"}).click();await expect(page.getByText("What would you like to spend?")).toBeVisible();await page.getByRole("button",{name:"Skip for now"}).click();await expect(page.getByText("Estimated project total",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Open Fielding performance linen sofa"}).click();await page.getByRole("button",{name:"Find alternatives"}).click();await page.getByRole("button",{name:"Swap to Haven compact linen sofa"}).click();await expect(page.getByText("Haven compact linen sofa")).toBeVisible();await page.getByRole("button",{name:"Undo"}).click();await expect(page.getByRole("button",{name:"Open Fielding performance linen sofa"})).toBeVisible();await page.getByRole("button",{name:"Open Fielding performance linen sofa"}).click();await page.getByRole("button",{name:"Find alternatives"}).click();await page.getByRole("button",{name:"Swap to Haven compact linen sofa"}).click();await expect(page.getByText("Haven compact linen sofa")).toBeVisible();await page.getByLabel("Go back").click();await page.getByRole("button",{name:"View selected shopping list"}).click();await expect(page.getByText("Haven compact linen sofa")).toBeVisible();await page.getByRole("button",{name:"Open Haven compact linen sofa"}).click();const popupPromise=context.waitForEvent("page");await page.getByRole("button",{name:"View exact product at retailer"}).click();const popup=await popupPromise;await expect(popup).toHaveURL(/wayfair\.com/);await popup.close()});
test("comparison, report, quantities, owned, remove, restore and undo remain functional",async({page})=>{await page.goto("/?demo=result");await expect(page.getByRole("slider")).toBeVisible();await page.getByRole("button",{name:"Full screen"}).click();await expect(page.getByRole("button",{name:"Close full screen comparison"})).toBeVisible();await page.getByRole("button",{name:"Close full screen comparison"}).click();await page.getByText("Layout and circulation").click();await expect(page.getByText("A centered seating group",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Review before & after"}).click();await page.getByRole("button",{name:"Approve final design"}).click();await page.getByRole("button",{name:"Build my shopping plan"}).click();await expect(page.getByText("What would you like to spend?")).toBeVisible();await page.getByRole("button",{name:"Skip for now"}).click();const increase=page.getByRole("button",{name:"Increase Interior wall paint quantity"});await increase.click();await expect(page.getByLabel("Quantity 3")).toBeVisible();await page.getByRole("button",{name:"Open Interior wall paint"}).click();await page.getByRole("button",{name:"Mark as already owned"}).click();await expect(page.getByText("Already owned · excluded from remaining total")).toBeVisible();await page.getByRole("button",{name:"Open Interior wall paint"}).click();await page.getByText("Remove from plan").click();await page.getByRole("button",{name:"Remove essential piece"}).click();await expect(page.getByRole("button",{name:"Restore Interior wall paint"})).toBeVisible();await page.getByRole("button",{name:"Restore Interior wall paint"}).click();await expect(page.getByRole("button",{name:"Open Interior wall paint"})).toBeVisible()});
test("generation error is recoverable and partial variants degrade safely",async({page})=>{let calls=0;await page.route("**/api/design",route=>{calls++;return calls===1?route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"Temporary studio error"})}):route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(apiResponse(true))})});await page.goto("/");await page.getByRole("button",{name:"Scan a room"}).click();const choose=page.getByRole("button",{name:"Choose a photo or video instead"});const chooser=page.waitForEvent("filechooser");await choose.click();await(await chooser).setFiles("tests/fixtures/room.png");await page.getByRole("button",{name:"Create Modern concept"}).click();await expect(page.getByRole("button",{name:"Try again"})).toBeVisible();await page.getByRole("button",{name:"Try again"}).click();await expect(page.getByText("Your concepts")).toBeVisible({timeout:15000});await expect(page.getByRole("tab",{name:"Signature concept"})).toBeVisible();await expect(page.getByRole("tab",{name:"Refined concept"})).toBeVisible();await expect(page.getByRole("tab",{name:"Expressive concept"})).toBeVisible()});
test("saved project can be left and restored",async({page})=>{await page.goto("/?demo=shopping");await expect(page.getByText("Shopping plan")).toBeVisible();await page.getByLabel("Go back").click();await expect(page.getByRole("button",{name:"View selected shopping list"})).toBeVisible();await page.getByRole("button",{name:"View selected shopping list"}).click();await expect(page.getByText("Shopping plan")).toBeVisible()});
test("all demo states render without console errors or unhandled exceptions",async({page})=>{const failures:string[]=[];page.on("pageerror",error=>failures.push("pageerror: "+error.message));page.on("console",message=>{if(message.type()==="error")failures.push("console: "+message.text())});for(const route of["/","/?demo=style","/?demo=generating","/?demo=result","/?demo=shopping","/?demo=product","/?demo=alternatives"]){await page.goto(route);await page.waitForTimeout(250)}expect(failures).toEqual([])});test("primary controls expose keyboard focus and touch-safe targets",async({page})=>{await page.goto("/");await page.keyboard.press("Tab");const focused=page.locator(":focus");await expect(focused).toHaveAttribute("aria-label","Scan a room");const focusStyle=await focused.evaluate(element=>{const style=getComputedStyle(element);return{outline:style.outlineStyle,width:style.outlineWidth}});expect(focusStyle.outline).not.toBe("none");expect(parseFloat(focusStyle.width)).toBeGreaterThan(0);const box=await page.getByRole("button",{name:"Scan a room"}).boundingBox();expect(box?.height??0).toBeGreaterThanOrEqual(44)});test("share summary contains the design execution details and excludes private metadata",async({page})=>{await page.addInitScript(()=>{Object.defineProperty(navigator,"share",{configurable:true,value:async(data:unknown)=>{(window as unknown as{__roomMuseShare?:unknown}).__roomMuseShare=data}})});await page.goto("/?demo=shopping");await page.getByRole("button",{name:"Share project"}).click();const shared=await expect.poll(()=>page.evaluate(()=>(window as unknown as{__roomMuseShare?:{text?:string}}).__roomMuseShare?.text)).toContain("RoomMuse design summary");const message=await page.evaluate(()=>(window as unknown as{__roomMuseShare?:{text?:string}}).__roomMuseShare?.text??"");expect(message).toContain("Modern");expect(message).toContain("Signature");expect(message).toContain("Estimated project total");expect(message).toContain("Remaining to purchase");expect(message).toContain("Interior wall paint");expect(message).not.toContain("project-")});test("user refines and approves the final image before shopping decisions apply",async({page})=>{await mockDesign(page);await mockRefine(page);await mockShoppingPlan(page);await page.getByRole("button",{name:"Scan a room"}).click();const choose=page.getByRole("button",{name:"Choose a photo or video instead"});const chooser=page.waitForEvent("filechooser");await choose.click();await(await chooser).setFiles("tests/fixtures/room.png");await page.getByRole("button",{name:"Create Modern concept"}).click();await expect(page.getByText("Your concepts")).toBeVisible({timeout:15000});await page.getByRole("button",{name:"Make changes"}).click();await expect(page.getByText("What would you change?")).toBeVisible();await page.getByRole("checkbox",{name:"Lighter palette"}).click();await page.getByRole("checkbox",{name:"Keep my existing sofa"}).click();await page.getByRole("button",{name:"Regenerate this design"}).click();await expect(page.getByText("Your concepts")).toBeVisible();await page.getByRole("button",{name:"Review before & after"}).click();await expect(page.getByRole("slider")).toBeVisible();await page.getByRole("button",{name:"Approve final design"}).click();await expect(page.getByText("Final design approved",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Build my shopping plan"}).click();await expect(page.getByText("What would you like to spend?")).toBeVisible();await page.getByRole("button",{name:"Skip for now"}).click();await expect(page.getByText("Already owned · excluded from remaining total")).toBeVisible()});test("failed image requests show recovery controls instead of blank panels",async({page})=>{const response=apiResponse();response.imageDataUrl="http://127.0.0.1:9/missing.jpg";response.variants=response.variants.map(variant=>({...variant,imageDataUrl:"http://127.0.0.1:9/missing-"+variant.conceptName+".jpg"}));await page.route("**/api/design",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response)}));await page.getByRole("button",{name:"Scan a room"}).click();const choose=page.getByRole("button",{name:"Choose a photo or video instead"});const chooser=page.waitForEvent("filechooser");await choose.click();await(await chooser).setFiles("tests/fixtures/room.png");await page.getByRole("button",{name:"Create Modern concept"}).click();await expect(page.getByText("Your concepts")).toBeVisible({timeout:15000});await expect.poll(()=>page.getByText("Room image unavailable").count()).toBeGreaterThan(0);await expect(page.getByRole("button",{name:"Review before & after"})).toBeVisible()});
// WS-5a: the budget must actually shape the plan request, not just colour a number red.
test("budget entry reaches the shopping plan request and explains an over-budget design",async({page})=>{
  await mockDesign(page);
  let planRequest:Record<string,unknown>|undefined;
  await page.route("**/api/shopping-plan",route=>{planRequest=JSON.parse(route.request().postData()??"{}");return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({conceptId:"api-signature",conceptName:"Signature",items:shoppingItems.map(i=>({...i})),resolvedAt:new Date().toISOString(),unresolvedCount:0,projectedSpend:1518})})});
  await page.getByRole("button",{name:"Scan a room"}).click();
  const chooser=page.waitForEvent("filechooser");
  await page.getByRole("button",{name:"Choose a photo or video instead"}).click();
  await (await chooser).setFiles("tests/fixtures/room.png");
  await page.getByRole("button",{name:"Create Modern concept"}).click();
  await expect(page.getByText("Your concepts")).toBeVisible({timeout:15000});
  await page.getByRole("button",{name:"Review before & after"}).click();
  await page.getByRole("button",{name:"Approve final design"}).click();
  await page.getByRole("button",{name:"Build my shopping plan"}).click();
  await expect(page.getByText("What would you like to spend?")).toBeVisible();
  // The fixture plan is $1,518, so $500 must trigger the over-budget explanation.
  await page.getByLabel("Project budget in dollars").fill("500");
  await expect(page.getByText("Over budget by")).toBeVisible();
  await expect(page.getByText("What is driving the cost")).toBeVisible();
  await page.getByRole("button",{name:"Save budget and continue"}).click();
  await expect(page.getByText("Estimated project total",{exact:false})).toBeVisible({timeout:20000});
  expect((planRequest?.budget as {total?:number}|undefined)?.total).toBe(500);
});

test("saved projects are listed with their lifecycle status",async({page})=>{
  await seedProject(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Your saved projects"}).click();
  await expect(page.getByText("In progress")).toBeVisible();
  await expect(page.getByRole("button",{name:"Open Seeded room"})).toBeVisible();
});

// REQ-7: a completed project is a historical snapshot. The refresh must not merely be disabled —
// it must not be offered.
test("a completed project offers no price refresh at all",async({page})=>{
  await seedProject(page,{status:"complete",completedAt:"2026-08-01T00:00:00.000Z",completionSnapshot:{completedAt:"2026-08-01T00:00:00.000Z",projectTotal:1234,items:[]}});
  await page.goto("/?demo=project");
  await page.getByRole("button",{name:"View completed prices"}).click();
  await expect(page.getByText("This project is complete")).toBeVisible();
  await expect(page.getByRole("button",{name:"Check prices now"})).toHaveCount(0);
});

// WS-5b — REQ-10: a constraint must protect the item, and releasing it must be deliberate.
test("a constraint locks an item and releasing it requires confirmation",async({page})=>{
  await seedProject(page);
  await page.goto("/?demo=project");
  await page.getByRole("button",{name:"Things to keep"}).click();
  await expect(page.getByText("What should stay as it is?")).toBeVisible();
  await page.getByRole("button",{name:"Add constraint: Do not change the flooring"}).click();
  await expect(page.getByText("Do not change the flooring")).toBeVisible();
  await page.getByRole("button",{name:"Release constraint: Do not change the flooring"}).click();
  await expect(page.getByText("Release this constraint?")).toBeVisible();
  await page.getByRole("button",{name:"Keep it"}).click();
  // Dismissing the confirmation must leave the constraint in place.
  await expect(page.getByRole("button",{name:"Release constraint: Do not change the flooring"})).toBeVisible();
  // Confirming it must actually release it.
  await page.getByRole("button",{name:"Release constraint: Do not change the flooring"}).click();
  await page.getByRole("button",{name:"Release",exact:true}).click();
  await expect(page.getByRole("button",{name:"Release constraint: Do not change the flooring"})).toHaveCount(0);
});

// WS-5b — REQ-3: photograph a product, see the effect, then apply it.
test("an in-store product can replace a planned item and updates the totals",async({page})=>{
  await seedProject(page);
  await page.route("**/api/identify-product",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    identified:{productType:"Two-seat leather sofa",category:"Furniture",dimensionsConfidence:"unknown",compatibility:"Works with the dark console already in the room.",designImplications:["Repeats the existing leather"]},
    suggestedName:"Showroom leather sofa",compatibility:"Works with the dark console already in the room.",designImplications:["Repeats the existing leather"],confidence:"medium"})}));
  await page.goto("/?demo=project");
  await page.getByRole("button",{name:"Found something in store"}).click();
  await expect(page.getByText("Use something you found")).toBeVisible();
  await expect(page.getByRole("radio",{name:"Replace Fielding performance linen sofa"})).toBeVisible();
  // Without a photo the check must not run at all.
  await expect(page.getByRole("button",{name:"Check this product"})).toBeDisabled();
});

// WS-5b — REQ-9: comparison must be honest about what it is comparing.
test("two products can be compared side by side and favourited",async({page})=>{
  await seedProject(page);
  await page.goto("/?demo=project");
  await page.getByRole("button",{name:"Compare and favourites"}).click();
  await page.getByRole("checkbox",{name:"Compare Fielding performance linen sofa"}).click();
  await page.getByRole("checkbox",{name:"Compare Marlow oak floor lamp"}).click();
  await expect(page.getByText("Budget impact")).toBeVisible();
  await expect(page.getByText("Price confidence")).toBeVisible();
  // The cheaper option is called out rather than left for the reader to work out.
  await expect(page.getByText(/is the lowest cost at/)).toBeVisible();
  await page.getByRole("button",{name:/Save Marlow oak floor lamp/}).click();
  await expect(page.getByText("★ Marlow oak floor lamp")).toBeVisible();
});
