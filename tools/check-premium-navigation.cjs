const fs=require('node:fs');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const mode=process.argv[2]||'after';
const pages=['league','predictions','all-predictions','star-man','all-star-men','game-card','power-cards','prediction-hub','star-man-hub','leaderboard','correct-scores','statistics','medals','live-curses','awards'];
const representative=['league','predictions','star-man','power-cards','game-card'];
const leagueSource=fs.readFileSync('assets/js/league.js','utf8');
const pageDefinition=leagueSource.slice(leagueSource.indexOf('  const pages = ['),leagueSource.indexOf('  choiceMenus = new Map'));
const originalGrid=leagueSource.slice(leagueSource.indexOf('  playGrid.innerHTML = pages.map'),leagueSource.indexOf('  setLeaguePageLoadProgress(96)'));
const originalPopup=leagueSource.slice(leagueSource.indexOf('function closeHubChoicePanel()'),leagueSource.indexOf('async function renderLeague('));
const leagueFixture=`const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');const leagueUrl=(p,id)=>p+'?competition_id='+id;
const gameweekNumber=9,league={id:'qa-league'};${pageDefinition}
const playGrid=document.querySelector('[data-play-grid]');${originalGrid}
const choiceOverlay=document.querySelector('[data-hub-choice-overlay]'),choiceDialog=document.querySelector('[data-hub-choice-dialog]'),choiceTitle=document.querySelector('[data-hub-choice-title]'),choiceCopy=document.querySelector('[data-hub-choice-copy]'),choiceOptions=document.querySelector('[data-hub-choice-options]');
let lastChoiceTrigger=null;const choiceMenus=new Map(pages.filter(p=>p.menu).map(p=>[p.menu,{...p,leagueId:league.id}]));${originalPopup}
playGrid.addEventListener('click',e=>{const t=e.target.closest('[data-choice-menu]');if(t)openHubChoicePanel(t.dataset.choiceMenu,t)});choiceOverlay.addEventListener('click',e=>{if(e.target.closest('[data-hub-choice-dismiss]'))closeHubChoicePanel()});`;
(async()=>{
 if(mode!=='before')for(const name of pages){
  const original=cp.execFileSync('git',['show','462fb6c:'+name+'.html'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  const updated=fs.readFileSync(name+'.html','utf8').replace(/\r\n/g,'\n').replace(/^.*(?:href="assets\/css\/premium-navigation.css|src="assets\/js\/premium-navigation.js).*\n/gm,'');
  assert.equal(updated,original,'Existing HTML content was changed: '+name);
 }
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const context=await browser.newContext({hasTouch:true});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='localhost')return route.abort();
  if(url.pathname.endsWith('.html')){
   let html=fs.readFileSync('.'+url.pathname,'utf8').replace(/<script\b[\s\S]*?<\/script>/gi,s=>/league-return.js|league-navigation.js|wider-polish.js|legal-footer.js/.test(s)||(mode!=='before'&&s.includes('premium-navigation.js'))?s:'').replace(/pp-page-loading|pp-card-data-pending/g,'');
   return route.fulfill({contentType:'text/html',body:html});
  }
  if(url.pathname.endsWith('/session-user.js'))return route.fulfill({contentType:'text/javascript',body:`export async function getSessionUser(){return new URLSearchParams(location.search).has('signedout')?null:{id:'test'};} export function onSessionUserChange(fn){window.testSignOut=()=>fn(null,'SIGNED_OUT');return ()=>{};}`});
  if(url.pathname.endsWith('/league-context.js')){
   const source=fs.readFileSync('assets/js/league-context.js','utf8');
   const helpers=['escapeHtml','getCompetitionIdFromUrl','leagueUrl'].map(name=>{const start=source.indexOf('export function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2)}).join('\n');
   return route.fulfill({contentType:'text/javascript',body:helpers});
  }
  return route.continue();
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>{console.log('Browser error:',page.url(),e.name,e.message);errors.push(e.message)});
 if(mode!=='checks')for(const name of representative){
  for(const width of [360,390,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto(`http://localhost:4173/${name}.html?competition_id=qa-league`);
   if(name==='league')await page.addScriptTag({content:leagueFixture});
   await page.evaluate(async()=>{await import('/assets/js/notifications.js'); const title=document.querySelector('[data-league-name]');if(title)title.textContent='PREM PREDICS 26/27';});
    if(mode!=='before')await page.locator('.pp-nav-dock').waitFor();
   await page.screenshot({path:`outputs/navigation-${mode}-${name}-${width}.png`,fullPage:true});
   if(mode==='after'){
    const box=await page.locator('.pp-nav-home').boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<1,'off-centre '+name+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+name+width);
    assert.equal(await page.locator('.pp-nav-dock > a,.pp-nav-dock > button').count(),3);
   }
  }
 }
 if(mode==='before'){console.log('Captured 25 BEFORE screenshots from existing HTML, with private data/scripts isolated.');return;}
 for(const name of pages){
  await page.goto(`http://localhost:4173/${name}.html?competition_id=qa-league`);
  await page.locator('.pp-nav-dock').waitFor();
  assert.equal(await page.locator('.pp-nav-dock > a,.pp-nav-dock > button').count(),3);
  const links=await page.locator('[data-premium-nav] a').evaluateAll(nodes=>nodes.map(n=>n.href));
  assert(links.every(h=>new URL(h).searchParams.get('competition_id')==='qa-league'));
  if(name==='league')assert.equal(await page.locator('.pp-nav-top').count(),0);
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://localhost:4173/league.html?competition_id=qa-league');
 await page.addScriptTag({content:leagueFixture});await page.locator('.pp-nav-dock').waitFor();
 await page.locator('[data-choice-menu="predictions"]').click();
 await page.waitForTimeout(100);
 assert(await page.locator('.pp-nav-shell').evaluate(n=>n.inert),'Hub popup must hide dock');
 assert.equal(await page.locator('[data-hub-choice-options] a').count(),2);
 await page.locator('.hub-choice-back').click();
 await page.locator('.pp-nav-dock').waitFor();
 await page.locator('.league-menu-toggle').click();await page.waitForTimeout(100);
 assert(await page.locator('.pp-nav-shell').evaluate(n=>n.inert),'account menu must hide dock');
 await page.keyboard.press('Escape');
 await page.goto('http://localhost:4173/predictions.html?competition_id=qa-league');
 await page.locator('.pp-nav-dock').waitFor();
 await page.evaluate(()=>{const field=document.createElement('input');field.id='qa-keyboard';document.body.prepend(field);field.focus();});
 await page.waitForTimeout(50);
 await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:400});window.visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForTimeout(50);assert(await page.locator('.pp-nav-shell').evaluate(n=>n.inert),'keyboard must hide dock');
 await page.evaluate(()=>{delete window.visualViewport.height;document.querySelector('#qa-keyboard').remove();window.visualViewport.dispatchEvent(new Event('resize'));});
 await page.locator('.pp-nav-dock').waitFor();
 assert.equal(await page.locator('.pp-nav-secondary [aria-current="page"]').innerText(),'Make Predictions');
 await page.locator('[data-nav-group="predictions"]').click();
 await page.locator('.pp-nav-flyout a').filter({hasText:/^Star Man$/}).click();
 await page.waitForURL('**/star-man.html?competition_id=qa-league');
 await page.locator('.pp-nav-dock').waitFor();
 assert.equal(await page.locator('.pp-nav-primary [aria-current="page"]').innerText(),'Star Man');
 await page.goBack();await page.locator('.pp-nav-dock').waitFor();
 await page.locator('[data-nav-group="cards"]').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('[data-nav-group="cards"]').getAttribute('aria-expanded'),'false');
 await page.locator('[data-nav-group="cards"]').click();
 await page.locator('.pp-nav-flyout a').filter({hasText:/^Draw Cards$/}).click();
 await page.waitForURL('**/power-cards.html?competition_id=qa-league#primarySideActions');
 await page.locator('.pp-nav-dock').waitFor();
 assert.equal(await page.locator('.pp-nav-primary [aria-current="location"]').innerText(),'Draw Cards');
 await page.evaluate(()=>document.getElementById('deckChoiceModal').classList.add('show'));
 await page.waitForTimeout(100);
 assert(await page.locator('.pp-nav-shell').evaluate(n=>n.inert),'dock remains operable behind modal');
 await page.evaluate(()=>document.getElementById('deckChoiceModal').classList.remove('show'));
 await page.setViewportSize({width:844,height:390});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>document.documentElement.classList.add('pp-halloween'));
 await page.screenshot({path:'outputs/navigation-after-landscape-halloween.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.evaluate(()=>window.testSignOut());
 assert.equal(await page.locator('.pp-nav-dock').count(),0);
 for(const target of ['league.html','league.html?competition_id=qa-league&signedout=1','login.html','global-admin.html','privacy.html']){
  await page.goto('http://localhost:4173/'+target);await page.waitForTimeout(100);
  assert.equal(await page.locator('.pp-nav-dock').count(),0,'unexpected nav '+target);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: 25 AFTER captures, 15 page routes, exact centre/3 controls, league preservation, active links, Back, draw anchor, Escape, modal isolation, landscape/Halloween/reduced motion, signed out/no league/public/admin exclusions.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
