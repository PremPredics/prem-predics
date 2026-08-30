import { supabase } from './supabase-client.js';
import { isGameweekStarted, loadActiveGameweek } from './gameweek-context.js';
import { escapeHtml, leagueUrl, loadLeagueContext, normaliseNested } from './league-context.js';
import { currentLiveCurseEffects } from './live-curses-model.js';

const board = document.querySelector('[data-curse-board]');
const leagueLink = document.querySelector('[data-league-link]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const boardCaption = document.querySelector('[data-board-caption]');
const liveCount = document.querySelector('[data-live-count]');
const targetCount = document.querySelector('[data-target-count]');
const safeCount = document.querySelector('[data-safe-count]');
const ownAlert = document.querySelector('[data-own-curse-alert]');

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  members: [],
  profiles: new Map(),
  gameweekNumbers: new Map(),
  effects: [],
  channel: null,
  refreshTimer: null,
  pollTimer: null,
  loading: false,
};

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

function effectDefinition(effect) {
  return normaliseNested(effect?.card_definitions) || {};
}

function effectKey(effect) {
  return effectDefinition(effect).effect_key || effect.payload?.effect_key || '';
}

function effectName(effect) {
  if (effectKey(effect) === 'curse_gambler') return 'Curse of the Random';
  return effectDefinition(effect).name || effectKey(effect).replaceAll('_', ' ') || 'Curse Card';
}

function effectDescription(effect) {
  return effectDefinition(effect).description || 'This Curse is actively affecting the targeted player.';
}

function profileFor(userId) {
  return state.profiles.get(String(userId || '')) || { display_name: 'League Player', profile_image_url: null };
}

function avatarMarkup(profile, className = 'avatar') {
  const imageUrl = String(profile?.profile_image_url || '');
  const content = imageUrl.startsWith('data:image/')
    ? `<img src="${escapeHtml(imageUrl)}" alt="">`
    : escapeHtml(String(profile?.display_name || 'P').trim().charAt(0).toUpperCase() || 'P');
  return `<span class="${className}" aria-hidden="true">${content}</span>`;
}

function playedAtText(value) {
  if (!value) return 'Played recently';
  try {
    return `Played ${new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))}`;
  } catch {
    return 'Played recently';
  }
}

function effectGameweekText(effect) {
  const startId = effect.start_gameweek_id || effect.gameweek_id;
  const endId = effect.end_gameweek_id || startId;
  const start = state.gameweekNumbers.get(String(startId || '')) || state.activeGameweek?.gameweek_number || '?';
  const end = state.gameweekNumbers.get(String(endId || '')) || start;
  return Number(start) === Number(end) ? `GW${start}` : `GW${start}-${end}`;
}

function curseEntryMarkup(effect) {
  const source = profileFor(effect.played_by_user_id);
  const sourceName = sameId(effect.played_by_user_id, state.user?.id) ? 'You' : source.display_name;
  return `
    <article class="curse-entry">
      <div class="curse-name">
        <strong>${escapeHtml(effectName(effect))}</strong>
        <span class="gw-chip">${escapeHtml(effectGameweekText(effect))}${effect.fixture_id ? ' &bull; Match' : ''}</span>
      </div>
      <p class="curse-description">${escapeHtml(effectDescription(effect))}</p>
      <div class="curse-meta">
        ${avatarMarkup(source, 'mini-avatar')}
        <span>Played by ${escapeHtml(sourceName)} &bull; ${escapeHtml(playedAtText(effect.played_at))}</span>
      </div>
    </article>
  `;
}

