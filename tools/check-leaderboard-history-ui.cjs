const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page=await browser.newPage();
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='localhost')return route.abort();
  if(url.pathname==='/leaderboard.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync('leaderboard.html','utf8').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/pp-page-loading/g,'')});
  if(url.pathname.endsWith('/supabase-client.js'))return route.fulfill({contentType:'text/javascript',body:`export const supabase={from(table){return {select(){return this},eq(){return this},order(){return this},abortSignal(){return this},range(a,b){return Promise.resolve(window.failHistory?{error:new Error('test unavailable')}:{data:window.testData[table].slice(a,b+1),count:window.testData[table].length})}}}};`});
  if(url.pathname.endsWith('/league-context.js'))return route.fulfill({contentType:'text/javascript',body:`export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`});
  return route.continue();
 });
 await page.goto('http://localhost:4173/leaderboard.html');
 await page.evaluate(async()=>{
  const {rankingFields}=await import('/assets/js/leaderboard-history-model.js');
  window.members=Array.from({length:10},(_,i)=>({user_id:'u'+i,display_name:i===0?'ThomasColeman':'Player '+i}));
  window.testData={gameweeks:Array.from({length:38},(_,i)=>({id:i+1,number:i+1})),fixtures:[],user_gameweek_stats:[]};
  for(let w=1;w<=38;w++){
   testData.fixtures.push({id:w,gameweek_id:w,status:w<=8?'final':'scheduled',kickoff_at:'2026-01-01',match_results:w<=8?[{fixture_id:w}]:[]});
   for(let i=0;i<10;i++)testData.user_gameweek_stats.push({...Object.fromEntries(rankingFields.map(f=>[f,0])),user_id:'u'+i,gameweek_id:w,ultimate_champion_points:w===8?i*10:10-i});
  }
  window.context={league:{id:1,season_id:1,starts_gameweek_id:1},user:{id:'u0'}};
  window.controller=(await import('/assets/js/leaderboard-history.js')).createLeaderboardHistory();
  await controller.update(context,members,new Map());
 });
 await page.locator('[data-leaderboard-history] summary').click();
 await page.locator('[data-history-all]').check();
 assert.equal(await page.locator('.history-legend button').count(),10);
 assert.match(await page.locator('[data-movement-note]').innerText(),/GW8.*GW7/);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow at '+width);
  const names=await page.locator('.history-detail-row').count();assert.equal(names,10);
  await page.locator('[data-leaderboard-history]').screenshot({path:'outputs/leaderboard-history-'+width+'.png'});
 }
 await page.locator('[data-history-metric="points"]').click();
 assert.equal(await page.locator('[data-history-metric="points"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-history-step="-1"]').click();
 assert.equal(await page.locator('[data-history-selected]').innerText(),'End of GW7');
 await page.locator('[data-history-all]').uncheck();
 assert.equal(await page.locator('.history-detail-row').count(),1);
 await page.evaluate(async()=>{window.failHistory=true;await controller.update(context,members,new Map())});
 assert.equal(await page.locator('[data-history-retry]').count(),1);
 await page.evaluate(()=>window.failHistory=false);
 await page.locator('[data-history-retry]').click();
 await page.locator('[data-history-metric="rank"]').waitFor();
 console.log('PASS: 320/390/768/1440px, ten members, weekly comparison, metric toggle, week navigation, self view, failure/retry.');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
