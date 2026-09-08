import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/star-man.js', import.meta.url), 'utf8');
const browserCode = source.slice(source.indexOf('function renderAvailablePlayers('), source.indexOf('function renderStarManHistory('));
function harness(count, locked = false) {
  const calls = [];
  const results = { classList: { add() {}, remove() {} }, setAttribute() {}, innerHTML: '' };
  const context = vm.createContext({
    state: { selected: {}, existingPicks: new Map(), players: [] },
    slotElements: () => ({ input: { value: '' }, results }),
    canSearchSlot: () => !locked, applySlotSearchState: () => !locked,
    availablePlayerMatches: () => Array.from({ length: count }, (_, i) => ({ player: { id: i }, check: { allowed: true } })),
    updateAvailablePlayerCounter() {}, renderSelectedPlayer() {}, updateSaveButton() {},
    isExistingPick: () => false, normaliseText: String, ownEffect: () => null,
    renderPlayerResultCards: (slot, matches) => calls.push({ slot, count: matches.length }),
    setResultsMessage: (_results, message) => calls.push({ message }),
  });
  vm.runInContext(source.match(/const AVAILABLE_PLAYER_REVEAL_LIMIT = \d+;/)[0] + browserCode, context);
  return { calls, run: code => vm.runInContext(code, context) };
}
for (const count of [1, 65, 75]) {
  test(`blank search displays all ${count} eligible players without truncation`, () => {
    const h = harness(count); h.run("renderSearch('primary')");
    assert.deepEqual(h.calls, [{ slot: 'primary', count }]);
  });
}
test('76 eligible players still require a search', () => {
  const h = harness(76); h.run("renderAvailablePlayers('primary')");
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].message, /2\+ letters/);
});
test('locked selection never opens eligible-player browser', () => {
  const h = harness(75, true); h.run("renderAvailablePlayers('primary'); renderSearch('primary')");
  assert.deepEqual(h.calls, []);
});
test('empty eligible pool displays the empty state', () => {
  const h = harness(0); h.run("renderSearch('primary')");
  assert.match(h.calls[0].message, /No players/);
});
test('Super Duo uses the same blank-search threshold', () => {
  const h = harness(75); h.run("renderSearch('super_duo')");
  assert.deepEqual(h.calls, [{ slot: 'super_duo', count: 75 }]);
});
