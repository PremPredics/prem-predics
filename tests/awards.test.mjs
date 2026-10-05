import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAwards, championStandings } from '../assets/js/awards-model.js';

test('unearned awards are hidden; a real 0-0 CS and zero-goal average still qualify', () => {
  assert.deepEqual(buildAwards({members:[{user_id:'a'}]}), []);
  const awards = buildAwards({members:[{user_id:'a',best:0,prediction_count:10,predicted_goals:0}]});
  assert.deepEqual(awards.map(a => a.key), ['entertainer','best']);
});
test('all equal holders and all equal Copycats pairs share awards', () => {
  const awards = buildAwards({members:[{user_id:'a',nostradamus:3},{user_id:'b',nostradamus:3}],
    copycats:[{user_a:'a',user_b:'b',matches:4},{user_a:'a',user_b:'c',matches:4},{user_a:'b',user_b:'c',matches:2}]});
  assert.equal(awards.find(a => a.key === 'nostradamus').holders.length, 2);
  assert.equal(awards.find(a => a.key === 'copycats').pairs.length, 2);
});
test('averages compare exact ratios, not rounded display values', () => {
  const data = {members:[{user_id:'a',prediction_count:1000,predicted_goals:3001},
    {user_id:'b',prediction_count:1000,predicted_goals:3002}]};
  assert.equal(buildAwards(data)[0].holders[0].user_id, 'b');
  data.members[1] = {user_id:'b',prediction_count:2000,predicted_goals:6002};
  assert.equal(buildAwards(data)[0].holders.length, 2);
});
test('Starboy requires a revealed selection but can recognise the best negative total', () => {
  const award = buildAwards({members:[{user_id:'a',star_pick_count:2,starboy:-1},
    {user_id:'b',star_pick_count:2,starboy:-4},{user_id:'c',starboy:0}]}).find(a => a.key === 'starboy');
  assert.equal(award.value,-1);
  assert.equal(award.holders[0].user_id,'a');
});
test('champion positions share ties, skip occupied ranks, and sort tied names only', () => {
  const result = championStandings([{display_name:'Zed',wins:3},{display_name:'Amy',wins:3},
    {display_name:'Cal',wins:1},{display_name:'Bea',wins:0}]);
  assert.deepEqual(result.map(r => [r.display_name,r.rank]),[['Amy',1],['Zed',1],['Cal',3],['Bea',4]]);
  assert.deepEqual(championStandings([{wins:2},{wins:1}]).map(r => r.rank),[1,2]);
});
