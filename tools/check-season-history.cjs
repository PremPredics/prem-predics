const { chromium } = require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage();
  for(const width of [320,390,768,1280]) {
   await page.setViewportSize({width,height:900});
   await page.setContent(`<style>body{margin:12px;background:#47216e;font-family:Arial}*{box-sizing:border-box}${fs.readFileSync('assets/css/game-card-slick.css','utf8')}</style><section class="season-results"><div class="season-results-heading"><strong>Season so far</strong><span>Latest 5 · scroll for earlier results</span></div><div class="season-results-scroll" tabindex="0">${Array.from({length:34},(_,i)=>`<div class="season-result"><span>GW${34-i}:</span> <strong>254</strong></div>`).join('')}</div></section>`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.season-results-scroll').evaluate(x=>x.clientHeight),150);
   assert.equal(await page.locator('.season-result').first().evaluate(x=>x.scrollWidth>x.clientWidth),false);
   await page.locator('.season-results-scroll').evaluate(x=>x.scrollTop=x.scrollHeight);
   assert.ok(await page.locator('.season-results-scroll').evaluate(x=>x.scrollTop>0));
   console.log('PASS history layout and scrolling',width);
  }
  await page.setContent(`<body class="pp-page-loading"><style>${fs.readFileSync('assets/css/page-loader.css','utf8')}</style></body>`);
  await page.addScriptTag({content:fs.readFileSync('assets/js/page-loader.js','utf8').replaceAll('export ','')});
  await page.waitForFunction(()=>document.querySelector('.pp-page-loader'));
  assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('pp-loader-visible')),true);
  await page.evaluate(()=>finishPageLoader());
  assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('pp-loader-visible')),false);
  console.log('PASS slow loader appears and releases page immediately on completion');
  await page.goto('about:blank');
  await page.setContent('<body class="pp-page-loading"></body>');
  const loaderSource = fs.readFileSync('assets/js/page-loader.js','utf8');
  await page.evaluate(async source => {
    const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    window.loaderA = await import(url+'#first-version');
    window.loaderB = await import(url+'#second-version');
  }, loaderSource);
  await page.waitForFunction(()=>document.querySelector('[data-page-loader]'));
  assert.equal(await page.locator('[data-page-loader]').count(),1);
  await page.evaluate(()=>window.loaderB.finishPageLoader());
  await page.evaluate(()=>window.loaderA.setPageLoaderProgress(40));
  assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('pp-loader-visible')),false);
  assert.equal(await page.locator('[data-page-loader]:not([hidden])').count(),0);
  console.log('PASS mixed module URLs share one loader; neither can restart it');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