function render() {
  const grouped = new Map();
  state.effects.forEach((effect) => {
    const key = String(effect.target_user_id);
    const list = grouped.get(key) || [];
    list.push(effect);
    grouped.set(key, list);
  });

  const total = state.effects.length;
  const targeted = grouped.size;
  const ownCount = (grouped.get(String(state.user?.id)) || []).length;
  liveCount.textContent = String(total);
  targetCount.textContent = String(targeted);
  safeCount.textContent = String(Math.max(0, state.members.length - targeted));
  gameweekLabel.textContent = `GW${state.activeGameweek?.gameweek_number || '--'}`;
  boardCaption.textContent = `${total} active Curse${total === 1 ? '' : 's'} across ${targeted} player${targeted === 1 ? '' : 's'} in Gameweek ${state.activeGameweek?.gameweek_number || '--'}.`;
  ownAlert.classList.toggle('show', ownCount > 0);
  ownAlert.textContent = ownCount > 0
    ? `You have ${ownCount} Live Curse${ownCount === 1 ? '' : 's'} affecting you`
    : '';

  if (!total) {
    board.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">&#128524;</span>
        <h3>The league is curse-free... for now.</h3>
        <p>No active Curse Cards are affecting anyone in this Gameweek. This board updates automatically when that changes.</p>
      </div>`;
    return;
  }

  const groups = [...grouped.entries()].sort((a, b) => {
    if (sameId(a[0], state.user?.id)) return -1;
    if (sameId(b[0], state.user?.id)) return 1;
    if (a[1].length !== b[1].length) return b[1].length - a[1].length;
    return String(profileFor(a[0]).display_name).localeCompare(String(profileFor(b[0]).display_name), 'en-GB');
  });

  board.innerHTML = groups.map(([targetUserId, effects]) => {
    const target = profileFor(targetUserId);
    const isYou = sameId(targetUserId, state.user?.id);
    const sortedEffects = [...effects].sort((a, b) => new Date(b.played_at || 0) - new Date(a.played_at || 0));
    return `
      <article class="victim-card${isYou ? ' is-you' : ''}">
        <div class="victim-head">
          ${avatarMarkup(target)}
          <div class="victim-title">
            <strong>${escapeHtml(isYou ? `${target.display_name} (You)` : target.display_name)}</strong>
            <span>${effects.length === 1 ? 'Under one live Curse' : `Under ${effects.length} live Curses`}</span>
          </div>
          <span class="curse-count" title="Active curse count">${effects.length}</span>
        </div>
        <div class="curse-stack">${sortedEffects.map(curseEntryMarkup).join('')}</div>
      </article>`;
  }).join('');
}

function renderError(message) {
  board.innerHTML = `
    <div class="error-state">
      <h3>The curse feed lost its spark.</h3>
      <p>${escapeHtml(message || 'Live Curses could not be loaded.')}</p>
      <button class="retry-btn" type="button" data-retry>Try Again</button>
    </div>`;
  board.querySelector('[data-retry]')?.addEventListener('click', loadLiveCurses);
}

async function loadLiveCurses() {
  if (state.loading || !state.league || !state.activeGameweek) return;
  state.loading = true;
  try {
    const [{ data: effects, error: effectError }, { data: members, error: memberError }, { data: gameweeks, error: gameweekError }] = await Promise.all([
      supabase
        .from('active_card_effects')
        .select('id, gameweek_id, start_gameweek_id, end_gameweek_id, fixture_id, played_at, played_by_user_id, target_user_id, status, payload, card_definitions!inner(effect_key, name, description, category)')
        .eq('competition_id', state.league.id)
        .eq('season_id', state.league.season_id)
        .eq('status', 'active')
        .not('target_user_id', 'is', null)
        .eq('card_definitions.category', 'curse'),
      supabase
        .from('competition_members')
        .select('user_id, joined_at, profiles(id, display_name, profile_image_url)')
        .eq('competition_id', state.league.id)
        .order('joined_at', { ascending: true }),
      supabase
        .from('gameweek_deadlines')
        .select('gameweek_id, gameweek_number')
        .eq('season_id', state.league.season_id),
    ]);
    if (effectError || memberError || gameweekError) throw effectError || memberError || gameweekError;
    state.members = (members || []).map((member) => {
      const profile = normaliseNested(member.profiles) || {};
      return { user_id: member.user_id, display_name: profile.display_name || 'League Player', profile_image_url: profile.profile_image_url || null };
    });
    state.profiles = new Map(state.members.map((member) => [String(member.user_id), member]));
    state.gameweekNumbers = new Map((gameweeks || []).map((gameweek) => [String(gameweek.gameweek_id), Number(gameweek.gameweek_number)]));
    state.effects = currentLiveCurseEffects(effects, state.activeGameweek, state.gameweekNumbers);
    render();
  } catch (error) {
    renderError(error.message || 'Live Curses could not be loaded.');
  } finally {
    state.loading = false;
  }
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(loadLiveCurses, 180);
}

function subscribe() {
  if (state.channel) supabase.removeChannel(state.channel);
  window.clearInterval(state.pollTimer);
  state.channel = supabase
    .channel(`live-curses-${state.league.id}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'active_card_effects', filter: `competition_id=eq.${state.league.id}`,
    }, scheduleRefresh)
    .subscribe();
  state.pollTimer = window.setInterval(() => {
    if (!document.hidden) loadLiveCurses();
  }, 15000);
}

async function init() {
  const context = await loadLeagueContext();
  if (context.error) {
    renderError(context.error);
    return;
  }
  state.user = context.user;
  state.league = context.league;
  leagueLink.href = leagueUrl('league.html', context.league.id);
  try {
    const { activeGameweek } = await loadActiveGameweek(context.league);
    if (!activeGameweek) throw new Error('No current Gameweek was found for this private league.');
    state.activeGameweek = activeGameweek;
    gameweekLabel.textContent = `GW${activeGameweek.gameweek_number}`;
    if (!isGameweekStarted(activeGameweek)) {
      boardCaption.textContent = `Showing Curses already assigned for upcoming Gameweek ${activeGameweek.gameweek_number}.`;
    }
    await loadLiveCurses();
    subscribe();
  } catch (error) {
    renderError(error.message || 'Live Curses could not be loaded.');
  }
}

window.addEventListener('beforeunload', () => {
  window.clearTimeout(state.refreshTimer);
  window.clearInterval(state.pollTimer);
  if (state.channel) supabase.removeChannel(state.channel);
});

init();
