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

const state = {
  user: null,
  league: null,
  gameweeks: [],
  members: [],
  selectedUserId: null,
};

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function memberName(userId) {
  return state.members.find((member) => member.user_id === userId)?.display_name || 'Player';
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
    .select('gameweek_id, player_id, pick_slot, players(display_name)')
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

async function renderRows() {
  const picks = await loadPicks();
  const stats = await loadStats(picks);

  const rows = state.gameweeks.map((gameweek) => {
    const locked = isPast(gameweek.star_man_locks_at);
    const pick = picks.get(String(gameweek.gameweek_id));

    if (!locked || !pick) {
      return '';
    }

    const statRow = stats.get(`${pick.gameweek_id}:${pick.player_id}`) || {};
    return `
      <div class="star-row">
        <span class="gw-badge">GW${escapeHtml(gameweek.gameweek_number)}</span>
        <span class="star-choice">
          <span class="star-name">${escapeHtml(pick.player_name)}</span>
          <span class="star-icons" aria-label="Goals, assists, yellow cards, red cards">${statIcons(statRow)}</span>
        </span>
      </div>
    `;
  }).filter(Boolean);

  starMenList.innerHTML = rows.join('') || '<p class="state-text">No Star Men chosen yet.</p>';
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

const context = await loadLeagueContext();
if (context.error) {
  title.textContent = 'Star Men unavailable';
  subtitle.textContent = context.error;
  starMenList.innerHTML = '';
} else {
  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);

  try {
    await loadData();
    await render();
  } catch (error) {
    title.textContent = 'Star Men unavailable';
    subtitle.textContent = error.message || 'Could not load Star Men.';
    starMenList.innerHTML = '';
  }
}

