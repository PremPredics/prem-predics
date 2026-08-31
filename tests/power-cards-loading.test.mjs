import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../power-cards.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('Power Cards stays covered by a progressive loading screen until its data is assembled', () => {
  assert.match(page, /<body class="power-page-loading"/);
  assert.match(page, /Loading Power Cards Page\.\.\./);
  assert.match(page, /aria-valuenow="4" data-power-page-progress/);
  assert.match(page, /data-power-page-loader-fill/);
  assert.match(page, /data-power-page-loader-percent>4%/);
  assert.match(page, /\.power-page-loader \{[^}]*position: fixed;[^}]*z-index: 50000;/s);
  assert.match(page, /function setPowerPageLoadProgress/);
  assert.match(page, /function startPowerPageLoading/);
  assert.match(page, /function finishPowerPageLoading/);
  assert.match(page, /completedPowerPageLoads \+= 1/);
  assert.match(page, /trackedPowerPageLoad\(syncMedals\(\)\)/);
  assert.match(page, /trackedPowerPageLoad\(refreshHands\(\{ force: true \}\)\)/);
  assert.match(page, /trackedPowerPageLoad\(loadActiveGameCard\(\)\)/);
  assert.match(page, /applyCardPageVisibility\(\);\s*finishPowerPageLoading\(\);/);
  assert.match(worker, /prem-predics-pwa-v66/);
  assert.match(worker, /\.\/power-cards\.html/);
});
