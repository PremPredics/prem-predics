import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../assets/css/slick-pages.css');
const home = read('../index.html');
const homeJs = read('../assets/js/index-actions.js');
const starMan = read('../star-man.html');
const statistics = read('../statistics.html');
const statisticsJs = read('../assets/js/statistics.js');
const worker = read('../service-worker.js');

test('Home uses compact premium panels without runtime legacy style overrides', () => {
  assert.match(home, /body class="slick-home"/);
  assert.match(home, /slick-pages\.css\?v=20260831-slick-v1/);
  assert.match(home, /index-actions\.js\?v=20260831-slick-v1/);
  assert.doesNotMatch(homeJs.match(/function boot\(\)[^]*?\n\}/)?.[0] || '', /injectHomeActionStyles/);
  assert.match(css, /body\.slick-home \.home-action-status-line \{[^}]*height: 46px;/s);
  assert.match(css, /body\.slick-home \.menu button \{[^}]*min-height: 78px;/s);
});

test('Star Man uses a compact responsive selection workspace', () => {
  assert.match(starMan, /class="pp-page-loading slick-star-man"/);
  assert.match(starMan, /Current Gameweek Selection/);
  assert.match(starMan, /star-man\.js\?v=20260831-slick-v1/);
  assert.match(css, /body\.slick-star-man \.panel,[^]*border: 1px solid rgba\(255,255,255,\.52\);/s);
  assert.match(css, /body\.slick-star-man \.history-panel \{ min-height: 0; height: auto;/);
  assert.match(css, /body\.slick-star-man \.selected-player-card \{ width: min\(186px,58vw\);/);
  assert.match(css, /@media \(max-width: 650px\)[^]*body\.slick-star-man \.history-card-grid \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\);/s);
});

test('Statistics renders compact player rows and responsive metric grids', () => {
  assert.match(statistics, /class="pp-page-loading slick-statistics"/);
  assert.match(statistics, /statistics\.js\?v=20260831-slick-v1/);
  assert.match(statisticsJs, /stats-card\$\{isCurrentUser \? ' is-current-user' : ''\}/);
  assert.match(statisticsJs, /player-kicker/);
  assert.match(css, /body\.slick-statistics \.stats-card \{[^}]*grid-template-columns: minmax\(190px,\.72fr\) minmax\(0,3fr\);/s);
  assert.match(css, /body\.slick-statistics \.stat-list \{ grid-template-columns: repeat\(6,minmax\(0,1fr\)\);/);
  assert.match(css, /@media \(max-width: 650px\)[^]*body\.slick-statistics \.stat-list \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\);/s);
});

test('PWA v69 caches the premium stylesheet and revised page scripts', () => {
  assert.match(worker, /prem-predics-pwa-v69/);
  assert.match(worker, /slick-pages\.css\?v=20260831-slick-v1/);
  assert.match(worker, /index-actions\.js\?v=20260831-slick-v1/);
  assert.match(worker, /star-man\.js\?v=20260831-slick-v1/);
  assert.match(worker, /statistics\.js\?v=20260831-slick-v1/);
});
