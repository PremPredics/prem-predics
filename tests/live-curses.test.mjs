import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  currentActiveCurseEffects,
  currentLiveCurseEffects,
  effectAppliesToGameweek,
  isCompletedThief,
} from '../assets/js/live-curses-model.js';

const leagueHtml = readFileSync(new URL('../league.html', import.meta.url), 'utf8');
const leagueJs = readFileSync(new URL('../assets/js/league.js', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('../live-curses.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../assets/js/live-curses.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const medalsHtml = readFileSync(new URL('../medals.html', import.meta.url), 'utf8');
const thiefCapMigration = readFileSync(new URL('../supabase/curse-thief-target-cap-and-live-history-2026-08-31.sql', import.meta.url), 'utf8');
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
    effect({ status: 'resolved', payload: { effect_key: 'curse_thief' } }),
    effect({ status: 'resolved', payload: { effect_key: 'curse_hated' } }),
  ];
  assert.equal(currentLiveCurseEffects(rows, current, gameweeks).length, 3);
  assert.equal(currentActiveCurseEffects(rows, current, gameweeks).length, 2);
  assert.equal(isCompletedThief(rows[7]), true);
  assert.equal(effectAppliesToGameweek(rows[1], current, gameweeks), true);
  assert.equal(effectAppliesToGameweek(rows[2], current, gameweeks), false);
});

test('Live Curses UI is linked, realtime, personalised and PWA-cached', () => {
  assert.match(leagueHtml, /data-live-curse-alert/);
  assert.match(leagueJs, /className: 'live-curses-card'/);
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
  assert.match(pageJs, /key === 'curse_hated'/);
  assert.match(pageJs, /effect\.fixture_id, home_goals: 8, away_goals: 2/);
  assert.match(pageJs, /Prediction removed from scoring/);
  assert.match(pageJs, /starManLiveEffectByKey/);
  assert.match(pageJs, /profileFor\(effect\.target_user_id\)\.display_name/);
  assert.doesNotMatch(pageJs, /The target/i);
  assert.doesNotMatch(pageJs, /<p class="curse-description"/);
  assert.doesNotMatch(pageJs, /<span class="card-type">/);
  assert.doesNotMatch(pageHtml, /data-board-caption/);
  assert.match(pageHtml, /grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(pageHtml, /width: min\(100%,86px\)/);
  assert.match(pageHtml, /curse-card-segment/);
  assert.match(pageHtml, /curse-effects-segment/);
  assert.match(pageHtml, /segment-label/);
  assert.match(pageJs, /Gameweek Curse Cards/);
  assert.match(pageJs, /curse-meta-copy/);
  assert.doesNotMatch(pageHtml, /curse-hero::after/);
  assert.doesNotMatch(pageHtml, /\\1F525|🔥/);
  assert.match(leagueJs, /live-curse-alert-icon[^]*&#9760;/);
  assert.match(leagueJs, /loadOwnLiveCurseCount[^]*\.in\('status', \['active', 'resolved'\]\)/);
  assert.match(leagueJs, /currentLiveCurseEffects/);
  assert.doesNotMatch(leagueJs, /currentActiveCurseEffects/);
  assert.match(leagueJs, /live-curses-model\.js\?v=20260831-cache-hotfix/);
  assert.match(pageJs, /live-curses-model\.js\?v=20260831-cache-hotfix/);
  assert.match(pageHtml, /\.curse-effects-grid \{ display: grid; grid-template-columns: minmax\(0,1fr\)/);
  assert.doesNotMatch(pageJs, /--effect-columns/);
  assert.match(pageJs, /sortedEffects\.map\(curseCardMarkup\)/);
  assert.match(pageJs, /sortedEffects\.map\(curseEffectMarkup\)/);
  assert.match(predictionsJs, /const forcedCurseVisible = Boolean\(override\)/);
  assert.match(predictionsJs, /sameId\(state\.selectedUserId, state\.user\.id\) \|\| forcedCurseVisible/);
  assert.match(predictionsJs, /all-predictions-curses-/);
  assert.match(predictionsJs, /table: 'curse_gambler_rolls'/);
  assert.match(pageJs, /status', \['active', 'resolved'\]/);
  assert.match(pageJs, /stolen_card_id/);
  assert.match(pageJs, /was stolen from/);
  assert.match(pageHtml, /stolen-card-preview\.power-card/);
  assert.match(pageJs, /effectDisplaySort/);
  assert.match(pageJs, /Number\(isCompletedThief\(a\)\) - Number\(isCompletedThief\(b\)\)/);
  assert.match(pageJs, /Completed Steal/);
  assert.match(pageJs, /activeEffects = state\.effects\.filter/);
  assert.match(pageHtml, /\.curse-impact \{[^}]*background: linear-gradient\(110deg,rgba\(127,29,29,.55\),rgba\(76,5,25,.34\)\)/s);
  assert.match(pageHtml, /\.curse-impact\.is-locked \{[^}]*background: linear-gradient\(110deg,rgba\(127,29,29,.55\),rgba\(76,5,25,.34\)\)/s);
  assert.match(pageHtml, /\.curse-hero \{[^}]*padding: 14px;[^}]*border-radius: 12px;/s);
  assert.match(pageHtml, /\.hero-stat:nth-child\(2\) \{ --stat-color: #fbbf24; \}/);
  assert.match(pageHtml, /\.hero-stat:nth-child\(3\) \{ --stat-color: #4ade80; \}/);
  assert.match(pageHtml, /\.hero-stat \{[^}]*min-height: 62px;/s);
  assert.match(pageHtml, /@media \(max-width: 480px\)[^]*\.hero-stat \{ min-height: 54px;/);
  assert.match(worker, /prem-predics-pwa-v70/);
  assert.match(worker, /\.\/live-curses\.html/);
  assert.match(realtimeMigration, /pg_publication_tables/);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.active_card_effects/);
  assert.doesNotMatch(realtimeMigration, /\b(?:delete|truncate)\s+from\b/i);
  assert.match(outcomeRealtimeMigration, /curse_hated_forced_predictions/);
  assert.match(outcomeRealtimeMigration, /curse_gambler_rolls/);
  assert.match(outcomeRealtimeMigration, /pg_publication_tables/);
  assert.doesNotMatch(outcomeRealtimeMigration, /\b(?:delete|truncate)\s+from\b/i);
  assert.match(thiefCapMigration, /ace\.status = 'resolved' and cd\.effect_key = 'curse_thief'/);
  assert.doesNotMatch(thiefCapMigration, /\b(?:delete|truncate)\s+from\b/i);
});

test('Medals page uses a compact responsive two-column mobile layout', () => {
  assert.match(medalsHtml, /grid-template-columns: repeat\(auto-fit,minmax\(175px,1fr\)\)/);
  assert.match(medalsHtml, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(medalsHtml, /min-height: 68px/);
  assert.match(medalsHtml, /data-medal-progress/);
  assert.ok(medalsHtml.indexOf('data-medal-progress') < medalsHtml.indexOf('data-earned-count'));
  assert.match(medalsHtml, /medals\.js\?v=20260831-football-loader-v1/);
});
