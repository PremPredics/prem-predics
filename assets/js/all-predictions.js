import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const title = document.querySelector('[data-view-title]');
const subtitle = document.querySelector('[data-view-subtitle]');
const currentGameweek = document.querySelector('[data-current-gameweek]');
const previousButton = document.querySelector('[data-previous-gameweek]');
const nextButton = document.querySelector('[data-next-gameweek]');
const playerPills = document.querySelector('[data-player-pills]');
const predictionList = document.querySelector('[data-prediction-list]');
const leagueBackLink = document.querySelector('[data-league-back]');

const state = {
  user: null,
  league: null,
  teams: new Map(),
  gameweeks: [],
  fixturesByGameweek: new Map(),
  members: [],
  selectedGameweekIndex: 0,
  selectedUserId: null,
};

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function teamName(teamId) {
  return shortTeamName(state.teams.get(teamId) || 'Team');
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

function selectedGameweek() {
  return state.gameweeks[state.selectedGameweekIndex] || null;
}

function fixturesForGameweek(gameweekId) {
  return state.fixturesByGameweek.get(String(gameweekId)) || [];
}

function gameweekHasLockedPredictions(gameweek) {
  const fixtures = fixturesForGameweek(gameweek.gameweek_id).filter((fixture) => fixture.status !== 'postponed');
  return fixtures.some((fixture) => isPast(fixture.prediction_locks_at));
}

function mostRecentPublicIndex(activeGameweek) {
  const publicIndexes = state.gameweeks
    .map((gameweek, index) => ({ gameweek, index }))
    .filter(({ gameweek }) => gameweekHasLockedPredictions(gameweek));

  if (publicIndexes.length) {
    return publicIndexes[publicIndexes.length - 1].index;
  }

  return Math.max(0, state.gameweeks.findIndex((gameweek) => gameweek.gameweek_id === activeGameweek?.gameweek_id));
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

async function loadPredictions(gameweek, fixtures) {
  if (!fixtures.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('fixture_id, home_goals, away_goals, prediction_slot')
    .eq('competition_id', state.league.id)
    .eq('user_id', state.selectedUserId)
    .eq('prediction_slot', 'primary')
    .in('fixture_id', fixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  return new Map((data || []).map((prediction) => [prediction.fixture_id, prediction]));
}

async function loadResults(fixtures) {
  if (!fixtures.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('match_results')
    .select('fixture_id, home_goals, away_goals')
    .in('fixture_id', fixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  return new Map((data || []).map((result) => [result.fixture_id, result]));
}

function predictionClass(prediction, result, locked) {
  if (!locked || !prediction || !result) {
    return '';
  }

  const predictedHome = Number(prediction.home_goals);
  const predictedAway = Number(prediction.away_goals);
  const actualHome = Number(result.home_goals);
  const actualAway = Number(result.away_goals);

  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 'correct-score';
  }

  if (Math.sign(predictedHome - predictedAway) === Math.sign(actualHome - actualAway)) {
    return 'correct-result';
  }

  return 'incorrect';
}

async function renderPredictionRows(gameweek) {
  const fixtures = fixturesForGameweek(gameweek.gameweek_id)
    .filter((fixture) => fixture.status !== 'postponed')
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));

  if (!fixtures.length) {
    predictionList.innerHTML = '<p class="state-text">No fixtures found for this gameweek.</p>';
    return;
  }

  const [predictions, results] = await Promise.all([
    loadPredictions(gameweek, fixtures),
    loadResults(fixtures),
  ]);
  predictionList.innerHTML = fixtures.map((fixture) => {
    const locked = isPast(fixture.prediction_locks_at);
    const prediction = predictions.get(fixture.id);
    const result = results.get(fixture.id);
    const resultClass = predictionClass(prediction, result, locked);
    const score = !locked
      ? '-'
      : prediction
        ? `${prediction.home_goals}-${prediction.away_goals}`
        : 'X-X';
    return `
      <div class="prediction-row ${locked ? 'locked' : 'unlocked'} ${locked && !prediction ? 'missed' : ''} ${resultClass}">
        <span class="gw-badge">GW${escapeHtml(gameweek.gameweek_number)}</span>
        <span>${escapeHtml(teamName(fixture.home_team_id))}</span>
        <strong>${escapeHtml(score)}</strong>
        <span>${escapeHtml(teamName(fixture.away_team_id))}</span>
      </div>
    `;
  }).join('');
}

async function render() {
  const gameweek = selectedGameweek();
  if (!gameweek) {
    title.textContent = 'No predictions found';
    subtitle.textContent = 'No gameweeks are available for this league.';
    predictionList.innerHTML = '';
    return;
  }

  const selectedName = memberName(state.selectedUserId);
  title.textContent = `${selectedName}'s Predictions`;
  subtitle.textContent = `Gameweek ${gameweek.gameweek_number}`;
  currentGameweek.textContent = `GW${gameweek.gameweek_number}`;
  previousButton.disabled = state.selectedGameweekIndex <= 0;
  nextButton.disabled = state.selectedGameweekIndex >= state.gameweeks.length - 1;
  renderPlayers();

  try {
    await renderPredictionRows(gameweek);
  } catch (error) {
    predictionList.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load predictions.')}</p>`;
  }
}

async function loadData(activeGameweek) {
  const [teamsResponse, deadlinesResponse, fixturesResponse, membersResponse] = await Promise.all([
    supabase.from('teams').select('id, name').order('name', { ascending: true }),
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at, star_man_locks_at')
      .eq('season_id', state.league.season_id)
      .order('gameweek_number', { ascending: true }),
    supabase
      .from('fixtures')
      .select('id, season_id, gameweek_id, home_team_id, away_team_id, kickoff_at, prediction_locks_at, status, sort_order')
      .eq('season_id', state.league.season_id)
      .order('kickoff_at', { ascending: true }),
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(display_name, profile_image_url)')
      .eq('competition_id', state.league.id)
      .order('joined_at', { ascending: true }),
  ]);

  for (const response of [teamsResponse, deadlinesResponse, fixturesResponse, membersResponse]) {
    if (response.error) {
      throw response.error;
    }
  }

  state.teams = new Map((teamsResponse.data || []).map((team) => [team.id, team.name]));
  state.gameweeks = (deadlinesResponse.data || [])
    .filter((gameweek) => Number(gameweek.gameweek_id) >= Number(state.league.starts_gameweek_id));
  state.fixturesByGameweek = new Map();
  (fixturesResponse.data || []).forEach((fixture) => {
    const key = String(fixture.gameweek_id);
    const group = state.fixturesByGameweek.get(key) || [];
    group.push(fixture);
    state.fixturesByGameweek.set(key, group);
  });
  state.members = (membersResponse.data || []).map((member) => {
    const profile = normaliseNested(member.profiles);
    return {
      user_id: member.user_id,
      display_name: profile?.display_name || 'Player',
      profile_image_url: profile?.profile_image_url || null,
    };
  });

  state.selectedUserId = state.user.id;
  state.selectedGameweekIndex = mostRecentPublicIndex(activeGameweek);
}

previousButton.addEventListener('click', () => {
  state.selectedGameweekIndex = Math.max(0, state.selectedGameweekIndex - 1);
  render();
});

nextButton.addEventListener('click', () => {
  state.selectedGameweekIndex = Math.min(state.gameweeks.length - 1, state.selectedGameweekIndex + 1);
  render();
});

const context = await loadLeagueContext();
if (context.error) {
  title.textContent = 'Predictions unavailable';
  subtitle.textContent = context.error;
  predictionList.innerHTML = '';
} else {
  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);

  try {
    const { activeGameweek } = await loadActiveGameweek(state.league);
    await loadData(activeGameweek);
    await render();
  } catch (error) {
    title.textContent = 'Predictions unavailable';
    subtitle.textContent = error.message || 'Could not load predictions.';
    predictionList.innerHTML = '';
  }
}
