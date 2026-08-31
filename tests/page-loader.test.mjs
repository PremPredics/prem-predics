import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const loaderJs = read('../assets/js/page-loader.js');
const loaderCss = read('../assets/css/page-loader.css');
const worker = read('../service-worker.js');

const pages = [
  ['all-predictions.html', 'all-predictions.js'],
  ['all-star-men.html', 'all-star-men.js'],
  ['leaderboard.html', 'leaderboard.js'],
  ['medals.html', 'medals.js'],
  ['game-card.html', 'game-card.js'],
  ['correct-scores.html', 'correct-scores.js'],
  ['live-curses.html', 'live-curses.js'],
  ['star-man.html', 'star-man.js'],
  ['predictions.html', 'predictions.js'],
];

test('requested league pages use the shared football-to-goal loading experience', () => {
  for (const [htmlFile, scriptFile] of pages) {
    const html = read(`../${htmlFile}`);
    const script = read(`../assets/js/${scriptFile}`);
    assert.match(html, /body class="pp-page-loading" data-page-loader-title="Loading [^"]+ Page\.\.\."/);
    assert.match(html, /page-loader\.css\?v=20260831-football-v1/);
    assert.match(html, /page-loader\.js\?v=20260831-football-v1/);
    assert.match(script, /finishPageLoader/);
    assert.match(script, /setPageLoaderProgress/);
  }
});

test('loader rolls a football into a revealed goal and always has a safety completion', () => {
  assert.match(loaderJs, /pp-page-loader-ball[^]*&#9917;/);
  assert.match(loaderJs, /progress >= 74/);
  assert.match(loaderJs, /is-near-goal', 'is-scored'/);
  assert.match(loaderJs, /window\.setTimeout\(\(\) => finishPageLoader\(\), 25000\)/);
  assert.match(loaderCss, /\.pp-page-loader-goal \{/);
  assert.match(loaderCss, /\.pp-page-loader\.is-scored \.pp-page-loader-ball/);
  assert.match(loaderCss, /@media \(max-width: 480px\)/);
  assert.match(loaderCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('PWA cache includes the complete shared loader release', () => {
  assert.match(worker, /prem-predics-pwa-v67/);
  assert.match(worker, /page-loader\.css\?v=20260831-football-v1/);
  assert.match(worker, /page-loader\.js\?v=20260831-football-v1/);
  for (const [, scriptFile] of pages) {
    assert.match(worker, new RegExp(`${scriptFile.replace('.', '\\.')}\\?v=20260831-football-loader-v1`));
  }
});
