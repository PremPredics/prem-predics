const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const pages = ['all-predictions','all-star-men','correct-scores','game-card','leaderboard','live-curses','prediction-hub','power-cards','statistics','star-man','star-man-hub','predictions','medals','awards'];
async function main() {
  // Exercise the real deadline renderer without auth or live database writes.
  const source = fs.readFileSync('assets/js/league.js','utf8');
  const names = ['earliestTime','isoFromMs','fixturePredictionLockTime','compactCountdownText','deadlineDisplay','renderDeadlineCard','renderDeadlineStrip'];
  const functions = names.map(name => {
    const start = source.search(new RegExp('(?:async )?function '+name+'\\('));
    const end = source.indexOf('\n}', start) + 2;
    return source.slice(start,end);
  }).join('\n');
  const ctx = { Date, deadlineStrip:{innerHTML:''}, deadlineTimer:null, escapeHtml:s=>String(s), window:{setInterval:()=>1,clearInterval:()=>{}}, formatDeadlineDuration:ms=>ms>=86400000?Math.floor(ms/86400000)+'d '+Math.floor(ms/3600000)%24+'h':Math.floor(ms/3600000)+'h '+Math.floor(ms/60000)%60+'m' };
  vm.createContext(ctx);
  vm.runInContext(functions,ctx);
  const now = Date.now();
  const fixture = offset => ({kickoff_at:new Date(now+offset+5400000).toISOString(), prediction_locks_at:new Date(now+offset).toISOString()});
  ctx.fixtures = [fixture(-1000),fixture(7200000),fixture(172800000)];
  await vm.runInContext('renderDeadlineStrip({gameweek_number:4},fixtures,{}, {})',ctx);
  assert.equal((ctx.deadlineStrip.innerHTML.match(/class="deadline-card /g)||[]).length,3);
  assert.match(ctx.deadlineStrip.innerHTML,/Next Prediction Deadline/);
  assert.match(ctx.deadlineStrip.innerHTML,/1h 59m|2h 0m/);
  ctx.fixtures=[fixture(-1000)];
  await vm.runInContext('renderDeadlineStrip({gameweek_number:4},fixtures,{}, {})',ctx);
  assert.match(ctx.deadlineStrip.innerHTML,/All predictions locked/);
  ctx.fixtures=[{...fixture(1000),status:'postponed'},fixture(176400000)];
  await vm.runInContext('renderDeadlineStrip({gameweek_number:4},fixtures,{}, {})',ctx);
  assert.match(ctx.deadlineStrip.innerHTML,/2d /);
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page = await browser.newPage();
  await page.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if(url.hostname!=='localhost') return route.abort();
    if(url.pathname.endsWith('.html')){
      let html=fs.readFileSync('.'+url.pathname,'utf8');
      html=html.replace(/<script\b[\s\S]*?<\/script>/gi,s=>/src="assets\/js\/league-(return|navigation)\.js/.test(s)?s:'');
      html=html.replace(/pp-page-loading|pp-card-data-pending/g,'');
      return route.fulfill({contentType:'text/html',body:html});
    }
    return route.continue();
  });
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const name of pages){
      await page.goto('http://localhost:4173/'+name+'.html?competition_id=test-league');
      await page.addScriptTag({url:'http://localhost:4173/assets/js/notifications.js',type:'module'});
      await page.locator('.pp-notification-bell').waitFor();
      await page.waitForFunction(()=>Array.from(document.styleSheets).some(s=>s.href?.includes('notifications.css')));
      const result=await page.evaluate(()=>{
        const back=document.querySelector('.league-return-icon'), header=back?.closest('header');
        const r=back?.getBoundingClientRect();
        const bell=header.querySelector('.pp-notification-bell').getBoundingClientRect();
        return {header:!!header,width:r?.width,height:r?.height,left:r?.left,top:r?.top,bellWidth:bell.width,bellTop:bell.top,href:back.href};
      });
      assert.equal(result.header,true,name);
      assert.equal(result.width,40,name+' width');
      assert.equal(result.height,40,name+' height');
      assert.ok(result.left>=0 && result.left+40<=width,name+' within viewport');
      assert.equal(result.bellWidth,40,name+' bell');
      assert.ok(Math.abs(result.bellTop-result.top)<1,name+' aligned with bell '+JSON.stringify(result));
      if(result.href) assert.ok(result.href.endsWith('league.html?competition_id=test-league'),name+' correct league');
      if(width===390 && name==='leaderboard') await page.screenshot({path:'outputs/compact-leaderboard-mobile.png',fullPage:true});
    }
    await page.goto('http://localhost:4173/league.html');
    await page.evaluate(markup=>{
      document.querySelector('[data-league-name]').textContent='PREM PREDICS 26/27';
      document.querySelector('[data-member-count]').textContent='(8 Active Players)';
      document.querySelector('[data-gameweek-label]').textContent='Current Gameweek:';
      document.querySelector('[data-gameweek-countdown]').textContent='Gameweek 6 Is Active';
      document.querySelector('[data-deadline-strip]').innerHTML=markup;
    },ctx.deadlineStrip.innerHTML);
    assert.equal(await page.locator('.hub-deadlines').getAttribute('open'),null);
    await page.locator('.hub-deadlines summary').click();
    assert.equal(await page.locator('.deadline-card').count(),3);
    await page.locator('.join-code summary').click();
    assert.ok(await page.locator('[data-copy-join-code]').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'hub overflow '+width);
    if(width===390) await page.screenshot({path:'outputs/compact-league-mobile.png',fullPage:true});
    await page.locator('.hub-deadlines summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.hub-deadlines').getAttribute('open'),null);
  }
  await browser.close();
  console.log('PASS: deadline edge cases, all 14 back controls at 4 widths, expandable controls and keyboard toggling.');
}
main().catch(e=>{console.error(e);process.exit(1)});
