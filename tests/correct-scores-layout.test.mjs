import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageHtml = readFileSync(new URL('../correct-scores.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../assets/js/correct-scores.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('Correct Scores keeps fixtures centred when card markers are present', () => {
  assert.match(pageHtml, /\.correct-score-row\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\) 72px/s);
  assert.match(pageHtml, /\.correct-score-row\.has-effects\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\) 72px/s);
  assert.match(pageHtml, /@media \(max-width: 640px\)[\s\S]*\.correct-score-row\s*\{[^}]*grid-template-columns:\s*60px minmax\(0, 1fr\) 60px/s);
  assert.match(pageHtml, /\.correct-fixture\s*\{[^}]*grid-column:\s*2/s);
  assert.match(pageHtml, /\.correct-effects\s*\{[^}]*grid-column:\s*3/s);
  assert.match(pageJs, /correct-score-row\$\{effectButtons \? ' has-effects' : ''\}/);
  assert.match(pageJs, /effect-marker \$\{category\}-marker/);
  assert.match(pageHtml, /assets\/js\/correct-scores\.js\?v=20260831-football-loader-v1/);
  assert.match(worker, /assets\/js\/correct-scores\.js\?v=20260831-football-loader-v1/);
});
