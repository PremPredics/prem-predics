import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
} from './league-context.js';
import { supabase } from './supabase-client.js';

const title = document.querySelector('[data-view-title]');
const subtitle = document.querySelector('[data-view-subtitle]');
const playerPills = document.querySelector('[data-player-pills]');
const starMenList = document.querySelector('[data-star-men-list]');
const leagueBackLink = document.querySelector('[data-league-back]');
const starBackLink = document.querySelector('[data-star-back]');
const starCurseModal = document.querySelector('[data-star-curse-modal]');
const starCurseModalBody = document.querySelector('[data-star-curse-modal-body]');
const closeStarCurseButton = document.querySelector('[data-close-star-curse]');

const starManCurseKeys = new Set([
  'curse_alphabet_15',
  'curse_alphabet_20',
  'curse_scoring_drought_3',
  'curse_scoring_drought_5',
  'curse_random_roulette',
  'curse_tiny_club',
  'curse_furious',
]);

const starManPowerKeys = new Set([
  'power_goal',
  'power_immigrants',
  'power_lanky_crouch',
  'power_small_and_mighty',
  'power_assist_king',
  'power_late_scout',
  'super_star_man',
  'super_sub',
  'super_duo',
]);

const effectNameOverrides = {
  curse_random_roulette: 'Curse Of The Microstate',
};

const state = {
  user: null,
  league: null,
  gameweeks: [],
  members: [],
  effectProfiles: new Map(),
  visibleEffectsByGameweek: new Map(),
  selectedUserId: null,
};

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function memberName(userId) {
  return state.members.find((member) => member.user_id === userId)?.display_name || 'Player';
}

function effectDefinition(effect) {
  return normaliseNested(effect?.card_definitions) || {};
}

function effectKey(effect) {
  return effectDefinition(effect).effect_key;
}

function effectName(effect) {
  const key = effectKey(effect);
  return effectNameOverrides[key] || effectDefinition(effect).name || 'Curse Card';
}

function effectDescription(effect) {
  return effectDefinition(effect).description || 'This card affects this Star Man pick.';
}

function playedByName(effect) {
  if (String(effect.played_by_user_id || '') === String(state.user?.id || '')) {
    return 'You';
  }

  return state.effectProfiles.get(effect.played_by_user_id)?.display_name || 'An opponent';
}

function isStarManCurse(effect) {
  return starManCurseKeys.has(effectKey(effect));
}

function isStarManPower(effect) {
  return starManPowerKeys.has(effectKey(effect));
}

function effectCategory(effect) {
  const category = effectDefinition(effect).category;
  if (category) {
    return category;
  }

  return isStarManCurse(effect) ? 'curse' : 'power';
}

