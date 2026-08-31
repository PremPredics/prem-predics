import { supabase } from './supabase-client.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { escapeHtml, leagueUrl, loadLeagueContext, normaliseNested } from './league-context.js';
import { currentLiveCurseEffects } from './live-curses-model.js';

const board = document.querySelector('[data-curse-board]');
const leagueLink = document.querySelector('[data-league-link]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const liveCount = document.querySelector('[data-live-count]');
const targetCount = document.querySelector('[data-target-count]');
const safeCount = document.querySelector('[data-safe-count]');
const ownAlert = document.querySelector('[data-own-curse-alert]');

const starManLiveEffectByKey = {
  curse_alphabet_15: (name) => `${name}'s Star Man choice is restricted by the 15+ alphabet rule.`,
  curse_alphabet_20: (name) => `${name}'s Star Man choice is restricted by the 20+ alphabet rule.`,
  curse_scoring_drought_3: (name) => `${name}'s Star Man pool is restricted by the three-match scoring-drought rule.`,
  curse_scoring_drought_5: (name) => `${name}'s Star Man pool is restricted by the five-match scoring-drought rule.`,
  curse_random_roulette: (name) => `${name}'s Star Man pool is restricted to the selected microstate nationality.`,
  curse_tiny_club: (name) => `${name}'s Star Man pool is restricted by the Tiny Club rule.`,
  curse_furious: (name) => `${name}'s Star Man scoring is affected by the Furious rule.`,
};

const canonicalCurseNames = {
  curse_hated: 'Curse of the Hated',
  curse_gambler: 'Curse of the Random',
  curse_furious: 'Curse of the Furious',
  curse_thief: 'Curse of the Thief',
};

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  members: [],
  profiles: new Map(),
  gameweekNumbers: new Map(),
  fixtures: new Map(),
  teams: new Map(),
  forcedOutcomes: new Map(),
  hatedEffectIds: new Set(),
  randomEffectIds: new Set(),
  cardDefinitions: new Map(),
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
  const id = String(effect?.id || '');
  if (state.hatedEffectIds.has(id)) return 'curse_hated';
  if (state.randomEffectIds.has(id)) return 'curse_gambler';
  return effect?.payload?.effect_key || effectDefinition(effect).effect_key || '';
}

