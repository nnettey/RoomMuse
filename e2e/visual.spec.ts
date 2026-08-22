import{test,expect}from"@playwright/test";const viewports=[["iphone-se",375,667],["iphone",390,844],["iphone-large",430,932],["android",412,915],["tablet",768,1024],["desktop",1440,1000]] as const;const states=[["home","/"],["style","/?demo=style"],["generation","/?demo=generating"],["concept","/?demo=result"],["comparison","/?demo=result"],["report","/?demo=result"],["refine","/?demo=refine"],["shopping","/?demo=shopping"],["product","/?demo=product"],["alternatives","/?demo=alternatives"],["saved-return","/?demo=shopping"],
// Screens added since the baselines were last taken, and the ones this round changed most:
// the merged budget screen, the project hub that Finish now lands on, and the shopping companion.
["budget","/?demo=budgetSetup"],["library","/?demo=library"],["refresh","/?demo=refresh"],
["constraints","/?demo=constraints"],["field","/?demo=field"],["compare","/?demo=compare"],
["hub","/?demo=project"]] as const;for(const[name,width,height]of viewports)for(const[state,url]of states)test("visual "+name+" "+state,async({page})=>{await page.setViewportSize({width,height});
// Same isolation as the journeys: without this the shots depend on whatever a development server
// on port 3201 happens to be holding.
await page.route("**/api/projects/**",route=>route.fulfill({status:404,contentType:"application/json",body:"{}"}));
await page.goto(url);await page.addStyleTag({content:"*{animation:none!important;transition:none!important}"});if(state==="comparison"){const target=page.getByRole("slider");await target.scrollIntoViewIfNeeded()}if(state==="report"){const target=page.getByText("Why this design works");await target.scrollIntoViewIfNeeded()}await expect(page).toHaveScreenshot(name+"-"+state+".png",{animations:"disabled",maxDiffPixelRatio:.01})});