function avatar(member) {
  const imageUrl = member.profile_image_url?.startsWith('data:image/')
    ? member.profile_image_url
    : null;

  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="">`;
  }

  return escapeHtml((member.display_name || 'P').trim().charAt(0).toUpperCase() || 'P');
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function repeatedIcon(symbol, count) {
  return Array.from({ length: numberValue(count) }, () => `<span>${symbol}</span>`).join('');
}

function cardIcons(className, count) {
  return Array.from({ length: numberValue(count) }, () => `<span class="card-icon ${className}" aria-hidden="true"></span>`).join('');
}

function statIcons(stats) {
  const icons = [
    repeatedIcon('&#9917;', stats.goals),
    repeatedIcon('&#127919;', stats.assists),
    cardIcons('yellow', stats.yellow_cards),
    cardIcons('red', stats.red_cards),
  ].join('');

  return icons || '<span aria-hidden="true"></span>';
}

function statSum(row) {
  return numberValue(row?.goals)
    + numberValue(row?.assists)
    + numberValue(row?.yellow_cards)
    + numberValue(row?.red_cards);
}

function mergeStats(primary, fallback) {
  if (!primary) {
    return fallback || {};
  }

  if (!fallback) {
    return primary;
  }

  return statSum(fallback) > statSum(primary) ? fallback : primary;
}

function renderPlayers() {
  playerPills.innerHTML = state.members.map((member) => `
    <button class="player-pill ${member.user_id === state.selectedUserId ? 'active' : ''}" type="button" data-user-id="${member.user_id}" title="${escapeHtml(member.display_name)}">
      ${avatar(member)}
    </button>
  `).join('');

  playerPills.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedUserId = button.dataset.userId;
      render();
    });
  });
}

async function loadPicks() {
  const { data, error } = await supabase
    .from('star_man_picks')
    .select('gameweek_id, player_id, pick_slot, source_card_effect_id, players(display_name, nationality, height_cm)')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .eq('user_id', state.selectedUserId)
    .eq('pick_slot', 'primary');

  if (error) {
    throw error;
  }

  return new Map((data || []).map((pick) => {
    const player = normaliseNested(pick.players);
    return [String(pick.gameweek_id), {
      ...pick,
      player_name: player?.display_name || 'Player',
      player_nationality: player?.nationality || '',
      player_height_cm: player?.height_cm || null,
    }];
  }));
}

async function loadStats(picks) {
  const pickRows = [...picks.values()];
  if (!pickRows.length) {
    return new Map();
  }

  const playerIds = [...new Set(pickRows.map((pick) => pick.player_id).filter(Boolean))];
  const gameweekIds = [...new Set(pickRows.map((pick) => pick.gameweek_id).filter(Boolean))];
  if (!playerIds.length || !gameweekIds.length) {
    return new Map();
  }

  const [manualResponse, fixtureTotalsResponse] = await Promise.all([
    supabase
      .from('player_gameweek_stats')
      .select('gameweek_id, player_id, goals, assists, yellow_cards, red_cards')
      .eq('season_id', state.league.season_id)
      .in('player_id', playerIds)
      .in('gameweek_id', gameweekIds),
    supabase
      .from('player_gameweek_stat_totals')
      .select('gameweek_id, player_id, goals, assists, yellow_cards, red_cards')
      .eq('season_id', state.league.season_id)
      .in('player_id', playerIds)
      .in('gameweek_id', gameweekIds),
  ]);

  if (manualResponse.error && fixtureTotalsResponse.error) {
    throw manualResponse.error;
  }

  const manualStats = new Map((manualResponse.data || []).map((row) => [`${row.gameweek_id}:${row.player_id}`, row]));
  const fixtureStats = new Map((fixtureTotalsResponse.data || []).map((row) => [`${row.gameweek_id}:${row.player_id}`, row]));
  const merged = new Map();

  pickRows.forEach((pick) => {
    const key = `${pick.gameweek_id}:${pick.player_id}`;
    merged.set(key, mergeStats(manualStats.get(key), fixtureStats.get(key)) || {});
  });

  return merged;
}

async function loadScorePoints(picks) {
  const pickRows = [...picks.values()];
  if (!pickRows.length) {
    return new Map();
  }

  const gameweekIds = [...new Set(pickRows.map((pick) => pick.gameweek_id).filter(Boolean))];
  if (!gameweekIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('star_man_score_details')
    .select('gameweek_id, player_id, pick_slot, points')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .eq('user_id', state.selectedUserId)
    .eq('pick_slot', 'primary')
    .in('gameweek_id', gameweekIds);

  if (error) {
    return new Map();
  }

  return new Map((data || []).map((row) => [`${row.gameweek_id}:${row.player_id}`, Number(row.points || 0)]));
}

function isEffectForGameweek(effect, gameweek) {
  const gameweekId = Number(gameweek.gameweek_id);
  const directGameweek = !effect.gameweek_id || Number(effect.gameweek_id) === gameweekId;
  const startsOk = !effect.start_gameweek_id || Number(effect.start_gameweek_id) <= gameweekId;
  const endsOk = !effect.end_gameweek_id || Number(effect.end_gameweek_id) >= gameweekId;
  return directGameweek && startsOk && endsOk;
}

async function loadStarManEffects() {
  const { data, error } = await supabase
    .from('active_card_effects')
    .select('id, card_id, season_id, gameweek_id, start_gameweek_id, end_gameweek_id, fixture_id, played_at, played_by_user_id, target_user_id, status, payload, card_definitions(effect_key, name, description, category)')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .in('status', ['active', 'resolved']);

  if (error) {
    throw error;
  }

  const effects = (data || [])
    .filter((effect) => state.gameweeks.some((gameweek) => isEffectForGameweek(effect, gameweek)))
    .filter((effect) => (
      (isStarManCurse(effect) && String(effect.target_user_id || '') === String(state.selectedUserId))
      || (isStarManPower(effect) && String(effect.played_by_user_id || '') === String(state.selectedUserId))
    ));

  const playedByUserIds = [...new Set(effects.map((effect) => effect.played_by_user_id).filter(Boolean))];
  state.effectProfiles = new Map();
  if (playedByUserIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, profile_image_url')
      .in('id', playedByUserIds);

    if (profilesError) {
      throw profilesError;
    }

    state.effectProfiles = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  return effects;
}

function starManCursesForGameweek(gameweek, effects) {
  return effects
    .filter(isStarManCurse)
    .filter((effect) => isEffectForGameweek(effect, gameweek));
}

function starManPowerAppliesToPick(effect, gameweek, pick) {
  if (!isStarManPower(effect) || !isEffectForGameweek(effect, gameweek)) {
    return false;
  }

  const key = effectKey(effect);
  if (String(pick.source_card_effect_id || '') === String(effect.id)) {
    return true;
  }

  if (key === 'power_late_scout' || key === 'super_sub') {
    return false;
  }

  if (key === 'power_immigrants') {
    return String(pick.player_nationality || '').trim().toLowerCase() !== 'england';
  }

  if (key === 'power_lanky_crouch') {
    return Number(pick.player_height_cm || 0) >= 185;
  }

  if (key === 'power_small_and_mighty') {
    const height = Number(pick.player_height_cm || 0);
    return height > 0 && height <= 175;
  }

  return true;
}

function starManPowersForGameweek(gameweek, effects, pick) {
  return effects
    .filter((effect) => starManPowerAppliesToPick(effect, gameweek, pick))
    .sort((a, b) => new Date(a.played_at || 0) - new Date(b.played_at || 0));
}

function renderEffectMarkers(gameweek, effects) {
  if (!effects.length) {
    return '<span class="star-effects" aria-hidden="true"></span>';
  }

  return `
    <span class="star-effects">
      ${effects.map((effect) => {
        const category = effectCategory(effect);
        const symbol = category === 'curse' ? '&#9760;' : '&#9994;';
        const label = `View ${effectName(effect)}`;
        return `<button class="${category}-marker" type="button" data-star-effect-gameweek="${gameweek.gameweek_id}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span>${symbol}</span></button>`;
      }).join('')}
    </span>
  `;
}

function renderPointsBadge(points) {
  const value = Number(points || 0);
  return `<span class="star-points-badge ${value < 0 ? 'negative' : ''}" aria-label="${value} Star Man points">${escapeHtml(value)}</span>`;
}

function curseCardDetailMarkup(effect) {
  const category = effectCategory(effect);
  const profile = state.effectProfiles.get(effect.played_by_user_id);
  const imageUrl = profile?.profile_image_url || '';
  const initial = (playedByName(effect) || 'P').trim().charAt(0).toUpperCase() || 'P';
  return `
    <div class="curse-card-wrap">
      <div class="curse-card-played-by">
        Played by
        <span class="played-by-avatar">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : escapeHtml(initial)}</span>
        <span>${escapeHtml(playedByName(effect))}</span>
      </div>
      <article class="curse-detail-card ${category === 'power' ? 'power-detail-card' : ''} ${category === 'super' ? 'super-detail-card' : ''}">
        <strong>${escapeHtml(effectName(effect))}</strong>
        <p>${escapeHtml(effectDescription(effect))}</p>
      </article>
    </div>
  `;
}

function openStarCurseModal(gameweekId) {
  const effects = state.visibleEffectsByGameweek.get(String(gameweekId)) || [];
  if (!starCurseModal || !starCurseModalBody || !effects.length) {
    return;
  }

  const titleElement = starCurseModal.querySelector('h2');
  if (titleElement) {
    titleElement.textContent = effects.length === 1 ? 'Active Card' : 'Active Cards';
  }
  starCurseModalBody.innerHTML = effects.map(curseCardDetailMarkup).join('');
  starCurseModal.classList.add('show');
  starCurseModal.setAttribute('aria-hidden', 'false');
}

function closeStarCurseModal() {
  if (!starCurseModal) {
    return;
  }

  starCurseModal.classList.remove('show');
  starCurseModal.setAttribute('aria-hidden', 'true');
}

function wireStarCurseMarkers() {
  starMenList.querySelectorAll('[data-star-effect-gameweek]').forEach((button) => {
    button.addEventListener('click', () => openStarCurseModal(button.dataset.starEffectGameweek));
  });
}

async function renderRows() {
  const [picks, starManEffects] = await Promise.all([
    loadPicks(),
    loadStarManEffects(),
  ]);
  const [stats, pointsByPick] = await Promise.all([
    loadStats(picks),
    loadScorePoints(picks),
  ]);
  state.visibleEffectsByGameweek = new Map();

  const rows = state.gameweeks.map((gameweek) => {
    const locked = isPast(gameweek.star_man_locks_at);
    const pick = picks.get(String(gameweek.gameweek_id));

    if (!locked || !pick) {
      return '';
    }

    const statRow = stats.get(`${pick.gameweek_id}:${pick.player_id}`) || {};
    const curses = starManCursesForGameweek(gameweek, starManEffects);
    const powers = starManPowersForGameweek(gameweek, starManEffects, pick);
    const effects = [...powers, ...curses].sort((a, b) => new Date(a.played_at || 0) - new Date(b.played_at || 0));
    state.visibleEffectsByGameweek.set(String(gameweek.gameweek_id), effects);
    const points = pointsByPick.get(`${pick.gameweek_id}:${pick.player_id}`) || 0;
    return `
      <div class="star-row">
        <span class="gw-badge">GW${escapeHtml(gameweek.gameweek_number)}</span>
        <span class="star-choice">
          <span class="star-name">${escapeHtml(pick.player_name)}</span>
          <span class="star-icons" aria-label="Goals, assists, yellow cards, red cards">${statIcons(statRow)}</span>
        </span>
        ${renderEffectMarkers(gameweek, effects)}
        ${renderPointsBadge(points)}
      </div>
    `;
  }).filter(Boolean);

  starMenList.innerHTML = rows.join('') || '<p class="state-text">No Star Men chosen yet.</p>';
  wireStarCurseMarkers();
}

async function render() {
  const selectedName = memberName(state.selectedUserId);
  title.textContent = `${selectedName}'s Star Men`;
  subtitle.textContent = 'Chosen Star Men';
  renderPlayers();

  try {
    await renderRows();
  } catch (error) {
    starMenList.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load Star Men.')}</p>`;
  }
}

