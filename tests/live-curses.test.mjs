import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentLiveCurseEffects, effectAppliesToGameweek } from '../assets/js/live-curses-model.js';

const leagueHtml = readFileSync(new URL('../league.html', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('../live-curses.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../assets/js/live-curses.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const realtimeMigration = readFileSync(new URL('../supabase/live-curses-realtime-2026-08-30.sql', import.meta.url), 'utf8');

test('current Gameweek includes direct and spanning live curses only', () => {
  const gameweeks = new Map([['gw1', 1], ['gw2', 2], ['gw3', 3], ['gw4', 4]]);
  const current = { gameweek_id: 'gw2', gameweek_number: 2 };
  const effect = (overrides = {}) => ({
    id: crypto.randomUUID(), status: 'active', target_user_id: 'target', gameweek_id: 'gw2', ...overrides,
  });
  const rows = [
    effect(),
    effect({ gameweek_id: 'gw1', start_gameweek_id: 'gw1', end_gameweek_id: 'gw3' }),
    effect({ gameweek_id: 'gw1' }),
    effect({ gameweek_id: 'gw3' }),
    effect({ status: 'vetoed' }),
    effect({ status: 'cancelled' }),
    effect({ target_user_id: null }),
  ];
  assert.equal(currentLiveCurseEffects(rows, current, gameweeks).length, 2);
  assert.equal(effectAppliesToGameweek(rows[1], current, gameweeks), true);
  assert.equal(effectAppliesToGameweek(rows[2], current, gameweeks), false);
});

test('Live Curses UI is linked, realtime, personalised and PWA-cached', () => {
  assert.match(leagueHtml, /data-live-curse-alert/);
  assert.match(leagueHtml, /live-curses-card/);
  assert.match(pageHtml, /data-curse-board/);
  assert.match(pageHtml, /data-own-curse-alert/);
  assert.match(pageJs, /postgres_changes/);
  assert.match(pageJs, /setInterval/);
  assert.match(pageJs, /You have \$\{ownCount\} Live Curse/);
  assert.match(pageJs, /card_definitions!inner/);
  assert.match(worker, /prem-predics-pwa-v45/);
  assert.match(worker, /\.\/live-curses\.html/);
  assert.match(realtimeMigration, /pg_publication_tables/);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.active_card_effects/);
  assert.doesNotMatch(realtimeMigration, /\b(?:delete|truncate)\s+from\b/i);
});
