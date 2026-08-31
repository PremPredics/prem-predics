import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const leagueHtml = read('../league.html');
const leagueJs = read('../assets/js/league.js');
const serviceWorker = read('../service-worker.js');
const predictionsHtml = read('../predictions.html');
const starManHtml = read('../star-man.html');
const allPredictionsHtml = read('../all-predictions.html');
const allPredictionsJs = read('../assets/js/all-predictions.js');
const allStarMenHtml = read('../all-star-men.html');
const allStarMenJs = read('../assets/js/all-star-men.js');

test('League Hub opens Predictions and Star Man choices in an accessible blurred panel', () => {
  assert.match(leagueHtml, /data-hub-choice-overlay[^]*aria-hidden="true"/);
  assert.match(leagueHtml, /role="dialog"[^]*aria-modal="true"/);
  assert.match(leagueHtml, /data-hub-choice-dismiss[^]*&larr; Back/);
  assert.match(leagueHtml, /backdrop-filter: blur\(10px\)/);
  assert.match(leagueHtml, /\.hub-choice-overlay \{ place-items: center; padding: 14px; \}/);
  assert.match(leagueHtml, /\.hub-choice-dialog \{ width: min\(355px,100%\); padding: 10px;/);
  assert.match(leagueHtml, /\.hub-choice-back \{[^}]*min-width: 88px;[^}]*margin: 11px auto 0;[^}]*font-size: \.8rem;/s);
  assert.match(leagueHtml, /grid-template-rows: repeat\(2,70px\)/);
  assert.doesNotMatch(leagueHtml, /Choose an action/);
  assert.ok(leagueHtml.indexOf('data-hub-choice-options') < leagueHtml.lastIndexOf('class="hub-choice-back"'));
  assert.match(leagueHtml, /button\.play-card \{[^}]*-webkit-appearance: none;[^}]*appearance: none;/s);
  assert.match(leagueHtml, /\.play-card \{[^}]*-webkit-tap-highlight-color: transparent;/s);
  assert.match(leagueHtml, /button\.play-card:focus-visible/);
  assert.match(leagueJs, /menu: 'predictions'/);
  assert.match(leagueJs, /detail: `Submit Predictions for GW\$\{gameweekNumber\}`/);
  assert.match(leagueJs, /detail: `Submit or Edit your GW\$\{gameweekNumber\} Predictions`, accent: '#22d3ee'/);
  assert.match(leagueJs, /detail: `Submit or Edit your GW\$\{gameweekNumber\} Star Man`, accent: '#22d3ee'/);
  assert.match(leagueJs, /title: 'View All Player Star Men'[^]*?accent: '#facc15'/);
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
  assert.match(leagueHtml, /league\.js\?v=20260831-page-loader-v1/);
  assert.match(leagueHtml, /\.toolbar \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 1\.18fr\) minmax\(92px, \.72fr\);/s);
  assert.match(leagueHtml, /@media \(max-width: 650px\)[^]*\.toolbar \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(leagueHtml, /\.toolbar a\[data-profile-link\] \{[^}]*grid-column: 1 \/ 3;[^}]*grid-row: 2;/s);
  assert.match(leagueHtml, /\.toolbar a,\s*\.toolbar button \{[^}]*border: 1px solid rgba\(255,255,255,\.78\);/s);
  assert.match(leagueHtml, /\.toolbar a\.how-to-play-link \{[^}]*border-color: rgba\(255,255,255,\.78\);/s);
  assert.match(leagueHtml, /\.toolbar button\.sign-out-btn \{[^}]*border: 1px solid rgba\(255,255,255,\.78\);/s);
  assert.match(serviceWorker, /prem-predics-pwa-v66/);
  assert.match(serviceWorker, /league\.js\?v=20260831-page-loader-v1/);
});

test('League Hub masks first load and refresh with a progressive full-page loader', () => {
  assert.match(leagueHtml, /body class="league-page-loading"/);
  assert.match(leagueHtml, /Loading League Hub Page\.\.\./);
  assert.match(leagueHtml, /aria-valuenow="4"[^>]*data-league-page-progress/);
  assert.match(leagueJs, /function startLeaguePageLoading\(\)/);
  assert.match(leagueJs, /setLeaguePageLoadProgress\(38\)/);
  assert.match(leagueJs, /setLeaguePageLoadProgress\(96\)/);
  assert.match(leagueJs, /finally \{\s*finishLeaguePageLoading\(\);/s);
});

test('direct League Hub navigation cannot reuse stale history-page modules', () => {
  assert.match(allPredictionsHtml, /all-predictions\.js\?v=20260831-direct-hub-v2/);
  assert.match(allStarMenHtml, /all-star-men\.js\?v=20260831-direct-hub-v2/);
  assert.match(serviceWorker, /all-predictions\.js\?v=20260831-direct-hub-v2/);
  assert.match(serviceWorker, /all-star-men\.js\?v=20260831-direct-hub-v2/);
  assert.doesNotMatch(allPredictionsJs, /predictionsBackLink/);
  assert.doesNotMatch(allStarMenJs, /starBackLink/);
});

test('Make Predictions and Star Man return buttons stay centred on mobile', () => {
  assert.match(predictionsHtml, /@media \(max-width: 720px\)[^]*\.toolbar \{[^}]*grid-template-columns: minmax\(0, 230px\);/s);
  assert.match(starManHtml, /@media \(max-width: 720px\)[^]*\.toolbar \{[^}]*grid-template-columns: minmax\(0, 230px\);/s);
});
