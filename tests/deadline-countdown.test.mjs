import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDeadlineDuration} from '../assets/js/deadline-countdown.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const hour=3600000;
test('countdowns switch units at exactly 24 hours without rounding up early',()=>{
 for(const [ms,text] of [[51*hour,'2d 3h'],[24*hour,'1d 0h'],[24*hour-1,'23h 59m'],[hour+12*60000,'1h 12m'],[59000,'0h 1m'],[0,'0h 0m'],[-1,'0h 0m'],[NaN,'0h 0m']]) assert.equal(formatDeadlineDuration(ms),text);
});

test('All Predictions fetches each base table once and derives the current week locally',async()=>{
 const code=readFileSync(new URL('../assets/js/all-predictions.js',import.meta.url),'utf8');
 const fn=code.slice(code.indexOf('async function loadData()'),code.indexOf('function scheduleCurseRefresh'));
 const calls=[];
 const tables={teams:[{id:1,name:'Team'}],gameweek_deadlines:[{gameweek_id:4,gameweek_number:1},{gameweek_id:5,gameweek_number:2}],fixtures:[{id:1,gameweek_id:4,status:'final'},{id:2,gameweek_id:5,status:'scheduled'}],competition_members:[{user_id:'u',profiles:{display_name:'User'}}]};
 const supabase={from(table){calls.push(table);const q={select(){return q},eq(){return q},order(){return q},then(resolve){return Promise.resolve({data:tables[table]}).then(resolve)}};return q;}};
 const state={league:{id:'league',season_id:'s',starts_gameweek_id:4},user:{id:'u'}};
 const context={supabase,state,boundedRead:fn=>fn(),normaliseNested:x=>x,selectActiveGameweek:(weeks,groups)=>weeks.find(w=>groups.get(String(w.gameweek_id)).some(f=>f.status!=='final')),initialGameweekIndex:w=>state.gameweeks.indexOf(w)};
 vm.createContext(context);await vm.runInContext(fn+';loadData()',context);
 assert.deepEqual(calls,['teams','gameweek_deadlines','fixtures','competition_members']);
 assert.equal(state.selectedGameweekIndex,1);
 assert.equal(state.selectedUserId,'u');
 assert.doesNotMatch(code,/await loadActiveGameweek\(state.league\)/);
});
