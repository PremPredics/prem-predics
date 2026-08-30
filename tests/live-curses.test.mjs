import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentLiveCurseEffects, effectAppliesToGameweek } from '../assets/js/live-curses-model.js';

const leagueHtml = readFileSync(new URL('../league.html', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('../live-curses.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../assets/js/live-curses.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const realtimeMigration = readFileSync(new URL('../supabase/live-curses-realtime-2026-08-30.sql', import.meta.url), 'utf8');
const outcomeRealtimeMigration = readFileSync(new URL('../supabase/live-curse-outcomes-realtime-2026-08-30.sql', import.meta.url), 'utf8');
const predictionsJs = readFileSync(new URL('../assets/js/all-predictions.js', import.meta.url), 'utf8');

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
  assert.match(pageHtml, /#7b61d8/);
  assert.match(pageHtml, /#7354ca/);
  assert.match(pageHtml, /rgba\(46,16,102/);
  assert.doesNotMatch(leagueHtml, /\.play-card\.live-curses-card\s*\{[^}]*linear-gradient\(145deg, rgba\(127, 29, 29/s);
  assert.match(pageJs, /postgres_changes/);
  assert.match(pageJs, /setInterval/);
  assert.match(pageJs, /You have \$\{ownCount\} Live Curse/);
  assert.match(pageJs, /card_definitions!inner/);
  assert.match(pageHtml, /live-curse-card/);
  assert.match(pageHtml, /radial-gradient\(circle at 24% 18%, rgba\(254,202,202,.58\)/);
  assert.match(pageHtml, /linear-gradient\(135deg,#4c0519 0%,#991b1b 24%,#ef4444 50%/);
  assert.match(pageJs, /curse_hated_forced_predictions/);
  assert.match(pageJs, /curse_gambler_rolls/);
  assert.match(pageJs, /Live Effect/);
  assert.match(pageJs, /Dice-locked predictions/);
  assert.match(pageJs, /Prediction removed from scoring/);
  assert.match(pageJs, /starManLiveEffectByKey/);
  assert.match(pageJs, /profileFor\(effect\.target_user_id\)\.display_name/);
  assert.doesNotMatch(pageJs, /The target/i);
  assert.doesNotMatch(pageJs, /<p class="curse-description"/);
  assert.doesNotMatch(pageJs, /<span class="card-type">/);
  assert.doesNotMatch(pageHtml, /data-board-caption/);
  assert.match(pageHtml, /repeat\(var\(--curse-columns,1\),minmax\(0,1fr\)\)/);
  assert.match(pageJs, /--curse-columns:\$\{Math\.min\(3, effects\.length\)\}/);
  assert.match(predictionsJs, /const forcedCurseVisible = Boolean\(override\)/);
  assert.match(predictionsJs, /sameId\(state\.selectedUserId, state\.user\.id\) \|\| forcedCurseVisible/);
  assert.match(predictionsJs, /all-predictions-curses-/);
  assert.match(predictionsJs, /table: 'curse_gambler_rolls'/);
  assert.match(worker, /prem-predics-pwa-v51/);
  assert.match(worker, /\.\/live-curses\.html/);
  assert.match(realtimeMigration, /pg_publication_tables/);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.active_card_effects/);
  assert.doesNotMatch(realtimeMigration, /\b(?:delete|truncate)\s+from\b/i);
  assert.match(outcomeRealtimeMigration, /curse_hated_forced_predictions/);
  assert.match(outcomeRealtimeMigration, /curse_gambler_rolls/);
  assert.match(outcomeRealtimeMigration, /pg_publication_tables/);
  assert.doesNotMatch(outcomeRealtimeMigration, /\b(?:delete|truncate)\s+from\b/i);
});
