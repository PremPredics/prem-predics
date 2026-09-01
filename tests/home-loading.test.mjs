import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';
import { fakeSupabase } from './support/fake-supabase.mjs';
import { boundedRead, readData } from '../assets/js/async-read.js';
const { JSDOM } = testDependency('jsdom');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const user = { id: 'user-a', email: 'hidden@example.invalid', user_metadata: {} };
const future = new Date(Date.now() + 7200000).toISOString();

function homeFixture({ handler, cached = false, contextFailure = false } = {}) {
  const leagues = [1, 2].map((n) => ({ id: `league${n}`, name: `League ${n}`, season_id: 'season', starts_gameweek_id: 10 }));
  const tables = {
    competition_members: leagues.map((league) => ({ user_id: user.id, competition_id: league.id, competitions: league, joined_at: '2026-08-01' })),
    predictions: [], star_man_picks: [], game_card_predictions: [],
    gameweeks: [{ id: 10, number: 1, season_id: 'season' }],
    game_card_rounds: leagues.map((league) => ({ id: `round-${league.id}`, competition_id: league.id, season_id: 'season', start_gameweek_id: 10, end_gameweek_id: 10 })),
  };
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://test.invalid/index.html', runScripts: 'outside-only' });
  const client = fakeSupabase(tables, { handler, user });
  let authCallback;
  let contextLoads = 0;
  Object.assign(dom.window, {
    supabase: client, escapeHtml, normaliseNested: (r) => r, leagueUrl: (page, id) => `${page}?competition_id=${id}`,
    getSessionUser: async () => user, onSessionUserChange: (callback) => { authCallback = callback; },
    boundedRead: (fn) => boundedRead(fn, 30), readData: (fn) => readData(fn, { attempts: 1, timeoutMs: 30 }),
    setPageLoaderProgress: () => {}, finishPageLoader: async () => {},
    loadActiveGameweek: async () => {
      contextLoads += 1;
      if (contextFailure) throw new Error('Context unavailable');
      return { activeGameweek: { gameweek_id: 10, gameweek_number: 1, star_man_locks_at: future },
        fixturesByGameweek: new Map([['10', [{ id: 'fixture', prediction_locks_at: future, status: 'scheduled' }]]]) };
    },
  });
  if (cached) dom.window.localStorage.setItem('premPredicsHomeLeagues:v1:' + user.id, JSON.stringify({ userId: user.id, at: Date.now(), leagues }));
  const source = readFileSync(new URL('../assets/js/index-actions.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '');
  dom.window.eval(source + '\nwindow.testHome = {boot, get pending() {return homeRefresh;}, get rows() {return homeRows;}};');
  return { dom, client, api: dom.window.testHome, emit: (u, e) => authCallback(u, e), contextLoads: () => contextLoads };
}

test('a never-resolving read times out and aborts, including an auth-lock wait', async () => {
  let signal;
  await assert.rejects(boundedRead((s) => { signal = s; return new Promise(() => {}); }, 5), /timed out/);
  assert.equal(signal.aborted, true);
});

test('cached navigation paints before membership requests finish, without showing stale action states', async () => {
  let release;
  const { dom, api } = homeFixture({ cached: true, handler: (q) => q.table === 'competition_members'
    ? new Promise((resolve) => { release = resolve; }) : undefined });
  try {
    await flush();
    assert.equal(dom.window.document.querySelectorAll('.home-action-open').length, 2);
    assert.match(dom.window.document.querySelector('[data-home-action-list]').textContent, /Checking/);
    release({ data: [], error: null });
    await api.pending;
    assert.equal(dom.window.document.querySelector('[data-home-action-panel]').hidden, true);
  } finally { dom.window.close(); }
});

test('one failed status does not hide any league, healthy statuses render, and Retry recovers', async () => {
  let fail = true;
  const { dom, api, client, contextLoads } = homeFixture({ handler: (q) => {
    if (q.table === 'game_card_predictions' && fail) return { error: new Error('Temporary game card failure'), data: null };
  } });
  try {
    await api.pending;
    const doc = dom.window.document;
    assert.equal(doc.querySelector('[data-home-action-panel]').hidden, false);
    assert.equal(doc.querySelectorAll('.home-action-row').length, 2);
    assert.match(doc.querySelector('[data-home-action-list]').textContent, /Action Required/);
    assert.match(doc.querySelector('[data-home-action-list]').textContent, /Unavailable/);
    assert.equal(contextLoads(), 1, 'same-season/start context is shared across leagues');
    assert.equal(client.calls.filter((q) => q.table === 'rpc:ensure_game_card_rounds').length, 0, 'existing rounds avoid homepage writes');
    fail = false;
    doc.querySelector('[data-home-action-retry]').click();
    await api.pending;
    assert.doesNotMatch(doc.querySelector('[data-home-action-list]').textContent, /Unavailable|Checking/);
    assert.equal(doc.querySelector('[data-home-action-message]').hidden, true);
    assert.match(doc.querySelector('.home-action-countdown').textContent, /hr|m/);
  } finally { dom.window.close(); }
});

test('a hung card request finishes in a bounded error state, not an invisible homepage', async () => {
  const { dom, api } = homeFixture({ handler: (q) => q.table === 'game_card_predictions' ? new Promise(() => {}) : undefined });
  try {
    await api.pending;
    assert.equal(dom.window.document.querySelectorAll('.home-action-open').length, 2);
    assert.match(dom.window.document.querySelector('[data-home-action-list]').textContent, /Unavailable/);
  } finally { dom.window.close(); }
});

test('league links remain usable when gameweek context fails', async () => {
  const { dom, api } = homeFixture({ contextFailure: true });
  try {
    await api.pending;
    assert.equal(dom.window.document.querySelectorAll('.home-action-open').length, 2);
    assert.equal(dom.window.document.querySelector('[data-home-action-panel]').hidden, false);
  } finally { dom.window.close(); }
});

test('sign-out discards late homepage responses and cached navigation', async () => {
  let release;
  const { dom, api, emit } = homeFixture({ cached: true, handler: (q) => q.table === 'competition_members'
    ? new Promise((resolve) => { release = resolve; }) : undefined });
  try {
    await flush();
    const pending = api.pending;
    emit(null, 'SIGNED_OUT');
    release({ data: [{ competitions: { id: 'old', name: 'Private old league' } }], error: null });
    await pending;
    assert.equal(dom.window.document.querySelector('[data-home-action-panel]').hidden, true);
    assert.equal(dom.window.document.querySelector('[data-home-action-list]').textContent, '');
  } finally { dom.window.close(); }
});

function profileFixture({ profile, cached, handler, storageBlocked = false } = {}) {
  const dom = new JSDOM('<body><div data-auth-panel></div></body>', { url: 'https://test.invalid/index.html', runScripts: 'outside-only' });
  const client = fakeSupabase({ profiles: profile ? [{ id: user.id, ...profile }] : [] }, { handler, user });
  let authCallback;
  Object.assign(dom.window, { supabase: client, getSessionUser: async () => user,
    onSessionUserChange: (callback) => { authCallback = callback; },
    boundedRead: (fn) => boundedRead(fn, 10) });
  if (cached) dom.window.localStorage.setItem('premPredicsAccountProfile:v1:' + user.id, JSON.stringify(cached));
  if (storageBlocked) Object.defineProperty(dom.window, 'localStorage', { value: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } } });
  const source = readFileSync(new URL('../assets/js/site-auth.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '');
  dom.window.eval(source + '\nwindow.testProfile = {get pending() { return profileRefreshPromise; }};');
  return { dom, client, api: dom.window.testProfile, emit: (u, e) => authCallback(u, e) };
}

test('profile renders username/photo from cache immediately and refreshes without using email', async () => {
  let release;
  const avatar = 'data:image/png;base64,AA==';
  const { dom, api } = profileFixture({ cached: { display_name: 'Known username', profile_image_url: avatar },
    handler: () => new Promise((resolve) => { release = resolve; }) });
  try {
    await flush();
    assert.equal(dom.window.document.querySelector('.account-name').textContent, 'Known username');
    assert.equal(dom.window.document.querySelector('.account-avatar img').getAttribute('src'), avatar);
    release({ data: { display_name: 'Updated username', profile_image_url: null }, error: null });
    await api.pending;
    assert.equal(dom.window.document.querySelector('.account-name').textContent, 'Updated username');
    assert.equal(dom.window.document.querySelector('.account-avatar img'), null, 'removing photo must not resurrect cached image');
    assert.doesNotMatch(dom.window.document.body.textContent, /hidden@example/);
  } finally { dom.window.close(); }
});

test('profile retries transient failures and still renders when browser storage is blocked', async () => {
  let attempts = 0;
  const { dom, api } = profileFixture({ storageBlocked: true, handler: () => {
    attempts += 1;
    return attempts === 1 ? { data: null, error: new Error('Temporary') }
      : { data: { display_name: 'Recovered username', profile_image_url: 'data:image/png;base64,AA==' }, error: null };
  } });
  try {
    await flush();
    await api.pending;
    assert.equal(attempts, 2);
    assert.equal(dom.window.document.querySelector('.account-name').textContent, 'Recovered username');
    assert.ok(dom.window.document.querySelector('.account-avatar img'));
  } finally { dom.window.close(); }
});

test('a late profile refresh cannot render or cache another user after sign-out', async () => {
  let release;
  const { dom, api, emit } = profileFixture({ handler: () => new Promise((resolve) => { release = resolve; }) });
  try {
    await flush();
    const pending = api.pending;
    emit(null, 'SIGNED_OUT');
    release({ data: { display_name: 'Old user' }, error: null });
    await pending;
    assert.equal(dom.window.document.querySelector('[data-auth-panel]').textContent, '');
    assert.equal(dom.window.localStorage.getItem('premPredicsAccountProfile:v1:' + user.id), null);
  } finally { dom.window.close(); }
});
