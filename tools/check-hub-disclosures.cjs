const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/hub-disclosures.js', 'utf8');
const events = {}, motion = { matches: false, addEventListener: (name, fn) => events.motion = fn };
const animations = [];
let click, currentHeight;
const details = {
  open: false, style: {}, dataset: {},
  querySelector: () => ({ addEventListener: (name, fn) => click = fn }),
  getBoundingClientRect: () => ({ height: currentHeight ?? (details.open ? 200 : 38) }),
  removeAttribute: () => delete details.dataset.expanding,
  animate: (frames, options) => {
    const animation = { frames, options, cancel() { this.cancelled = true; currentHeight = undefined; } };
    animations.push(animation); return animation;
  },
};
vm.runInNewContext(source, { matchMedia: () => motion, document: { querySelectorAll: () => [details] }, window: { addEventListener: (name, fn) => events[name] = fn } });
function press() { let prevented = false; click({ preventDefault() { prevented = true; } }); assert(prevented); }
press(); assert.equal(details.open, true); assert.equal(details.dataset.expanding, 'true');
assert.deepEqual(Array.from(animations[0].frames.height), ['38px', '200px']);
animations[0].onfinish(); assert.equal(details.style.height, ''); assert(details.open);
press(); assert(details.open, 'remain open during collapse'); assert.equal(details.dataset.expanding, 'false');
animations[1].onfinish(); assert.equal(details.open, false); assert.equal(details.style.height, '');
press(); currentHeight = 100; press(); currentHeight = undefined;
assert(animations[2].cancelled); assert.equal(details.dataset.expanding, 'false');
assert.deepEqual(Array.from(animations[3].frames.height), ['100px', '38px']);
animations[2].onfinish(); assert.equal(details.dataset.expanding, 'false', 'stale completion must not win');
animations[3].onfinish(); assert.equal(details.open, false);
motion.matches = true; const count = animations.length; press(); assert(details.open); assert.equal(animations.length, count);
press(); assert.equal(details.open, false);
motion.matches = false; press(); events.resize(); assert(details.open); assert.equal(details.style.height, '');
press(); events.motion(); assert.equal(details.open, false);
press(); events.pagehide(); assert(details.open); assert.equal(details.style.height, '');
const html = fs.readFileSync('league.html', 'utf8');
assert.equal((html.match(/data-hub-disclosure>/g) || []).length, 2);
assert(html.includes('Next Medal Progress</span></span><span class="hub-deadline-toggle"'));
console.log('PASS: expand/collapse, rapid reversal, stale completion, reduced motion, resize, page exit, native summary semantics and both Hub hooks.');
