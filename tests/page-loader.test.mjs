import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const loaderJs = read('../assets/js/page-loader.js');
const loaderCss = read('../assets/css/page-loader.css');
const worker = read('../service-worker.js');

const pages = [
  ['index.html', 'index-actions.js', '20260901-home-loader-v1'],
  ['all-predictions.html', 'all-predictions.js', '20260831-football-loader-v1'],
  ['all-star-men.html', 'all-star-men.js', '20260831-football-loader-v1'],
  ['leaderboard.html', 'leaderboard.js', '20260831-football-loader-v1'],
  ['medals.html', 'medals.js', '20260831-football-loader-v1'],
  ['game-card.html', 'game-card.js', '20260901-awards-v3'],
  ['correct-scores.html', 'correct-scores.js', '20260831-football-loader-v1'],
  ['live-curses.html', 'live-curses.js', '20260901-vetoed-v1'],
  ['star-man.html', 'star-man.js', '20260901-search-card-v1'],
  ['predictions.html', 'predictions.js', '20260831-football-loader-v1'],
  ['league.html', 'league.js', '20260901-live-curses-copy-v1'],
  ['statistics.html', 'statistics.js', '20260831-slick-v1'],
];

test('requested league pages use the shared football-to-goal loading experience', () => {
  for (const [htmlFile, scriptFile] of pages) {
    const html = read(`../${htmlFile}`);
    const script = read(`../assets/js/${scriptFile}`);
    assert.match(html, /body class="[^"]*pp-page-loading[^"]*" data-page-loader-title="Loading [^"]+ Page\.\.\."/);
    assert.match(html, /page-loader\.css\?v=20260831-football-v2/);
    assert.match(html, /page-loader\.js\?v=20260831-football-v1/);
    assert.match(script, /finishPageLoader/);
    assert.match(script, /setPageLoaderProgress/);
  }
});

test('Power Cards uses the same shared football loader', () => {
  const html = read('../power-cards.html');
  assert.match(html, /body class="pp-page-loading" data-page-loader-title="Loading Power Cards Page\.\.\."/);
  assert.match(html, /page-loader\.css\?v=20260831-football-v2/);
  assert.match(html, /import\('\.\/assets\/js\/page-loader\.js\?v=20260831-football-v1'\)/);
  assert.match(html, /powerPageLoaderApi\?\.setPageLoaderProgress/);
  assert.match(html, /powerPageLoaderApi\?\.finishPageLoader/);
});

test('loader rolls a football into a revealed goal and always has a safety completion', () => {
  assert.match(loaderJs, /pp-page-loader-ball[^]*&#9917;/);
  assert.match(loaderJs, /progress >= 74/);
  assert.match(loaderJs, /is-near-goal', 'is-scored'/);
  assert.match(loaderJs, /window\.setTimeout\(\(\) => finishPageLoader\(\), 25000\)/);
  assert.match(loaderCss, /\.pp-page-loader-goal \{/);
  assert.match(loaderCss, /opacity: 1;/);
  assert.match(loaderCss, /\.pp-page-loader\.is-scored \.pp-page-loader-ball/);
  assert.match(loaderCss, /\.pp-page-loader\.is-scored \.pp-page-loader-goal::after/);
  assert.match(loaderCss, /@keyframes pp-page-loader-goal-ripple/);
  assert.match(loaderCss, /@media \(max-width: 480px\)/);
  assert.match(loaderCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('PWA cache includes the complete shared loader release', () => {
  assert.match(worker, /prem-predics-pwa-v75/);
  assert.match(worker, /page-loader\.css\?v=20260831-football-v2/);
  assert.match(worker, /page-loader\.js\?v=20260831-football-v1/);
  for (const [, scriptFile, version] of pages) {
    assert.match(worker, new RegExp(`${scriptFile.replace('.', '\\.')}\\?v=${version}`));
  }
  assert.match(worker, /\.\/power-cards\.html/);
});
