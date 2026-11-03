import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupRefresh } from '../public/refresh.js';

class Surface extends EventTarget {
  dataset = {};
  textContent = '';
  classList = { add() {}, remove() {} };
  style = { setProperty() {}, removeProperty() {} };
  setAttribute() {}
  closest() { return null; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('refresh coalesces requests, handles partial failures and respects pull and visibility state', async () => {
  const globals = ['document', 'window', 'setInterval', 'setTimeout', 'clearTimeout'];
  const originals = new Map(globals.map(key => [key, globalThis[key]]));
  const nodes = new Map(['refresh', 'pull-refresh', 'pull-message', 'pull-icon'].map(id => [id, new Surface()]));
  const document = new Surface(), window = new Surface(), intervals = [];
  document.body = new Surface(); document.hidden = false;
  document.getElementById = id => nodes.get(id); window.scrollY = 0;
  Object.assign(globalThis, { document, window, setInterval: callback => intervals.push(callback), setTimeout: () => 0, clearTimeout() {} });
  let calls = 0, jobs = [];
  const task = () => { calls++; return new Promise(resolve => jobs.push(resolve)); };
  const settle = async (success = true) => { jobs.splice(0).forEach((resolve, i) => resolve(success || i > 0)); await flush(); };
  const touch = (type, x, y, fingers = 1) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: fingers }, () => ({ clientX: x, clientY: y })) });
    document.dispatchEvent(event); return event;
  };
  try {
    setupRefresh([task, task, task, task]); await flush();
    assert.equal(calls, 4); assert(nodes.get('refresh').disabled);
    window.dispatchEvent(new Event('online')); await flush();
    assert.equal(calls, 4, 'online during a pending refresh must not duplicate requests');
    await settle(); assert(!nodes.get('refresh').disabled);

    touch('touchstart', 20, 20); touch('touchmove', 20, 75); touch('touchend', 20, 75); await flush();
    assert.equal(calls, 4, 'short pull does not fetch');
    touch('touchstart', 20, 20); touch('touchmove', 190, 40); touch('touchend', 190, 40); await flush();
    assert.equal(calls, 4, 'horizontal gesture does not fetch');
    touch('touchstart', 20, 20); touch('touchmove', 20, 180); touch('touchmove', 20, 22); touch('touchend', 20, 22); await flush();
    assert.equal(calls, 4, 'pulling back above the threshold cancels');
    window.scrollY = 100;
    touch('touchstart', 20, 20); touch('touchmove', 20, 180); touch('touchend', 20, 180); await flush();
    assert.equal(calls, 4, 'pull refresh only starts at the page top');
    window.scrollY = 0;
    touch('touchstart', 20, 20);
    assert(touch('touchmove', 20, 180).defaultPrevented);
    touch('touchend', 20, 180); await flush();
    assert.equal(calls, 8); assert.equal(nodes.get('pull-refresh').dataset.state, 'loading');
    await settle(false);
    assert.equal(nodes.get('pull-refresh').dataset.state, 'error');
    assert(!nodes.get('refresh').disabled);

    nodes.get('refresh').dispatchEvent(new Event('click')); await flush();
    assert.equal(calls, 12); await settle();
    assert.equal(nodes.get('pull-refresh').dataset.state, 'done');
    document.hidden = true; intervals[0](); await flush(); assert.equal(calls, 12);
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flush();
    assert.equal(calls, 16); await settle();
    const restore = new Event('pageshow'); Object.defineProperty(restore, 'persisted', { value: true });
    window.dispatchEvent(restore); await flush(); assert.equal(calls, 20); await settle();
  } finally {
    for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
