import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const home = read('../index.html');
const homeJs = read('../assets/js/index-actions.js');
const slickCss = read('../assets/css/slick-pages.css');
const leagues = read('../leagues.html');
const leaguesCss = read('../assets/css/leagues-slick.css');
const league = read('../league.html');
const leagueJs = read('../assets/js/league.js');
const correctScores = read('../correct-scores.html');
const correctScoresCss = read('../assets/css/correct-scores-slick.css');
const howToPlay = read('../how-to-play.html');
const worker = read('../service-worker.js');

test('Home uses the football loader and restores the gold Global Admin control', () => {
  assert.match(home, /class="pp-page-loading slick-home" data-page-loader-title="Loading Home Page\.\.\."/);
  assert.match(home, /page-loader\.css\?v=20260831-football-v2/);
  assert.match(home, /page-loader\.js\?v=20260831-football-v1/);
  assert.match(homeJs, /finishPageLoader, setPageLoaderProgress/);
  assert.match(homeJs, /setPageLoaderProgress\(92\)/);
  assert.match(homeJs, /void finishPageLoader\(\)/);
  assert.match(slickCss, /button\.admin-access \{[^}]*linear-gradient\(135deg,#fff1a8 0%,#facc15 43%,#d97706 100%\)/s);
  assert.match(slickCss, /button\.admin-access svg \{ fill: #3f2400/);
});

test('League Hub medal headings stay on one clean line and full leagues hide their join code', () => {
  assert.match(league, /\.medal-progress-top span \{[^}]*text-overflow: clip;[^}]*white-space: nowrap;/s);
  assert.match(league, /data-join-code-panel/);
  assert.match(league, /\.join-code\[hidden\] \{ display: none !important; \}/);
  assert.match(leagueJs, /const joinCodePanel = document\.querySelector\('\[data-join-code-panel\]'\)/);
  assert.match(leagueJs, /joinCodePanel\.hidden = !error && total >= 10/);
});

test('Leagues page uses compact responsive panels instead of oversized cards', () => {
  assert.match(leagues, /body class="slick-leagues"/);
  assert.match(leagues, /leagues-slick\.css\?v=20260901-v1/);
  assert.match(leaguesCss, /body\.slick-leagues \.grid \{[^}]*grid-template-columns: minmax\(0,1\.5fr\) minmax\(280px,\.72fr\);/s);
  assert.match(leaguesCss, /body\.slick-leagues \.league-row \{[^}]*border-left: 3px solid #facc15;[^}]*border-radius: 10px;/s);
  assert.match(leaguesCss, /@media \(max-width: 820px\)[^]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(leaguesCss, /@media \(max-width: 560px\)[^]*grid-template-columns: 1fr !important;/s);
});

test('Correct Scores uses neutral lilac badges and compact centred fixture rows', () => {
  assert.match(correctScores, /pp-page-loading slick-correct-scores/);
  assert.match(correctScores, /correct-scores-slick\.css\?v=20260901-v1/);
  assert.match(correctScoresCss, /body\.slick-correct-scores \.player-pills \{[^}]*grid-auto-flow: column;[^}]*overflow-x: auto;/s);
  assert.match(correctScoresCss, /body\.slick-correct-scores \.correct-gw-pill \{[^}]*background: linear-gradient\(135deg,rgba\(91,33,182,\.7\),rgba\(46,16,102,\.72\)\);[^}]*color: #ede9fe;/s);
  assert.match(correctScoresCss, /body\.slick-correct-scores \.correct-team \{ color: #ede9fe; \}/);
  assert.match(correctScoresCss, /@media \(max-width: 640px\)/);
});

test('Game Card help and PWA cache match the released rules and assets', () => {
  assert.match(howToPlay, /fewest missed submissions, most exact predictions, lowest total absolute distance, most weekly wins, lowest total of the shared weekly ranks/);
  assert.match(howToPlay, /In 7-10 player leagues, 1st earns 2 and 2nd earns 1/);
  assert.match(worker, /prem-predics-pwa-v75/);
  assert.match(worker, /leagues-slick\.css\?v=20260901-v1/);
  assert.match(worker, /correct-scores-slick\.css\?v=20260901-v1/);
  assert.match(worker, /index-actions\.js\?v=20260901-home-loader-v1/);
  assert.match(worker, /league\.js\?v=20260901-live-curses-copy-v1/);
});
