const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/haptics.js', 'utf8');
function harness(mode = 'supported') {
  const calls = [], intervals = new Map(), events = {}, observers = [];
  let next = 0;
  const document = { body: {}, hidden: false, visibilityState: 'visible', addEventListener: (name, fn) => events[name] = fn };
  const navigator = mode === 'missing' ? {} : { vibrate: p => {
    if (mode === 'throws') throw Error('blocked');
    calls.push(p); return mode !== 'denied';
  }};
  const context = { document, navigator, setInterval: (fn, ms) => { assert.equal(ms, 3000); intervals.set(++next, fn); return next; }, clearInterval: id => intervals.delete(id), MutationObserver: class {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }, addEventListener: (name, fn) => events[name] = fn };
  context.window = context;
  vm.runInNewContext(source, context);
  const element = { isConnected: true, hidden: false, showing: true, classList: { contains: () => element.showing }, getAttribute: () => 'false' };
  return { api: context.ppHaptics, calls, intervals, events, document, element, tick: () => [...intervals.values()].forEach(fn => fn()), mutate: () => observers.filter(o => o.active).forEach(o => o.fn()) };
}
const h = harness();
h.api.success(); assert.deepEqual(Array.from(h.calls[0]), [30, 60, 45]);
const stopFirst = h.api.reveal(h.element);
assert.equal(h.calls.length, 1, 'reveal must not cancel the success vibration');
h.tick(); h.tick();
assert.deepEqual(Array.from(h.calls[2]), [35, 85, 35]);
assert.equal(h.intervals.size, 1);
h.api.reveal(h.element); assert.equal(h.intervals.size, 1, 'no overlapping loops');
stopFirst(); assert.equal(h.intervals.size, 1, 'old cleanup must not stop new reveal');
h.element.showing = false; h.mutate(); assert.equal(h.intervals.size, 0);
assert.equal(h.calls.at(-1), 0, 'closing cancels vibration immediately');
h.element.showing = true; h.api.reveal(h.element);
h.document.hidden = true; h.document.visibilityState = 'hidden'; h.events.visibilitychange();
assert.equal(h.intervals.size, 0);
const count = h.calls.length; h.api.success(); assert.equal(h.calls.length, count);
h.document.hidden = false; h.document.visibilityState = 'visible';
h.api.reveal(h.element); h.events.pagehide(); assert.equal(h.intervals.size, 0);
h.api.reveal(h.element); h.element.isConnected = false; h.mutate(); assert.equal(h.intervals.size, 0);
for (const mode of ['missing', 'throws', 'denied']) {
  const t = harness(mode); assert.doesNotThrow(() => { t.api.success(); t.api.reveal(t.element); t.tick(); t.api.stop(); });
  assert.equal(t.intervals.size, 0);
}
// Parse all inline card scripts as well as verifying success hooks follow error guards.
const cards = fs.readFileSync('power-cards.html', 'utf8');
for (const match of cards.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!match[1].includes('type="module"') && match[2].trim()) new vm.Script(match[2]);
}
for (const [file, name, successMarker] of [
  ['predictions', 'saveAllPredictions', 'rows.forEach'],
  ['star-man', 'savePick', 'state.existingPicks.set'],
  ['game-card', 'savePrediction', 'const savedPrediction'],
]) {
  const text = fs.readFileSync(`assets/js/${file}.js`, 'utf8');
  const start = text.indexOf(`async function ${name}(`);
  const body = text.slice(start, text.indexOf('\n}', start));
  assert(body.indexOf('if (error)') < body.indexOf('window.ppHaptics?.success()'));
  assert(body.indexOf('window.ppHaptics?.success()') < body.indexOf(successMarker));
}
console.log('PASS: success patterns, 3-second double pulses, no overlapping loops, close/removal/background/navigation cleanup, unsupported/blocked fallback, success-only hook placement and inline script syntax.');