function effectName(effect) {
  const key = effectKey(effect);
  return canonicalCurseNames[key]
    || effectDefinition(effect).name
    || key.replaceAll('_', ' ')
    || 'Curse Card';
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

function fixtureName(fixtureId) {
  const fixture = state.fixtures.get(String(fixtureId || ''));
  if (!fixture) return 'the selected match';
  const home = state.teams.get(String(fixture.home_team_id || '')) || 'Home';
  const away = state.teams.get(String(fixture.away_team_id || '')) || 'Away';
  return `${home} vs ${away}`;
}

function forcedOutcomeRows(effect) {
  return state.forcedOutcomes.get(String(effect.id || '')) || [];
}

function stolenCardDefinition(effect) {
  const cardId = String(effect?.payload?.stolen_card_id || '');
  return state.cardDefinitions.get(cardId) || {
    id: cardId,
    name: 'Stolen Regular Card',
    category: 'regular',
  };
}

function stolenCardMarkup(effect) {
  const card = stolenCardDefinition(effect);
  const category = ['power', 'curse'].includes(card.category) ? card.category : 'regular';
  return `
    <div class="stolen-card-preview ${escapeHtml(category)}-card">
      <small>Stolen Card</small>
      <strong>${escapeHtml(card.name || 'Stolen Regular Card')}</strong>
    </div>`;
}

function effectOutcomeMarkup(effect) {
  const key = effectKey(effect);
  const rows = forcedOutcomeRows(effect);
  const displayRows = rows.length
    ? rows
    : (key === 'curse_hated' && effect.fixture_id
      ? [{ fixture_id: effect.fixture_id, home_goals: 8, away_goals: 2 }]
      : []);
  const targetName = profileFor(effect.target_user_id).display_name || 'League Player';

  if (key === 'curse_hated' && displayRows.length) {
    return `
      <section class="curse-impact is-locked">
        <span class="impact-kicker">Live Effect</span>
        <div class="forced-score-list">
          ${displayRows.map((row) => `
            <div class="forced-score-row">
              <span>${escapeHtml(fixtureName(row.fixture_id))}</span>
              <b>${escapeHtml(`${row.home_goals}-${row.away_goals}`)}</b>
            </div>`).join('')}
        </div>
      </section>`;
  }

  if (key === 'curse_gambler' && displayRows.length) {
    return `
      <section class="curse-impact is-locked">
        <span class="impact-kicker">Live Effect</span>
        <strong>Dice-locked predictions</strong>
        <div class="forced-score-list">
          ${displayRows.map((row) => `
            <div class="forced-score-row">
              <span>${escapeHtml(fixtureName(row.fixture_id))}</span>
              <b>${escapeHtml(`${row.home_goals}-${row.away_goals}`)}</b>
            </div>`).join('')}
        </div>
      </section>`;
  }

  if (key === 'curse_thief' && effect.status === 'resolved') {
    const stolenCard = stolenCardDefinition(effect);
    return `
      <section class="curse-impact is-thief">
        <span class="impact-kicker">Live Effect</span>
        <div class="thief-effect">
          ${stolenCardMarkup(effect)}
          <p><strong>${escapeHtml(stolenCard.name || 'A Regular Card')}</strong> was stolen from ${escapeHtml(targetName)}.</p>
        </div>
      </section>`;
  }

  if (key === 'curse_deleted_match') {
    return `
      <section class="curse-impact is-locked">
        <span class="impact-kicker">Live Effect</span>
        <strong>Prediction removed from scoring</strong>
        <div class="forced-score-list">
          <div class="forced-score-row">
            <span>${escapeHtml(fixtureName(effect.fixture_id))}</span>
            <b>0 pts</b>
          </div>
        </div>
        <small>${escapeHtml(targetName)} cannot earn prediction points from this match.</small>
      </section>`;
  }

  if (starManLiveEffectByKey[key]) {
    return `
      <section class="curse-impact">
        <span class="impact-kicker">Live Effect</span>
        <p>${escapeHtml(starManLiveEffectByKey[key](targetName))}</p>
      </section>`;
  }

  const impactByKey = {
    curse_glasses: { heading: 'Prediction scoring restriction', detail: `Any 0-0 prediction entered by ${targetName} scores no points while this Curse is active.` },
    curse_even_number: { heading: 'Prediction entry restriction', detail: `${targetName} can only enter even team goal totals.` },
    curse_odd_number: { heading: 'Prediction entry restriction', detail: `${targetName} can only enter odd team goal totals.` },
  };
  const impact = impactByKey[key] || {
    heading: 'Active Curse',
    detail: `This Curse is currently affecting ${targetName}.`,
  };
  return `
    <section class="curse-impact">
      <span class="impact-kicker">Live Effect</span>
      <strong>${escapeHtml(impact.heading)}</strong>
      <p>${escapeHtml(impact.detail)}</p>
    </section>`;
}

function curseCardMarkup(effect) {
  return `
    <article class="curse-card-slot">
      <div class="live-curse-card">
        <strong class="live-card-name">${escapeHtml(effectName(effect))}</strong>
      </div>
    </article>`;
}

function curseEffectMarkup(effect) {
  const source = profileFor(effect.played_by_user_id);
  const sourceName = sameId(effect.played_by_user_id, state.user?.id) ? 'You' : source.display_name;
  return `
    <article class="curse-effect-entry">
      <div class="curse-meta">
        ${avatarMarkup(source, 'mini-avatar')}
        <span class="curse-meta-copy">
          <strong>${escapeHtml(effectName(effect))}</strong>
          <small>${escapeHtml(effectGameweekText(effect))} &bull; Played by ${escapeHtml(sourceName)} &bull; ${escapeHtml(playedAtText(effect.played_at))}</small>
        </span>
      </div>
      ${effectOutcomeMarkup(effect)}
    </article>`;
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
  ownAlert.classList.toggle('show', ownCount > 0);
  ownAlert.textContent = ownCount > 0
    ? `You have ${ownCount} Live Curse${ownCount === 1 ? '' : 's'} affecting you`
    : '';

  if (!total) {
    board.innerHTML = `
      <div class="empty-state">
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
          <span class="curse-count" title="Active curse count"><b>${effects.length}</b><small>Live</small></span>
        </div>
        <div class="curse-card-segment">
          <span class="segment-label">Active Curse Cards</span>
          <div class="curse-stack">${sortedEffects.map(curseCardMarkup).join('')}</div>
        </div>
        <div class="curse-effects-segment">
          <span class="segment-label">Live Effects</span>
          <div class="curse-effects-grid">${sortedEffects.map(curseEffectMarkup).join('')}</div>
        </div>
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
    const [
      { data: effects, error: effectError },
      { data: members, error: memberError },
      { data: gameweeks, error: gameweekError },
      { data: fixtures, error: fixtureError },
      { data: teams, error: teamError },
      { data: hatedRows, error: hatedError },
      { data: randomRows, error: randomError },
      { data: cardDefinitions, error: definitionError },
    ] = await Promise.all([
      supabase
        .from('active_card_effects')
        .select('id, gameweek_id, start_gameweek_id, end_gameweek_id, fixture_id, played_at, played_by_user_id, target_user_id, status, payload, card_definitions!inner(effect_key, name, description, category)')
        .eq('competition_id', state.league.id)
        .eq('season_id', state.league.season_id)
        .in('status', ['active', 'resolved'])
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
      supabase
        .from('fixtures')
        .select('id, home_team_id, away_team_id')
        .eq('season_id', state.league.season_id)
        .eq('gameweek_id', state.activeGameweek.gameweek_id),
      supabase
        .from('teams')
        .select('id, name'),
      supabase
        .from('curse_hated_forced_predictions')
        .select('card_effect_id, fixture_id, home_goals, away_goals')
        .eq('competition_id', state.league.id)
        .eq('season_id', state.league.season_id)
        .eq('gameweek_id', state.activeGameweek.gameweek_id),
      supabase
        .from('curse_gambler_rolls')
        .select('card_effect_id, fixture_id, roll_number, home_goals, away_goals')
        .eq('competition_id', state.league.id)
        .eq('season_id', state.league.season_id)
        .eq('gameweek_id', state.activeGameweek.gameweek_id)
        .order('roll_number', { ascending: true }),
      supabase
        .from('card_definitions')
        .select('id, name, category, deck_type'),
    ]);
    const firstError = effectError || memberError || gameweekError || fixtureError || teamError || hatedError || randomError || definitionError;
    if (firstError) throw firstError;
    state.members = (members || []).map((member) => {
      const profile = normaliseNested(member.profiles) || {};
      return { user_id: member.user_id, display_name: profile.display_name || 'League Player', profile_image_url: profile.profile_image_url || null };
    });
    state.profiles = new Map(state.members.map((member) => [String(member.user_id), member]));
    state.gameweekNumbers = new Map((gameweeks || []).map((gameweek) => [String(gameweek.gameweek_id), Number(gameweek.gameweek_number)]));
    state.fixtures = new Map((fixtures || []).map((fixture) => [String(fixture.id), fixture]));
    state.teams = new Map((teams || []).map((team) => [String(team.id), team.name]));
    state.cardDefinitions = new Map((cardDefinitions || []).map((card) => [String(card.id), card]));
    state.forcedOutcomes = new Map();
    state.hatedEffectIds = new Set((hatedRows || []).map((row) => String(row.card_effect_id || '')));
    state.randomEffectIds = new Set((randomRows || []).map((row) => String(row.card_effect_id || '')));
    [...(hatedRows || []), ...(randomRows || [])].forEach((row) => {
      const key = String(row.card_effect_id || '');
      const current = state.forcedOutcomes.get(key) || [];
      current.push(row);
      state.forcedOutcomes.set(key, current);
    });
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
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'curse_hated_forced_predictions', filter: `competition_id=eq.${state.league.id}`,
    }, scheduleRefresh)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'curse_gambler_rolls', filter: `competition_id=eq.${state.league.id}`,
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
