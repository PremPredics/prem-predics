import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAllRows } from '../assets/js/load-all-rows.js';
import { createPlayerStatsIndex, matchesPlayerSearch } from '../assets/js/player-stats-pool.js';
import { readIdentityEvidence, identityEvidenceSql } from '../tools/player-identity-evidence.mjs';
import { readFileSync } from 'node:fs';

test('loads every row even when server cap is smaller than the requested page', async () => {
  const all = Array.from({ length: 1542 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await loadAllRows((first) => ({ range: async (from, to) => {
    ranges.push([from, to]);
    return { data: all.slice(from, Math.min(to + 1, from + 200)), count: first ? all.length : null };
  } }));
  assert.deepEqual(result, all);
  assert.equal(ranges[1][0], 200);
  assert.equal(new Set(result.map((p) => p.id)).size, 1542);
});

test('pagination does not mistake a short capped page for EOF without a count', async () => {
  const result = await loadAllRows(() => ({ range: async (start) => ({ data: [1, 2, 3, 4, 5].slice(start, start + 2) }) }));
  assert.deepEqual(result, [1, 2, 3, 4, 5]);
});

test('pagination surfaces errors and incomplete counts instead of publishing a partial pool', async () => {
  await assert.rejects(loadAllRows(() => ({ range: async () => ({ error: new Error('Offline') }) })), /Offline/);
  await assert.rejects(loadAllRows(() => ({ range: async () => ({ data: [], count: 5 }) })), /changed while loading/);
});

const gameweeks = [
  { id: 900, number: 1, season_id: 'current' },
  { id: 100, number: 2, season_id: 'current' },
  { id: 500, number: 3, season_id: 'current' },
  { id: 101, number: 1, season_id: 'old' },
];
const fixtures = gameweeks.filter((g) => g.season_id === 'current').flatMap((gw) => [
  { id: `a${gw.number}`, season_id: 'current', gameweek_id: gw.id, home_team_id: 'a', away_team_id: 'c' },
  { id: `b${gw.number}`, season_id: 'current', gameweek_id: gw.id, home_team_id: 'b', away_team_id: 'd' },
]);
const assignment = (player_id, team_id, start, end = null, season_id = 'current') => ({ player_id, team_id, starts_gameweek_id: start, ends_gameweek_id: end, season_id });

test('historical fixtures follow assignment GW numbers, not current club or numeric ID order', () => {
  const player = Object.freeze({ id: 'transfer', team_id: 'b', is_active: true });
  const index = createPlayerStatsIndex({ seasonId: 'current', gameweeks, fixtures,
    assignments: [assignment(player.id, 'a', 900, 900), assignment(player.id, 'b', 100)] });
  assert.equal(index.teamForFixture(player, fixtures[0]), 'a');
  assert.equal(index.teamForFixture(player, fixtures[1]), null);
  assert.equal(index.teamForFixture(player, fixtures[2]), null);
  assert.equal(index.teamForFixture(player, fixtures[3]), 'b');
  assert.equal(player.team_id, 'b');
});

test('gaps, wrong seasons and conflicting overlaps fail closed; identical-team overlaps are harmless', () => {
  const p = { id: 'p', team_id: 'a', is_active: true };
  const make = (assignments) => createPlayerStatsIndex({ seasonId: 'current', gameweeks, fixtures, assignments });
  assert.equal(make([]).teamForFixture(p, fixtures[0]), null);
  assert.equal(make([assignment('p', 'a', 101, null, 'old')]).teamForFixture(p, fixtures[0]), null);
  assert.equal(make([assignment('p', 'a', 100)]).teamForFixture(p, fixtures[0]), null);
  assert.equal(make([assignment('p', 'a', 900), assignment('p', 'b', 900)]).teamForFixture(p, fixtures[0]), null);
  assert.equal(make([assignment('p', 'a', 900), assignment('p', 'a', 900)]).teamForFixture(p, fixtures[0]), 'a');
  assert.equal(make([assignment('p', 'a', 900, 999)]).teamForFixture(p, fixtures[0]), null);
});

test('inactive players need eligible history; active missing-history rows are findable but not editable', () => {
  const active = { id: 'a', team_id: 'a', is_active: true };
  const departed = { id: 'b', team_id: 'outside', is_active: false };
  const unused = { id: 'c', team_id: 'a', is_active: false };
  const index = createPlayerStatsIndex({ seasonId: 'current', gameweeks, fixtures,
    assignments: [assignment('b', 'a', 900, 900)] });
  assert.ok(index.eligible(active));
  assert.equal(index.teamForFixture(active, fixtures[0]), null);
  assert.ok(index.eligible(departed));
  assert.equal(index.eligible(unused), false);
  assert.equal(index.teamForFixture(departed, fixtures[0]), 'a');
  assert.equal(index.teamForFixture(departed, fixtures[2]), null);
});

const evidence = readIdentityEvidence();
test('all documented identity names are generated reproducibly, without running old roster SQL', () => {
  assert.equal(evidence.length, 1560);
  const migration = readFileSync(new URL('../supabase/player-stats-pool-integrity-2026-08-28.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes(identityEvidenceSql()));
  const executable = migration.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(executable, /\b(?:delete\s+from|truncate|drop\s+table)\b/i);
  assert.doesNotMatch(executable, /set\s+(?:is_active|display_name)\s*=/i);
});

for (const [displayName, queries] of [
  ['Rayan Cherki', ['Cherki', 'Rayan', 'Rayan Cherki']],
  ['Phil Foden', ['Foden', 'Phil Foden', 'Philip Foden']],
]) {
  for (const query of queries) test(`search ${query} finds ${displayName} without changing display name`, () => {
    const player = Object.freeze({ display_name: displayName });
    const names = evidence.find((row) => row.canonical_name === displayName).names;
    assert.ok(matchesPlayerSearch(player, query, names));
    assert.equal(player.display_name, displayName);
  });
}

test('accent-insensitive and multi-part searching stays intact', () => {
  for (const [name, query] of [['Christian Nørgaard', 'Norgaard'], ['João Pedro', 'joao'], ['Łukasz', 'lukasz'], ['Rayan Aït-Nouri', 'ait-nouri']]) {
    assert.ok(matchesPlayerSearch({ display_name: name }, query));
  }
  assert.equal(matchesPlayerSearch({ display_name: 'Phil Foden' }, 'Philippine Foden'), false);
});
