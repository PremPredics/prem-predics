import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const game = read('../assets/js/game-card.js');

test('season history uses numeric newest-first order, keeps zero, omits pending and other cards', () => {
  const fn = game.slice(game.indexOf('function renderSeasonResults'), game.indexOf('function renderRound'));
  const context = {
    state: { gameweeks: [1,2,9,10,34,35,36].map(n => ({gameweek_id:n,gameweek_number:n})),
      results:new Map([['a:1',{actual_value:0}],['a:2',{actual_value:7}],['a:9',{actual_value:3}],['a:10',{actual_value:9}],['a:34',{actual_value:254}],['a:35',{actual_value:null}],['b:36',{actual_value:88}]]) },
    resultKey:(a,b)=>`${a}:${b}`, escapeHtml:String, normaliseNested:x=>x, formatActualValue:String,
  };
  vm.createContext(context);
  const html=vm.runInContext(fn+'; renderSeasonResults({card_id:"a",card_definitions:{name:"Corners"}})',context);
  assert.ok(html.indexOf('GW34:') < html.indexOf('GW10:'));
  assert.ok(html.includes('<strong>0</strong>'));
  assert.ok(!html.includes('GW35:') && !html.includes('GW36:'));
  assert.equal((html.match(/class="season-result"/g)||[]).length,5);
});

test('member lists retain join order with a deterministic tie-break, not current-user/name order', () => {
  for(const file of ['all-predictions.js','all-star-men.js','correct-scores.js','statistics.js']) {
    const text=read('../assets/js/'+file);
    assert.match(text,/order\('joined_at', \{ ascending: true \}\)/);
    assert.match(text,/order\('user_id', \{ ascending: true \}\)/);
    assert.doesNotMatch(text,/members\.sort|sortRows\(rows, currentUserId\)/);
  }
});

test('fast loads never mount an overlay; completion cancels pending reveal', async () => {
  let now=0; const timers=new Map(); let next=0;
  const classes=new Set(['pp-page-loading']);
  const context={performance:{now:()=>now},document:{body:{classList:{contains:x=>classes.has(x),remove:(...xs)=>xs.forEach(x=>classes.delete(x))}}},window:{
    setTimeout:(fn)=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++next,clearInterval:()=>{},
  }};
  vm.createContext(context);
  vm.runInContext(read('../assets/js/page-loader.js').replaceAll('export ',''),context);
  now=100;
  await vm.runInContext('finishPageLoader()',context);
  assert.equal(timers.size,0);
  assert.equal(classes.has('pp-page-loading'),false);
  assert.equal(vm.runInContext('loader',context),null);
});
