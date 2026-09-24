import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL(p,import.meta.url),'utf8');

test('PWA installation has unique assets and refreshes them for the new release',()=>{
 const source=read('../service-worker.js');
 const context={self:{addEventListener(){}}};vm.createContext(context);
 vm.runInContext(source,context);
 assert.equal(vm.runInContext('new Set(APP_SHELL).size === APP_SHELL.length',context),true);
 assert.match(source,/new Request\(url, \{ cache: 'reload' \}\)/);
});

test('Gameweek reads start together, share in-flight work, and refresh on later calls', async()=>{
 const calls=[];const releases=[];
 const tables={gameweek_deadlines:[{gameweek_id:1,gameweek_number:1},{gameweek_id:2,gameweek_number:2}],fixtures:[{id:1,gameweek_id:1,status:'final'},{id:2,gameweek_id:2,status:'scheduled'}]};
 const supabase={from(table){calls.push(table);const q={select(){return q},eq(){return q},gte(){return q},order(){return q},abortSignal(){return q},then(resolve){return new Promise(r=>releases.push(()=>r({data:tables[table]}))).then(resolve)}};return q}};
 const context={supabase,boundedRead:fn=>Promise.resolve(fn()),window:{setInterval(){}}};vm.createContext(context);
 vm.runInContext(read('../assets/js/gameweek-context.js').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),context);
 const p=vm.runInContext('loadActiveGameweek({season_id:"s",starts_gameweek_id:1})',context);
 const p2=vm.runInContext('loadActiveGameweek({season_id:"s",starts_gameweek_id:1})',context);
 await Promise.resolve();
 assert.deepEqual(calls,['gameweek_deadlines','fixtures']);
 releases.splice(0).forEach(fn=>fn());
 assert.equal((await p).activeGameweek.gameweek_number,2);
 assert.equal((await p2).activeGameweek.gameweek_number,2);
 const p3=vm.runInContext('loadActiveGameweek({season_id:"s",starts_gameweek_id:1})',context);
 await Promise.resolve();assert.equal(calls.length,4);releases.splice(0).forEach(fn=>fn());await p3;
});

test('Power Cards hides partial data and reveals before interactive recovery',()=>{
 const page=read('../power-cards.html');
 assert.match(page,/body\.pp-card-data-pending #mainGameLayout \{ visibility: hidden/);
 assert.match(page,/finishPowerPageLoading\(\);\s*await resumePendingRandomCurse/);
 assert.match(page,/class="pp-page-loading pp-card-data-pending"/);
});

test('navigation identity uses the shared session, but membership is still read under RLS',()=>{
 const code=read('../assets/js/league-context.js');
 assert.match(code,/await getSessionUser\(\)/);
 assert.doesNotMatch(code,/auth\.getUser\(/);
 assert.match(code,/from\('competition_members'\)/);
 assert.match(code,/\.eq\('user_id', user.id\)/);
 assert.match(code,/\.maybeSingle\(\)\.abortSignal\(signal\)/);
 assert.match(code,/You do not have access/);
});
