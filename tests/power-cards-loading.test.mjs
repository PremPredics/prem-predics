import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../power-cards.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('Power Cards stays covered by a progressive loading screen until its data is assembled', () => {
  assert.match(page, /<body class="pp-page-loading" data-page-loader-title="Loading Power Cards Page\.\.\."/);
  assert.match(page, /Loading Power Cards Page\.\.\./);
  assert.match(page, /page-loader\.css\?v=20260831-football-v2/);
  assert.match(page, /import\('\.\/assets\/js\/page-loader\.js\?v=20260831-football-v1'\)/);
  assert.match(page, /function setPowerPageLoadProgress/);
  assert.match(page, /async function startPowerPageLoading/);
  assert.match(page, /function finishPowerPageLoading/);
  assert.match(page, /completedPowerPageLoads \+= 1/);
  assert.match(page, /trackedPowerPageLoad\(syncMedals\(\)\)/);
  assert.match(page, /trackedPowerPageLoad\(refreshHands\(\{ force: true \}\)\)/);
  assert.match(page, /trackedPowerPageLoad\(loadActiveGameCard\(\)\)/);
  assert.match(page, /applyCardPageVisibility\(\);\s*finishPowerPageLoading\(\);/);
  assert.match(worker, /prem-predics-pwa-v75/);
  assert.match(worker, /\.\/power-cards\.html/);
});
