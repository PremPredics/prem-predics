import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const context = { window: {} };
test('Card connectors use the same size as the card name', () => {
  const css = read('assets/css/league-pages-polish.css');
  assert.match(css, /\.pp-card-connector\s*\{\s*font-size: 1em;/);
  assert.match(css, /\.pp-card-name\s*\{\s*font-size: 1em;/);
});
vm.runInNewContext(read('assets/js/card-title.js'), context);
test('Card titles separate category and connector without losing long names', () => {
  const title = context.window.ppCardTitle('Power of the Small and Mighty');
  assert.match(title, /pp-card-category">POWER</);
  assert.match(title, /pp-card-connector">Of The</);
  assert.match(title, /pp-card-name">Small and Mighty</);
  assert.match(context.window.ppCardTitle('Super Star Man'), /pp-card-name">Star Man</);
  assert.equal(context.window.ppCardTitle('Regular Card'), 'Regular Card');
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
