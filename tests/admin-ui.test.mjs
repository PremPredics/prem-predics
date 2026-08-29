import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';
import { fakeSupabase } from './support/fake-supabase.mjs';
import { loadAllRows } from '../assets/js/load-all-rows.js';
import { createPlayerStatsIndex, normalisePlayerSearch, matchesPlayerSearch } from '../assets/js/player-stats-pool.js';
const { JSDOM } = testDependency('jsdom');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function adminFixture(handler) {
  const tables = {
    seasons: [{ id: 's', name: 'Current', is_active: true, starts_on: '2026-08-01' }, { id: 'old', name: 'Old', is_active: false, starts_on: '2025-08-01' }],
    teams: [{ id: 'city', name: 'Manchester City' }, { id: 'other', name: 'Other' }],
    gameweeks: [{ id: 100, season_id: 's', number: 1 }, { id: 200, season_id: 's', number: 2 }],
    fixtures: [{ id: 'f1', season_id: 's', gameweek_id: 100, home_team_id: 'city', away_team_id: 'other', kickoff_at: '2026-08-01', status: 'final' },
      { id: 'f2', season_id: 's', gameweek_id: 200, home_team_id: 'other', away_team_id: 'city', kickoff_at: '2026-08-08', status: 'scheduled' },
      ...Array.from({ length: 1001 }, (_, id) => ({ id: `old${id}`, season_id: 'old', kickoff_at: '2025-01-01' }))],
    players: [...Array.from({ length: 1250 }, (_, id) => ({ id: `legacy${id}`, display_name: `A legacy ${id}`, is_active: false, team_id: 'city' })),
      { id: 'foden', display_name: 'Phil Foden', first_name: 'Phil', last_name: 'Foden', team_id: 'city', is_active: true },
      { id: 'cherki', display_name: 'Rayan Cherki', first_name: 'Rayan', last_name: 'Cherki', team_id: 'city', is_active: true },
      { id: 'old-foden', display_name: 'Philip Walter Foden', team_id: 'city', is_active: false },
      { id: 'outside', display_name: 'Other Season Player', team_id: 'out', is_active: true }],
    player_team_assignments: ['foden', 'cherki', 'old-foden'].map((player_id) => ({ id: player_id, season_id: 's', player_id, team_id: 'city', starts_gameweek_id: 100, ends_gameweek_id: null })),
    player_name_aliases: [{ player_id: 'foden', name: 'Philip Walter Foden' }], card_definitions: [],
    player_fixture_stats: [{ fixture_id: 'f1', gameweek_id: 100, season_id: 's', player_id: 'foden', goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, outside_box_goals: 1, minutes_played: 87 }],
    player_gameweek_stats: [{ gameweek_id: 100, season_id: 's', player_id: 'foden', goals: 1, outside_box_goals: 1, minutes_played: 87 }],
    match_results: [], fixture_game_stats: [], roster_change_queue: [],
  };
  const dom = new JSDOM(readFileSync(new URL('../global-admin.html', import.meta.url), 'utf8'), { url: 'https://test.invalid/global-admin.html', runScripts: 'outside-only' });
  const client = fakeSupabase(tables, { handler });
  Object.assign(dom.window, { supabase: client, escapeHtml, shortTeamName: (v) => v, normaliseNested: (v) => v,
    loadAllRows, createPlayerStatsIndex, normalisePlayerSearch, matchesPlayerSearch });
  const source = readFileSync(new URL('../assets/js/global-admin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '');
  dom.window.eval(source + '\nwindow.testAdmin = {state, playerStatFlow, loadReferenceData, renderPlayerStatsControls, renderPlayerStatsEntry, saveSelectedPlayerStats, showSection};');
  return { dom, client, tables, api: dom.window.testAdmin };
}

test('admin loads full roster/current-season fixtures; checkbox refreshes results without touching shared arrays', async () => {
  const { dom, api, tables } = adminFixture();
  try {
    await api.loadReferenceData();
    assert.equal(api.state.rosterPlayers.length, 1254);
    assert.equal(api.state.players.length, 3);
    assert.equal(api.state.fixtures.length, 2, 'old fixtures cannot consume the active-season page');
    assert.ok(api.state.playerStatPlayers.some((p) => p.id === 'cherki'));
    const players = api.state.players;
    const roster = api.state.rosterPlayers;
    const doc = dom.window.document;
    api.showSection('player-stats');
    const input = doc.querySelector('[data-player-stats-search]');
    const checkbox = doc.querySelector('[data-player-stats-include-deactivated]');
    assert.equal(checkbox.checked, false);
    for (const query of ['Cherki', 'Rayan', 'Rayan Cherki', 'Foden', 'Phil Foden', 'Philip Foden']) {
      input.value = query;
      input.dispatchEvent(new dom.window.Event('input'));
      const results = doc.querySelector('[data-player-stats-player-list]').textContent;
      assert.match(results, /Rayan Cherki|Phil Foden/);
      assert.doesNotMatch(results, /Deactivated/);
    }
    input.value = 'Foden';
    input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(doc.querySelectorAll('[data-player-stats-player]').length, 1);
    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event('change'));
    assert.equal(doc.querySelectorAll('[data-player-stats-player]').length, 2);
    assert.match(doc.querySelector('[data-player-stats-player-list]').textContent, /Deactivated/);
    doc.querySelector('[data-player-stats-player="old-foden"]').click();
    checkbox.checked = false;
    checkbox.dispatchEvent(new dom.window.Event('change'));
    assert.equal(api.playerStatFlow.playerId, null);
    assert.equal(api.state.players, players);
    assert.equal(api.state.rosterPlayers, roster);
    assert.equal(tables.players.find((p) => p.id === 'old-foden').is_active, false);
    for (const section of ['actual-results', 'fixture-stats', 'schedule', 'roster-review']) {
      api.showSection(section);
      await flush();
      assert.equal(doc.querySelector(`[data-admin-section="${section}"]`).hidden, false);
    }
  } finally { dom.window.close(); }
});

test('stat entry/update keeps player ID, historical club and unedited detailed stats', async () => {
  const { dom, api, tables, client } = adminFixture();
  try {
    await api.loadReferenceData();
    api.state.user = { id: 'admin' };
    api.playerStatFlow.playerId = 'foden';
    api.playerStatFlow.fixtureId = 'f1';
    await api.renderPlayerStatsEntry();
    const entry = dom.window.document.querySelector('[data-player-stats-entry]');
    entry.querySelector('[data-goals]').value = '3';
    await api.saveSelectedPlayerStats(dom.window.document.querySelector('[data-player-stats-message]'));
    assert.equal(tables.player_fixture_stats[0].player_id, 'foden');
    assert.equal(tables.player_fixture_stats[0].team_id, 'city');
    assert.equal(tables.player_fixture_stats[0].goals, 3);
    assert.equal(tables.player_fixture_stats[0].outside_box_goals, 1);
    assert.equal(tables.player_fixture_stats[0].minutes_played, 87);
    assert.equal(tables.player_gameweek_stats[0].outside_box_goals, 1);
    assert.equal(tables.player_gameweek_stats[0].goals, 3);
    assert.deepEqual(client.calls.filter((q) => q.method === 'upsert').map((q) => q.table), ['player_fixture_stats', 'player_gameweek_stats']);
  } finally { dom.window.close(); }
});

test('late stat reads cannot overwrite a newly selected player or fixture', async () => {
  let resolveFirst;
  let statReads = 0;
  const { dom, api } = adminFixture((q) => {
    if (q.table === 'player_fixture_stats' && ++statReads === 1) return new Promise((r) => { resolveFirst = r; });
  });
  try {
    await api.loadReferenceData();
    api.playerStatFlow.playerId = 'foden';
    api.playerStatFlow.fixtureId = 'f1';
    const old = api.renderPlayerStatsEntry();
    await flush();
    assert.match(dom.window.document.querySelector('[data-player-stats-entry]').textContent, /Loading/);
    api.playerStatFlow.playerId = 'cherki';
    await api.renderPlayerStatsEntry();
    resolveFirst({ data: { goals: 19 }, error: null });
    await old;
    assert.match(dom.window.document.querySelector('[data-player-stats-entry]').textContent, /Rayan Cherki/);
    assert.equal(dom.window.document.querySelector('[data-goals]').value, '0');
  } finally { dom.window.close(); }
});
