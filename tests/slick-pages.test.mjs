import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../assets/css/slick-pages.css');
const home = read('../index.html');
const homeJs = read('../assets/js/index-actions.js');
const starMan = read('../star-man.html');
const starManJs = read('../assets/js/star-man.js');
const statistics = read('../statistics.html');
const statisticsJs = read('../assets/js/statistics.js');
const worker = read('../service-worker.js');

test('Home uses compact premium panels without runtime legacy style overrides', () => {
  assert.match(home, /body class="slick-home"/);
  assert.match(home, /slick-pages\.css\?v=20260901-slick-v2/);
  assert.match(home, /index-actions\.js\?v=20260831-slick-v1/);
  assert.doesNotMatch(homeJs.match(/function boot\(\)[^]*?\n\}/)?.[0] || '', /injectHomeActionStyles/);
  assert.match(css, /body\.slick-home \*,\s*body\.slick-home \*::before,\s*body\.slick-home \*::after \{\s*box-sizing: border-box;/s);
  assert.match(css, /body\.slick-home \.home-action-row \{[^}]*border: 2px solid rgba\(245,215,110,\.86\);/s);
  assert.match(css, /@media \(max-width: 650px\)[^]*body\.slick-home \.account-action \{[^}]*flex: 0 0 auto;[^}]*width: auto;/s);
  assert.match(css, /body\.slick-home \.home-action-status-line \{[^}]*height: 46px;/s);
  assert.match(css, /body\.slick-home \.menu button \{[^}]*min-height: 78px;/s);
});

test('Star Man uses a compact responsive selection workspace', () => {
  assert.match(starMan, /class="pp-page-loading slick-star-man"/);
  assert.match(starMan, /Current Gameweek Selection/);
  assert.match(starMan, /slick-pages\.css\?v=20260901-slick-v2/);
  assert.match(starMan, /star-man\.js\?v=20260901-slick-v2/);
  assert.match(starManJs, /playerVisualMarkup\(player, \{ showCountry: false \}\)/);
  assert.match(css, /body\.slick-star-man \.panel,[^]*border: 1px solid rgba\(255,255,255,\.52\);/s);
  assert.match(css, /body\.slick-star-man \.history-panel \{ min-height: 0; height: auto;/);
  assert.match(css, /body\.slick-star-man \.selected-player-card \{ width: min\(186px,58vw\);/);
  assert.match(css, /body\.slick-star-man \.selected-player-card \.player-card-photo-frame \{ top: 53px; bottom: 55px;/);
  assert.match(css, /body\.slick-star-man \.history-star-card \.player-card-country \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 650px\)[^]*body\.slick-star-man \.history-card-grid \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\);/s);
});

test('Statistics renders compact player rows and responsive metric grids', () => {
  assert.match(statistics, /class="pp-page-loading slick-statistics"/);
  assert.match(statistics, /slick-pages\.css\?v=20260901-slick-v2/);
  assert.match(statistics, /statistics\.js\?v=20260831-slick-v1/);
  assert.match(statisticsJs, /stats-card\$\{isCurrentUser \? ' is-current-user' : ''\}/);
  assert.match(statisticsJs, /player-kicker/);
  assert.match(css, /body\.slick-statistics \.stats-card \{[^}]*grid-template-columns: minmax\(190px,\.72fr\) minmax\(0,3fr\);/s);
  assert.match(css, /body\.slick-statistics \.stat-list \{ grid-template-columns: repeat\(12,minmax\(0,1fr\)\);/);
  assert.match(css, /body\.slick-statistics \.stat:nth-child\(7\) \{ grid-column: 2 \/ span 2; \}/);
  assert.match(css, /@media \(max-width: 650px\)[^]*body\.slick-statistics \.stat-list \{ grid-template-columns: repeat\(8,minmax\(0,1fr\)\);/s);
  assert.match(css, /body\.slick-statistics \.stat:nth-last-child\(3\) \{ grid-column: 2 \/ span 2; \}/);
  assert.match(css, /body\.slick-statistics \.stat\.game-won-stat \{ grid-column: span 2; width: auto; \}/);
});

test('PWA v71 caches the corrected premium stylesheet and revised page scripts', () => {
  assert.match(worker, /prem-predics-pwa-v71/);
  assert.match(worker, /slick-pages\.css\?v=20260901-slick-v2/);
  assert.match(worker, /index-actions\.js\?v=20260831-slick-v1/);
  assert.match(worker, /star-man\.js\?v=20260901-slick-v2/);
  assert.match(worker, /statistics\.js\?v=20260831-slick-v1/);
});
