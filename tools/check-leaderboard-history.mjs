import assert from 'node:assert/strict';
import {rankingFields,rankRows,buildLeaderboardHistory} from '../assets/js/leaderboard-history-model.js';
const members=[{user_id:'a',display_name:'Amy'},{user_id:'b',display_name:'Ben'},{user_id:'c',display_name:'Cora'}];
const stat=(id,week,points,extra={})=>({...Object.fromEntries(rankingFields.map(f=>[f,0])),user_id:id,gameweek_id:week,ultimate_champion_points:points,...extra});
const fixture=(week,status='final',extra={})=>({gameweek_id:week,status,kickoff_at:'2026-01-01T15:00:00Z',match_results:[{fixture_id:week}],...extra});
const gameweeks=[1,2,3].map(number=>({id:number,number}));
const data={gameweeks,members,startsGameweekId:1,fixtures:[fixture(1),fixture(2),fixture(3,'scheduled')],weeklyStats:[
  stat('a',1,10),stat('b',1,7),stat('c',1,2),
  stat('a',2,-1),stat('b',2,6),stat('c',2,3),
  stat('a',3,999),stat('b',3,0),stat('c',3,0),
]};
let result=buildLeaderboardHistory(data);
assert.deepEqual(result.weeks.map(w=>w.number),[1,2]);
assert.equal(result.movements.get('a'),-1);
assert.equal(result.movements.get('b'),1);
assert.equal(result.movements.get('c'),0);
assert.equal(result.weeks[1].rows.find(r=>r.user_id==='a').ultimate_champion_points,9);
assert.deepEqual(rankRows([stat('a',1,1),stat('b',1,1),stat('c',1,0)]).map(r=>r.rank),[1,1,3]);
assert.equal(rankRows([stat('a',1,1,{star_man_reds:2}),stat('b',1,1,{star_man_reds:1})])[0].user_id,'b');
assert.equal(rankRows([stat('a',1,1,{prediction_points:4}),stat('b',1,1,{star_man_points:7})])[0].user_id,'a');
result=buildLeaderboardHistory({...data,fixtures:[fixture(1),fixture(2,'scheduled'),fixture(3)]});
assert.equal(result.weeks.length,1,'later finals must not skip an unfinished week');
assert.equal(result.movements.size,0);
result=buildLeaderboardHistory({...data,fixtures:[fixture(1),fixture(2),fixture(2,'postponed'),fixture(3,'scheduled')]});
assert.equal(result.weeks.length,2);
result=buildLeaderboardHistory({...data,fixtures:[fixture(1,'final',{match_results:[]})]});
assert.equal(result.weeks.length,0,'final status alone is not sufficient');
result=buildLeaderboardHistory({...data,fixtures:[fixture(1,'final',{kickoff_at:'2099-01-01T00:00:00Z'})]});
assert.equal(result.weeks.length,0);
result=buildLeaderboardHistory({...data,startsGameweekId:2});
assert.equal(result.weeks[0].rows.find(r=>r.user_id==='a').ultimate_champion_points,-1,'late-start league excludes earlier weeks');
assert.throws(()=>buildLeaderboardHistory({...data,weeklyStats:data.weeklyStats.slice(1)}),/incomplete/);
console.log('PASS: cumulative points, up/down/level, ties, tiebreak order, incomplete/future weeks, postponed fixtures, late-start league, missing data.');
