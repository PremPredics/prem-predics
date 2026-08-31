import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextMedalProgress,
  STAR_MAN_GOAL_MEDAL_THRESHOLDS,
  UC_POINT_MEDAL_THRESHOLDS,
} from '../assets/js/medal-progress.js';

const leagueHtml = readFileSync(new URL('../league.html', import.meta.url), 'utf8');
const leagueJs = readFileSync(new URL('../assets/js/league.js', import.meta.url), 'utf8');
const liveCursesHtml = readFileSync(new URL('../live-curses.html', import.meta.url), 'utf8');
const medalsHtml = readFileSync(new URL('../medals.html', import.meta.url), 'utf8');
const medalsJs = readFileSync(new URL('../assets/js/medals.js', import.meta.url), 'utf8');

test('earned medals permanently advance the tracked milestone even if points fall', () => {
  const progress = nextMedalProgress(15, UC_POINT_MEDAL_THRESHOLDS, ['uc_points_20'], 'uc_points_');
  assert.equal(progress.highestEarned, 20);
  assert.equal(progress.nextThreshold, 40);
  assert.equal(progress.percentage, 38);

  const goals = nextMedalProgress(2, STAR_MAN_GOAL_MEDAL_THRESHOLDS, ['star_man_goals_1', 'star_man_goals_3'], 'star_man_goals_');
  assert.equal(goals.nextThreshold, 5);
  assert.equal(goals.percentage, 40);
});

test('medals page shows the same progress tracker before its earned total', () => {
  assert.ok(medalsHtml.indexOf('data-medal-progress') < medalsHtml.indexOf('data-earned-count'));
  assert.match(medalsHtml, /medal-progress-grid/);
  assert.match(medalsJs, /nextMedalProgress/);
  assert.match(medalsJs, /ultimate_champion_points, star_man_goals/);
  assert.match(medalsJs, /Next Medal Progress/);
});

test('league hub actions use one compact responsive grid while preserving accents', () => {
  assert.match(leagueHtml, /\.play-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(180px, 1fr\)\)/s);
  assert.match(leagueHtml, /\.play-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(leagueHtml, /\.play-card \{[^}]*height: 92px/s);
  assert.doesNotMatch(leagueJs, /groupedPages/);
  assert.match(leagueJs, /style="--accent: \$\{item\.accent\}"/);
});

test('league hub renders two compact medal bars between deadlines and live curses', () => {
  const deadlines = leagueHtml.indexOf('data-deadline-strip');
  const progress = leagueHtml.indexOf('data-medal-progress');
  const curses = leagueHtml.indexOf('data-live-curse-alert');
  assert.ok(deadlines < progress && progress < curses);
  assert.match(leagueHtml, /medal-progress-grid/);
  assert.match(leagueHtml, /live-curse-alert-copy/);
  assert.match(leagueHtml, /live-curse-alert-action/);
  assert.match(leagueJs, /sync_my_card_draw_tokens/);
  assert.match(leagueJs, /ultimate_champion_points, star_man_goals/);
  assert.match(liveCursesHtml, /-webkit-touch-callout: none/);
  assert.match(liveCursesHtml, /user-select: none/);
});
