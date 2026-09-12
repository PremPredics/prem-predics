import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const context = { window: {} };
test('Usernames retain natural letter proportions on one line', () => {
  const css = read('assets/css/league-pages-polish.css');
  assert.ok(!css.includes('scaleX(.8)'));
  assert.ok(css.includes('grid-template-rows: 14px 32px'));
  assert.ok(css.includes('transform: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;'));
});
test('Discard cards cannot stretch beyond the hand-card dimensions', () => {
  assert.match(read('power-cards.html'), /\.card-tile\.discard-card\s*\{\s*min-height: 0;/);
  assert.match(read('assets/css/league-pages-polish.css'), /height: var\(--hand-card-height,94px\) !important/);
});
test('Card connectors use the same size as the card name', () => {
  const css = read('assets/css/league-pages-polish.css');
  assert.ok(!css.includes('grid-template-rows: 1.35em'));
  assert.match(css, /\.pp-card-name\s*\{\s*font-size: 1em;/);
});
vm.runInNewContext(read('assets/js/card-title.js'), context);
test('Card titles use one intact, escaped text block for consistent centring', () => {
  const title = context.window.ppCardTitle('Power of the Small and Mighty');
  assert.match(title, /pp-card-name">Power of the Small and Mighty</);
  assert.match(context.window.ppCardTitle('Super Star Man'), /pp-card-name">Super Star Man</);
  assert.match(context.window.ppCardTitle('Regular Card'), /pp-card-name">Regular Card</);
  assert.ok(!context.window.ppCardTitle('Curse of the <img src=x>').includes('<img'));
});
for (const file of ['all-predictions.js', 'all-star-men.js', 'correct-scores.js']) {
  test(`${file} balances every league size and retains full accessible usernames`, () => {
    const source = read('assets/js/' + file);
    const expression = source.match(/setProperty\('--player-columns', (.+)\);/)[1];
    for (let count = 2; count <= 10; count++) {
      const columns = vm.runInNewContext(expression, { state: { members: Array(count) } });
      assert.equal(columns, count <= 5 ? count : Math.ceil(count / 2));
    }
    assert.match(source, /aria-label="\$\{escapeHtml\(member.display_name\)\}"/);
    assert.ok(source.includes('favorite_color: profile?.favorite_color'));
    assert.ok(source.includes('<span>\$\{escapeHtml(member.display_name)\}</span>'));
  });
}
