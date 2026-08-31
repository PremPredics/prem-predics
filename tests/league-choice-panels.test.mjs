import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const leagueHtml = read('../league.html');
const leagueJs = read('../assets/js/league.js');
const serviceWorker = read('../service-worker.js');

test('League Hub opens Predictions and Star Man choices in an accessible blurred panel', () => {
  assert.match(leagueHtml, /data-hub-choice-overlay[^]*aria-hidden="true"/);
  assert.match(leagueHtml, /role="dialog"[^]*aria-modal="true"/);
  assert.match(leagueHtml, /data-hub-choice-dismiss[^]*&larr; Back/);
  assert.match(leagueHtml, /backdrop-filter: blur\(10px\)/);
  assert.match(leagueHtml, /\.hub-choice-overlay \{ place-items: center; padding: 14px; \}/);
  assert.match(leagueHtml, /\.hub-choice-dialog \{ width: min\(355px,100%\); padding: 10px;/);
  assert.match(leagueHtml, /\.hub-choice-back \{ position: absolute; top: 0; right: 0;/);
  assert.match(leagueHtml, /grid-template-rows: repeat\(2,70px\)/);
  assert.match(leagueJs, /menu: 'predictions'/);
  assert.match(leagueJs, /menu: 'star-man'/);
  assert.match(leagueJs, /data-choice-menu=/);
  assert.match(leagueJs, /openHubChoicePanel/);
  assert.match(leagueJs, /closeHubChoicePanel/);
  assert.match(leagueJs, /event\.key === 'Escape'/);
  assert.match(leagueJs, /page: 'predictions\.html'/);
  assert.match(leagueJs, /page: 'all-predictions\.html'/);
  assert.match(leagueJs, /page: 'star-man\.html'/);
  assert.match(leagueJs, /page: 'all-star-men\.html'/);
  assert.doesNotMatch(leagueJs, /page: 'prediction-hub\.html'/);
  assert.doesNotMatch(leagueJs, /page: 'star-man-hub\.html'/);
  assert.match(leagueJs, /View history of all user predictions for all Gameweeks\./);
  assert.match(leagueJs, /View history of all user Star Man picks for all Gameweeks\./);
});

test('League Hub reference accents and destination navigation are streamlined', () => {
  assert.match(leagueJs, /page: 'leaderboard\.html'[^]*?accent: '#ffffff'/);
  assert.match(leagueJs, /page: 'statistics\.html'[^]*?accent: '#c4b5fd'/);
  for (const page of ['predictions.html', 'all-predictions.html', 'star-man.html', 'all-star-men.html']) {
    assert.doesNotMatch(read(`../${page}`), /data-(?:predictions|star)-back/);
  }
  for (const script of ['predictions.js', 'all-predictions.js', 'star-man.js', 'all-star-men.js']) {
    assert.doesNotMatch(read(`../assets/js/${script}`), /(?:prediction-hub|star-man-hub)\.html/);
  }
  assert.match(leagueHtml, /league\.js\?v=20260831-choice-panels-v2/);
  assert.match(serviceWorker, /prem-predics-pwa-v61/);
  assert.match(serviceWorker, /league\.js\?v=20260831-choice-panels-v2/);
});
