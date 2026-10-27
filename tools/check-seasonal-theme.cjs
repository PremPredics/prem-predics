const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage();
  let enabled = true;
  await page.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if(url.pathname.includes('/rest/v1/site_theme_settings')) return route.fulfill({contentType:'application/json',body:JSON.stringify([{halloween_enabled:enabled}])});
    if(url.hostname !== 'localhost') return route.abort();
    if(url.pathname.endsWith('.html')){
      const html=fs.readFileSync('.'+url.pathname,'utf8')
        .replace(/<script\b[\s\S]*?<\/script>/gi,s=>/seasonal-theme.js|league-navigation.js/.test(s)?s:'')
        .replace(/pp-page-loading|pp-card-data-pending/g,'');
      return route.fulfill({contentType:'text/html',body:html});
    }
    return route.continue();
  });
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://localhost:4173/league.html');
    await page.waitForFunction(()=>document.documentElement.classList.contains('pp-halloween'));
    assert.ok(await page.locator('.pp-pumpkin').count()>0);
    await page.evaluate(()=>{
      document.querySelector('[data-league-name]').textContent='PREM PREDICS 26/27';
      document.querySelector('[data-member-count]').textContent='(10 Active Players)';
      document.querySelector('[data-join-code-panel]').hidden=true;
      document.querySelector('[data-gameweek-label]').textContent='Current Gameweek';
      document.querySelector('[data-gameweek-countdown]').textContent='GW8';
      document.querySelector('[data-medal-progress]').innerHTML='<span class="avatar" style="display:inline-grid;place-items:center;border-radius:50%;width:38px;height:38px;background:#5a3290;margin:10px">V</span> Your medal progress';
    });
    const outline=await page.locator('.avatar').evaluate(e=>getComputedStyle(e).outlineStyle);
    assert.equal(outline,'dashed');
    await page.locator('.hub-deadlines summary').click();
    assert.ok(await page.locator('.hub-deadlines').evaluate(e=>e.open));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===390) await page.screenshot({path:'outputs/halloween-hub-mobile.png',fullPage:true});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pp-theme-changed',{detail:{enabled:false}})));
    assert.equal(await page.locator('.pp-pumpkin').count(),0);
    assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('pp-halloween')),false);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pp-theme-changed',{detail:{enabled:true}})));
    assert.ok(await page.locator('.pp-pumpkin').count()>0);
  }
  const source=fs.readFileSync('assets/js/notifications.js','utf8');
  assert.ok(!source.includes('Gameweek X')&&!source.includes('Gameweek Y'));
  assert.ok(!source.includes('For your leagues, once per gameweek'));
  for(const file of fs.readdirSync('.').filter(n=>n.endsWith('.html'))){
    assert.ok(fs.readFileSync(file,'utf8').includes('seasonal-theme.js'),file+' theme coverage');
  }
  enabled=false;
  await page.goto('http://localhost:4173/index.html');
  await page.waitForFunction(()=>!document.documentElement.classList.contains('pp-halloween'));
  assert.equal(await page.locator('.pp-pumpkin').count(),0);
  await browser.close();
  console.log('PASS: theme on/off, dynamic avatar rings, 4 viewport sizes, no overflow, every page included, notification copy.');
})().catch(e=>{console.error(e);process.exit(1)});
