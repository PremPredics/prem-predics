const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const source=fs.readFileSync('assets/js/league.js','utf8');
 const pages=new Function('gameweekNumber',source.slice(source.indexOf('  const pages = ['),source.indexOf('  leagueName.textContent = league.name;'))+'return pages;')(9);
 const expected=pages.flatMap(p=>p.options?p.options.map(o=>o.page):[p.page]).sort();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='localhost')return route.abort();
  if(url.pathname==='/league.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync('league.html','utf8').replace(/<script\b[\s\S]*?<\/script>/gi,s=>/league-navigation.js|wider-polish.js|legal-footer.js/.test(s)?s:'').replace(/pp-page-loading/g,'')});
  return route.continue();
 });
 await page.goto('http://localhost:4173/league.html');
 await page.evaluate(async pages=>{
  const {renderHubNavigation}=await import('/assets/js/league-hub-view.js');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.querySelector('[data-play-grid]').innerHTML=renderHubNavigation(pages,'test-league',9,(p,id)=>p+'?league='+id,escape);
  document.querySelector('[data-league-name]').textContent='PREM PREDICS 26/27';
  document.querySelector('[data-member-count]').textContent='10 players · Private league';
  document.querySelector('[data-join-code]').textContent='PREM123';
  document.querySelector('[data-gameweek-label]').textContent='Next Gameweek 9';
  document.querySelector('[data-gameweek-countdown]').textContent='1d 12h 30m';
  document.querySelector('[data-deadline-strip]').innerHTML=['Next Prediction Deadline','Star Man, Game Card & Play Power Card Deadline','Play Curse Card Deadline'].map(t=>`<article class="deadline-card"><div class="deadline-title">${t}</div><div class="deadline-body"><strong class="deadline-countdown">1d 10h</strong></div></article>`).join('');
  document.querySelector('[data-medal-progress]').innerHTML='<div class="medal-progress-heading"><strong>Next Medal Progress</strong><a href="medals.html">View Medals</a></div><div class="medal-progress-grid">'+['UC Points','Star Man Goals'].map((t,i)=>`<article class="medal-progress-card"><div class="medal-progress-top"><span>${t}</span><strong>72%</strong></div><div class="medal-progress-copy"><b>${i?'18/25':'360/500'}</b><span>Next medal at ${i?'25 goals':'500 UC pts'}</span></div><div class="medal-progress-track"><span style="width:72%"></span></div></article>`).join('')+'</div>';
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/assets/css/notifications.css';document.head.append(sheet);
  await import('/assets/js/notifications.js');
 },pages);
 assert.deepEqual(await page.locator('[data-play-grid] a').evaluateAll(a=>a.map(n=>new URL(n.href).pathname.split('/').pop()).sort()),expected);
 assert.equal(await page.locator('[data-choice-menu]').count(),0);
 assert.equal(await page.locator('.pp-notification-bell').count(),1);
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:950});
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
  for(const a of await page.locator('[data-play-grid] a').all()){
   const box=await a.boundingBox();assert(box&&box.height>=43,'small link at '+width);
  }
  await page.screenshot({path:'outputs/hub-studio-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.league-menu-toggle').click();
 assert.equal(await page.locator('.league-menu-toggle').getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.league-menu-toggle').getAttribute('aria-expanded'),'false');
 await page.locator('.hub-deadlines summary').click();
 assert.equal(await page.locator('.hub-deadlines').getAttribute('open'),'');
 await page.locator('.join-code summary').click();assert(await page.locator('[data-copy-join-code]').isVisible());
 await page.evaluate(()=>{document.documentElement.classList.add('pp-halloween');document.querySelector('[data-league-name]').textContent='A VERY LONG PRIVATE LEAGUE NAME FOR THE NEW SEASON';document.querySelector('[data-join-code-panel]').hidden=true;});
 assert(!(await page.locator('[data-join-code-panel]').isVisible()));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'outputs/hub-studio-halloween.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: all 12 destinations, direct pick/history links, 5 viewport widths, touch targets, menu/Escape, deadlines, join code/full league, long name and Halloween.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