async function loadData() {
  const [deadlinesResponse, membersResponse] = await Promise.all([
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, season_id, gameweek_number, star_man_locks_at')
      .eq('season_id', state.league.season_id)
      .order('gameweek_number', { ascending: true }),
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(display_name, profile_image_url)')
      .eq('competition_id', state.league.id)
      .order('joined_at', { ascending: true }),
  ]);

  for (const response of [deadlinesResponse, membersResponse]) {
    if (response.error) {
      throw response.error;
    }
  }

  state.gameweeks = deadlinesResponse.data || [];
  const members = (membersResponse.data || []).map((member) => {
    const profile = normaliseNested(member.profiles);
    return {
      user_id: member.user_id,
      display_name: profile?.display_name || 'Player',
      profile_image_url: profile?.profile_image_url || null,
    };
  });

  state.members = members.sort((a, b) => (
    (a.user_id === state.user.id ? -1 : 0)
    || (b.user_id === state.user.id ? 1 : 0)
    || a.display_name.localeCompare(b.display_name)
  ));
  state.selectedUserId = state.user.id;
}

closeStarCurseButton?.addEventListener('click', closeStarCurseModal);
starCurseModal?.addEventListener('click', (event) => {
  if (event.target === starCurseModal) {
    closeStarCurseModal();
  }
});

const context = await loadLeagueContext();
if (context.error) {
  title.textContent = 'Star Men unavailable';
  subtitle.textContent = context.error;
  starMenList.innerHTML = '';
} else {
  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);
  starBackLink.href = leagueUrl('star-man-hub.html', state.league.id);

  try {
    await loadData();
    await render();
  } catch (error) {
    title.textContent = 'Star Men unavailable';
    subtitle.textContent = error.message || 'Could not load Star Men.';
    starMenList.innerHTML = '';
  }
}

