const { chromium } = require('C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    const html = fs.readFileSync('awards.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, path) => `<style>${fs.readFileSync(path.split('?')[0], 'utf8')}</style>`);
    const model = fs.readFileSync('assets/js/awards-model.js', 'utf8').replaceAll('export ', '');
    const source = fs.readFileSync('assets/js/awards.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
    const members = ['Vas', 'ThomasColeman', 'LongestUsernameTwentyEightABC', 'Cornish06', 'Twoosh', 'Alex'].map((display_name,i) => ({
      user_id:String(i), display_name, nostradamus:i ? 2 : 8, best:i ? 2 : 7, post:14-i, superman:3,
      received:i ? 0 : 2, jinx:i ? 0 : 3, world:i ? 0 : 1, passport:5, starboy:18-i,
      star_pick_count:5,prediction_count:50,predicted_goals:150-i,wins: i < 2 ? 3 : i === 2 ? 1 : 0,
    }));
    const data = { members, copycats:[{user_a:'0',user_b:'1',matches:18}], completed_gameweeks:5,
      best_predictions:[{user_id:'0',goals:7,home_goals:5,away_goals:2,home_team:'Manchester United',away_team:'Ipswich Town',gameweek_number:2}] };
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({ width, height:900 });
      await page.setContent(html);
      await page.evaluate(data => { window.awardsFixture = data; }, data);
      await page.addScriptTag({ content:`(() => {
        const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const leagueUrl = (page,id) => page+'?competition='+id;
        const loadLeagueContext = async () => ({user:{id:'0'},league:{id:'league',name:'PREM PREDICS 26/27'}});
        const boundedRead = fn => fn();
        const supabase = { rpc: () => ({abortSignal:async () => ({data:window.awardsFixture})}) };
        ${model}\n${source}
      })();` });
      await page.waitForSelector('.award-card');
      assert.equal(await page.locator('.award-card').count(),11);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow ${width}`);
      const overflow = await page.locator('.award-card, .podium-place').evaluateAll(elements => elements.flatMap(el => {
        const box=el.getBoundingClientRect();
        return [...el.querySelectorAll('*')].filter(child => {
          const r=child.getBoundingClientRect(); return r.width && (r.right>box.right+1 || r.left<box.left-1);
        }).map(child=>child.className);
      }));
      assert.deepEqual(overflow,[],`content overflow ${width}: ${overflow.join(', ')}`);
      assert.equal(await page.locator('.podium-place.gold .award-person').count(),2);
      assert.equal(await page.locator('.podium-place.bronze .award-person').count(),1);
      if (width === 390) await page.screenshot({ path:'../awards-mobile.png',fullPage:true });
      if (width === 1280) await page.screenshot({ path:'../awards-desktop.png',fullPage:true });
      console.log('PASS Awards, ties and long names at',width);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
