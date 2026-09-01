import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { finishPageLoader, setPageLoaderProgress } from './page-loader.js?v=20260831-football-v1';
import {
  gameCardLiveOrderedStandings,
  gameCardMainLeaguePositions,
  gameCardSuperMedalAwardCounts,
  gameCardSuperMedalAwardSummary,
} from './game-card-awards.js?v=20260901-v3';

const leagueLink = document.querySelector('[data-league-link]');
const content = document.querySelector('[data-game-card-content]');
const message = document.querySelector('[data-game-card-message]');
const cardModal = document.querySelector('[data-card-modal]');
const cardModalBody = document.querySelector('[data-card-modal-body]');
const closeCardButton = document.querySelector('[data-close-card]');

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  rounds: [],
  gameweeks: [],
  predictions: new Map(),
  visiblePredictions: new Map(),
  results: new Map(),
  members: new Map(),
  mainLeaguePositions: new Map(),
  roundStandings: new Map(),
  weekScores: new Map(),
  underdogFixtures: [],
  underdogTeams: new Map(),
  underdogPositions: new Map(),
  underdogPositionGameweek: null,
  underdogDataError: '',
  underdogMatchesOpenRoundIds: new Set(),
  historyOpen: false,
  selectedHistoryRoundId: null,
  activeLeaderboardRoundIds: new Set(),
};

let countdownTimer = null;
let refreshPromise = null;
let bootComplete = false;
const refreshedDeadlineKeys = new Set();

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.dataset.type = type;
}

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function countdownText(targetTime) {
  if (!targetTime) {
    return 'No deadline set';
  }

  const remainingMs = new Date(targetTime).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Locked';
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m Remaining`;
}

function cardInstruction(cardName) {
  const instructions = {
    'Game of Goals': 'Predict the total goals scored across the gameweek.',
    'Game of Corners': 'Predict the total corners taken across the gameweek.',
    'Game of The Underdog': 'Predict how many teams beat a team above them in the league.',
    'Game of The Goalhanger': 'Predict how many players score 2 or more goals.',
    'Game of War': 'Predict the total yellow cards across the gameweek.',
    'Game of The Early Worm': 'Predict the minute of the earliest goal.',
    'Game of Time': "Predict the total 90'+ minute goals across the gameweek.",
  };

  return instructions[cardName] || 'Submit the numeric prediction for this Game Card.';
}

function historyCardInstruction(cardName) {
  const instructions = {
    'Game of Goals': 'Predict the Total Goals in each Gameweek',
    'Game of Corners': 'Predict the Total Corners in each Gameweek',
    'Game of The Underdog': 'Predict higher-placed teams beaten each Gameweek',
    'Game of The Goalhanger': 'Predict players scoring 2+ Goals each Gameweek',
    'Game of War': 'Predict the Total Yellow Cards in each Gameweek',
    'Game of The Early Worm': 'Predict the earliest Goal minute each Gameweek',
    'Game of Time': "Predict the Total 90+ minute Goals each Gameweek",
  };

  return instructions[cardName] || 'Predict the result for each Gameweek';
}

const GAME_CARD_LIMITS = {
  'Game of Goals': { min: 0, max: 150 },
  'Game of Corners': { min: 0, max: 300 },
  'Game of The Underdog': { min: 0, max: 10 },
  'Game of The Goalhanger': { min: 0, max: 99 },
  'Game of War': { min: 0, max: 99 },
  'Game of The Early Worm': { min: 1, max: 90 },
  'Game of Time': { min: 0, max: 99 },
};

function cardLimits(definition) {
  const name = normaliseNested(definition)?.name || definition?.name || '';
  return GAME_CARD_LIMITS[name] || { min: 0, max: 999 };
}

function cleanGameCardInput(input, limits) {
  const digits = String(input.value || '').replace(/\D/g, '');
  if (!digits) {
    input.value = '';
    return;
  }

  const value = Math.min(Number(digits), limits.max);
  input.value = String(value);
}

function hasEncodingArtifacts(value) {
  return /[\u00f0\u0178\u00e2\ufffd]/.test(String(value || ''));
}

function cardDescription(definition) {
  const cardName = definition?.name || 'Game Card';
  const description = definition?.description || '';
  return description && !hasEncodingArtifacts(description)
    ? description
    : cardInstruction(cardName);
}

function openCardModal(definition) {
  if (!cardModal || !cardModalBody) {
    return;
  }

  const cardName = definition?.name || 'Game Card';
  cardModalBody.innerHTML = `
    <h2>${escapeHtml(cardName)}</h2>
    <p>${escapeHtml(cardDescription(definition))}</p>
    <p>${escapeHtml(cardInstruction(cardName))}</p>
  `;
  cardModal.classList.add('show');
  cardModal.setAttribute('aria-hidden', 'false');
}

function closeCardModal() {
  cardModal?.classList.remove('show');
  cardModal?.setAttribute('aria-hidden', 'true');
}

function predictionKey(roundId, gameweekId) {
  return `${roundId}:${gameweekId}`;
}

function visiblePredictionKey(roundId, gameweekId, userId) {
  return `${roundId}:${gameweekId}:${userId}`;
}

function resultKey(cardId, gameweekId) {
  return `${cardId}:${gameweekId}`;
}

function gameweekNumberById(id) {
  return state.gameweeks.find((gameweek) => String(gameweek.gameweek_id) === String(id))?.gameweek_number;
}

function roundNumbers(round) {
  return {
    startNumber: Number(gameweekNumberById(round.start_gameweek_id)),
    endNumber: Number(gameweekNumberById(round.end_gameweek_id)),
  };
}

function roundStatus(round) {
  const activeNumber = Number(state.activeGameweek?.gameweek_number || 0);
  const { startNumber, endNumber } = roundNumbers(round);

  if (activeNumber >= startNumber && activeNumber <= endNumber) {
    return 'active';
  }

  if (activeNumber > endNumber) {
    return 'history';
  }

  return 'upcoming';
}

function visibleRoundsForPage() {
  return [...state.rounds]
    .filter((round) => ['active', 'history'].includes(roundStatus(round)))
    .sort((a, b) => {
      const statusA = roundStatus(a) === 'active' ? 0 : 1;
      const statusB = roundStatus(b) === 'active' ? 0 : 1;
      const numberA = roundNumbers(a).startNumber;
      const numberB = roundNumbers(b).startNumber;
      return statusA - statusB || numberA - numberB;
    });
}

function roundGameweeks(round) {
  if (!round) {
    return [];
  }

  const { startNumber, endNumber } = roundNumbers(round);
  return state.gameweeks.filter((gameweek) => (
    Number(gameweek.gameweek_number) >= startNumber
    && Number(gameweek.gameweek_number) <= endNumber
  ));
}

function profileForUser(userId) {
  const profile = state.members.get(String(userId));
  return profile || { display_name: 'Player', profile_image_url: '' };
}

function avatarMarkup(profile) {
  const imageUrl = profile?.profile_image_url || '';
  const displayName = profile?.display_name || 'Player';
  if (imageUrl) {
    return `<span class="history-avatar"><img src="${escapeHtml(imageUrl)}" alt=""></span>`;
  }
  return `<span class="history-avatar">${escapeHtml(displayName.trim().charAt(0).toUpperCase() || 'P')}</span>`;
}

function ordinalRank(value) {
  const numberValue = Number(value || 0);
  if (!numberValue) {
    return '-';
  }
  const suffix = numberValue % 10 === 1 && numberValue % 100 !== 11
    ? 'st'
    : numberValue % 10 === 2 && numberValue % 100 !== 12
      ? 'nd'
      : numberValue % 10 === 3 && numberValue % 100 !== 13
        ? 'rd'
        : 'th';
  return `${numberValue}${suffix}`;
}

function isCurrentGameweek(gameweek) {
  return Number(gameweek.gameweek_number) === Number(state.activeGameweek?.gameweek_number);
}

function gameweekTiming(gameweek) {
  const currentNumber = Number(state.activeGameweek?.gameweek_number || 0);
  const rowNumber = Number(gameweek.gameweek_number || 0);
  if (rowNumber < currentNumber) {
    return 'past';
  }
  if (rowNumber > currentNumber) {
    return 'future';
  }
  return 'current';
}

function rowDeadlineText(gameweek, isActiveRound) {
  if (!isActiveRound) {
    return 'History';
  }

  const timing = gameweekTiming(gameweek);
  if (timing === 'past') {
    return 'Locked';
  }
  if (timing === 'future') {
    return 'Not Yet';
  }

  return isPast(gameweek.star_man_locks_at)
    ? 'Locked'
    : countdownText(gameweek.star_man_locks_at);
}

function formatActualValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numberValue = Number(value);
  if (!Number.isNaN(numberValue)) {
    return Number.isInteger(numberValue) ? String(numberValue) : String(numberValue);
  }

  return String(value);
}

async function loadGameweeks() {
  const { data, error } = await supabase
    .from('gameweek_deadlines')
    .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at, star_man_locks_at')
    .eq('season_id', state.league.season_id)
    .order('gameweek_number', { ascending: true });

  if (error) {
    throw error;
  }

  state.gameweeks = data || [];
}

async function loadRounds() {
  const { error: ensureError } = await supabase.rpc('ensure_game_card_rounds', {
    target_competition_id: state.league.id,
  });

  if (ensureError) {
    throw ensureError;
  }

  const { data: rounds, error } = await supabase
    .from('game_card_rounds')
    .select('id, card_id, round_number, start_gameweek_id, end_gameweek_id, status, card_definitions(name, description)')
    .eq('competition_id', state.league.id)
    .order('round_number', { ascending: true });

  if (error) {
    throw error;
  }

  state.rounds = rounds || [];
}

async function loadPredictionsAndResults() {
  const visibleRounds = visibleRoundsForPage();
  if (!visibleRounds.length) {
    state.predictions = new Map();
    state.visiblePredictions = new Map();
    state.results = new Map();
    return;
  }

  const roundIds = visibleRounds.map((round) => round.id);
  const gameweekIds = [...new Set(visibleRounds.flatMap((round) => roundGameweeks(round).map((gameweek) => gameweek.gameweek_id)))];
  const cardIds = [...new Set(visibleRounds.map((round) => round.card_id))];

  const { data: predictions, error: predictionError } = await supabase
    .from('game_card_predictions')
    .select('id, round_id, gameweek_id, user_id, predicted_value, updated_at')
    .in('round_id', roundIds)
    .in('gameweek_id', gameweekIds);

  if (predictionError) {
    throw predictionError;
  }

  const visiblePredictions = predictions || [];
  state.visiblePredictions = new Map(visiblePredictions.map((prediction) => [
    visiblePredictionKey(prediction.round_id, prediction.gameweek_id, prediction.user_id),
    prediction,
  ]));
  state.predictions = new Map(visiblePredictions
    .filter((prediction) => String(prediction.user_id) === String(state.user.id))
    .map((prediction) => [
      predictionKey(prediction.round_id, prediction.gameweek_id),
      prediction,
    ]));

  let results = [];
  const { data: globalResults, error: globalResultError } = await supabase
    .from('game_card_actual_results')
    .select('season_id, gameweek_id, card_id, actual_value, updated_at')
    .eq('season_id', state.league.season_id)
    .in('gameweek_id', gameweekIds)
    .in('card_id', cardIds);

  if (!globalResultError) {
    results = globalResults || [];
  } else {
    const { data: roundResults, error: resultError } = await supabase
      .from('game_card_results')
      .select('round_id, gameweek_id, actual_value, updated_at')
      .in('round_id', roundIds)
      .in('gameweek_id', gameweekIds);

    if (resultError) {
      throw resultError;
    }

    const roundById = new Map(visibleRounds.map((round) => [round.id, round]));
    results = (roundResults || [])
      .map((result) => ({
        ...result,
        card_id: roundById.get(result.round_id)?.card_id,
      }))
      .filter((result) => result.card_id);
  }

  state.results = new Map((results || []).map((result) => [
    resultKey(result.card_id, result.gameweek_id),
    result,
  ]));
}

async function loadHistoryData() {
  const leaderboardRounds = visibleRoundsForPage();
  state.members = new Map();
  state.mainLeaguePositions = new Map();
  state.roundStandings = new Map();
  state.weekScores = new Map();

  const { data: members, error: memberError } = await supabase
    .from('competition_members')
    .select('user_id')
    .eq('competition_id', state.league.id);

  if (memberError) {
    throw memberError;
  }

  const memberIds = [...new Set((members || []).map((member) => member.user_id).filter(Boolean))];
  if (memberIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, profile_image_url')
      .in('id', memberIds);

    (profiles || []).forEach((profile) => {
      state.members.set(String(profile.id), profile);
    });

    memberIds.forEach((userId) => {
      if (!state.members.has(String(userId))) {
        state.members.set(String(userId), { id: userId, display_name: 'Player', profile_image_url: '' });
      }
    });
  }

  if (!leaderboardRounds.length) {
    return;
  }

  const roundIds = leaderboardRounds.map((round) => round.id);

  const { error: tiebreakError } = await supabase.rpc('ensure_game_card_tiebreaks', {
    target_competition_id: state.league.id,
  });
  if (tiebreakError) {
    console.warn('Could not refresh Game Card tiebreak snapshots:', tiebreakError.message || tiebreakError);
  }

  const [
    { data: standings, error: standingsError },
    { data: scores, error: scoresError },
    { data: leagueRows, error: leagueRowsError },
  ] = await Promise.all([
    supabase
      .from('game_card_round_standings')
      .select('round_id, user_id, round_rank, random_tiebreak_rank, weekly_wins, total_difference, completed_gameweeks, earns_super_medal, expected_gameweeks, missed_gameweeks, exact_predictions, rank_points')
      .eq('competition_id', state.league.id)
      .in('round_id', roundIds),
    supabase
      .from('game_card_week_scores')
      .select('round_id, gameweek_id, gameweek_number, user_id, predicted_value, actual_value, difference, is_weekly_winner, weekly_rank')
      .eq('competition_id', state.league.id)
      .in('round_id', roundIds),
    supabase
      .from('leaderboard')
      .select('user_id, ultimate_champion_points, prediction_points, correct_scores, correct_results, star_man_points, star_man_goals, star_man_assists, star_man_yellows, star_man_reds')
      .eq('competition_id', state.league.id),
  ]);

  if (standingsError) {
    throw standingsError;
  }
  if (scoresError) {
    throw scoresError;
  }
  if (leagueRowsError) {
    console.warn('Could not load live main-league positions:', leagueRowsError.message || leagueRowsError);
  } else {
    state.mainLeaguePositions = new Map(Object.entries(gameCardMainLeaguePositions(leagueRows || [])));
  }

  (standings || []).forEach((row) => {
    const key = String(row.round_id);
    const rows = state.roundStandings.get(key) || [];
    rows.push(row);
    state.roundStandings.set(key, rows);
  });

  (scores || []).forEach((row) => {
    const key = String(row.round_id);
    const rows = state.weekScores.get(key) || [];
    rows.push(row);
    state.weekScores.set(key, rows);
  });
}

function renderNoRounds() {
  content.innerHTML = `
    <div class="card-copy">
      <h2>No Active Game Card</h2>
      <p>No Game Card is active for the current gameweek in this league, and there is no Game Card history yet.</p>
    </div>
  `;
}

function renderRows(round) {
  const limits = cardLimits(round.card_definitions);
  const isActiveRound = roundStatus(round) === 'active';
  const rows = roundGameweeks(round).map((gameweek) => {
    const prediction = state.predictions.get(predictionKey(round.id, gameweek.gameweek_id));
    const result = state.results.get(resultKey(round.card_id, gameweek.gameweek_id));
    const current = isCurrentGameweek(gameweek);
    const timing = gameweekTiming(gameweek);
    const editable = isActiveRound && current && !isPast(gameweek.star_man_locks_at);
    const inputValue = prediction?.predicted_value ?? '';
    const hasPrediction = inputValue !== '';
    const resultText = result ? `Result: ${formatActualValue(result.actual_value)}` : 'Results Pending';
    const deadlineClass = editable ? '' : timing === 'future' && isActiveRound ? 'upcoming' : 'locked';

    return `
      <article class="gameweek-row ${current && isActiveRound ? 'current-gameweek' : ''}" data-round-id="${round.id}" data-gameweek-id="${gameweek.gameweek_id}" data-current-gameweek="${current && isActiveRound ? 'true' : 'false'}">
        <strong class="gameweek-badge">GW${escapeHtml(gameweek.gameweek_number)}</strong>
        <span class="deadline ${deadlineClass}" data-deadline="${escapeHtml(isActiveRound && current ? gameweek.star_man_locks_at || '' : '')}">
          ${escapeHtml(rowDeadlineText(gameweek, isActiveRound))}
        </span>
        <span class="result-value ${result ? '' : 'pending'}">${escapeHtml(resultText)}</span>
        ${isActiveRound ? `
          <input class="prediction-input" data-prediction-input type="text" inputmode="numeric" pattern="[0-9]*" min="${limits.min}" max="${limits.max}" step="1" value="${escapeHtml(inputValue)}" ${editable ? '' : 'disabled'} aria-label="Game Card prediction for Gameweek ${gameweek.gameweek_number}">
        ` : `
          <span class="prediction-value">${inputValue !== '' ? escapeHtml(inputValue) : 'No pick'}</span>
        `}
        <span class="save-light ${hasPrediction ? 'saved' : ''}" aria-label="${hasPrediction ? 'Prediction saved' : 'No prediction saved'}" title="${hasPrediction ? 'Prediction saved' : 'No prediction saved'}"></span>
        ${isActiveRound ? `<button type="button" data-save-game-card ${editable ? '' : 'disabled'}>Save</button>` : '<span></span>'}
      </article>
    `;
  }).join('');

  return `<div class="gameweek-list">${rows}</div>`;
}

function renderUnderdogMatches(round) {
  if (roundStatus(round) !== 'active' || !isUnderdogRound(round)) {
    return '';
  }

  const roundId = String(round.id);
  const open = state.underdogMatchesOpenRoundIds.has(roundId);
  const activeNumber = Number(state.activeGameweek?.gameweek_number || 0);
  const positionNote = state.underdogPositionGameweek
    ? `League positions after GW${state.underdogPositionGameweek}, entering GW${activeNumber}.`
    : `Opening league positions for GW${activeNumber}.`;

  let panel = '';
  if (open) {
    if (state.underdogDataError) {
      panel = `<div class="underdog-match-panel"><p class="state-text">${escapeHtml(state.underdogDataError)}</p></div>`;
    } else {
      panel = `
        <div class="underdog-match-panel">
          <div class="underdog-match-heading">
            <h3>GW${escapeHtml(activeNumber)} Matches</h3>
            <p>${escapeHtml(positionNote)}</p>
          </div>
          <div class="underdog-fixture-list">
            ${state.underdogFixtures.map((fixture) => {
              const homePosition = state.underdogPositions.get(String(fixture.home_team_id));
              const awayPosition = state.underdogPositions.get(String(fixture.away_team_id));
              const kickoff = formatFixtureKickoff(fixture.kickoff_at);
              return `
                <article class="underdog-fixture-row">
                  <span class="underdog-position">${escapeHtml(ordinalRank(homePosition))}</span>
                  <strong class="underdog-team underdog-home-team">${escapeHtml(underdogTeamName(fixture.home_team_id))}</strong>
                  <span class="underdog-versus" aria-label="versus">–</span>
                  <strong class="underdog-team underdog-away-team">${escapeHtml(underdogTeamName(fixture.away_team_id))}</strong>
                  <span class="underdog-position">${escapeHtml(ordinalRank(awayPosition))}</span>
                  ${kickoff ? `<time datetime="${escapeHtml(fixture.kickoff_at)}">${escapeHtml(kickoff)}</time>` : ''}
                </article>
              `;
            }).join('') || '<p class="state-text">No playable fixtures were found for this Gameweek.</p>'}
          </div>
        </div>
      `;
    }
  }

  return `
    <section class="underdog-match-browser">
      <button class="underdog-matches-toggle" type="button" data-toggle-underdog-matches="${escapeHtml(round.id)}" aria-expanded="${open ? 'true' : 'false'}">
        ${open ? 'Hide Matches' : 'View Matches'}
      </button>
      ${panel}
    </section>
  `;
}

function renderRound(round) {
  const definition = normaliseNested(round.card_definitions);
  const cardName = definition?.name || 'Game Card';
  const { startNumber, endNumber } = roundNumbers(round);
  const status = roundStatus(round);
  const label = status === 'active' ? 'Active Game Card' : 'Game Card History';

  return `
    <section class="round-panel ${status}">
      <span class="round-label">${label}</span>
      <div class="active-card-layout">
        <button class="game-card-visual" type="button" data-game-card-preview="${escapeHtml(round.id)}">${escapeHtml(cardName)}</button>
        <div class="card-copy">
          <h2>${escapeHtml(cardName)}</h2>
          <p>${escapeHtml(cardDescription(definition))}</p>
          <span class="range-pill">Active Gameweeks ${startNumber} to ${endNumber}</span>
          <p>${escapeHtml(cardInstruction(cardName))}</p>
        </div>
      </div>
      ${renderUnderdogMatches(round)}
      ${renderRows(round)}
      ${status === 'active' ? renderActiveLeaderboard(round) : ''}
    </section>
  `;
}

function isUnderdogRound(round) {
  const definition = normaliseNested(round?.card_definitions);
  return round?.card_id === 'game_underdog' || definition?.name === 'Game of The Underdog';
}

function underdogTeamName(teamId) {
  return shortTeamName(state.underdogTeams.get(String(teamId))?.name || 'Team');
}

function formatFixtureKickoff(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

async function loadUnderdogMatchData() {
  state.underdogFixtures = [];
  state.underdogTeams = new Map();
  state.underdogPositions = new Map();
  state.underdogPositionGameweek = null;
  state.underdogDataError = '';

  const activeUnderdogRound = state.rounds.find((round) => roundStatus(round) === 'active' && isUnderdogRound(round));
  if (!activeUnderdogRound || !state.activeGameweek) {
    return;
  }

  const activeNumber = Number(state.activeGameweek.gameweek_number);
  const previousGameweek = [...state.gameweeks]
    .filter((gameweek) => Number(gameweek.gameweek_number) < activeNumber)
    .sort((a, b) => Number(b.gameweek_number) - Number(a.gameweek_number))[0] || null;
  const positionGameweek = previousGameweek || state.activeGameweek;

  const [fixtureResponse, teamResponse, standingResponse] = await Promise.all([
    supabase
      .from('fixtures')
      .select('id, gameweek_id, home_team_id, away_team_id, kickoff_at, status, sort_order')
      .eq('season_id', state.league.season_id)
      .eq('gameweek_id', state.activeGameweek.gameweek_id)
      .order('kickoff_at', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('team_gameweek_computed_standings')
      .select('team_id, team_name, league_position')
      .eq('season_id', state.league.season_id)
      .eq('gameweek_id', positionGameweek.gameweek_id)
      .order('league_position', { ascending: true }),
  ]);

  const firstError = fixtureResponse.error || teamResponse.error || standingResponse.error;
  if (firstError) {
    state.underdogDataError = firstError.message || 'Could not load the Gameweek matches.';
    return;
  }

  state.underdogFixtures = (fixtureResponse.data || [])
    .filter((fixture) => String(fixture.status || '').toLowerCase() !== 'postponed');
  state.underdogTeams = new Map((teamResponse.data || []).map((team) => [String(team.id), team]));

  const fixtureTeamIds = new Set(state.underdogFixtures
    .flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id])
    .filter(Boolean)
    .map(String));
  const standings = (standingResponse.data || [])
    .filter((standing) => fixtureTeamIds.has(String(standing.team_id)))
    .sort((a, b) => (
      Number(a.league_position) - Number(b.league_position)
      || String(a.team_name || '').localeCompare(String(b.team_name || ''))
    ));

  state.underdogPositions = new Map(standings.map((standing, index) => [
    String(standing.team_id),
    Number(standing.league_position) || index + 1,
  ]));
  state.underdogPositionGameweek = previousGameweek?.gameweek_number || null;
}

function weeklyRankLookup(round) {
  const scores = state.weekScores.get(String(round.id)) || [];
  const byGameweek = new Map();
  scores.forEach((score) => {
    const key = String(score.gameweek_id);
    const rows = byGameweek.get(key) || [];
    rows.push(score);
    byGameweek.set(key, rows);
  });

  const ranks = new Map();
  byGameweek.forEach((rows, gameweekId) => {
    if (rows.every((row) => row.weekly_rank !== null && row.weekly_rank !== undefined)) {
      rows.forEach((row) => {
        ranks.set(`${gameweekId}:${row.user_id}`, Number(row.weekly_rank));
      });
      return;
    }

    const sorted = rows.sort((a, b) => (
      Number(a.difference ?? 999999) - Number(b.difference ?? 999999)
      || Number(a.predicted_value ?? 999999) - Number(b.predicted_value ?? 999999)
      || String(a.user_id).localeCompare(String(b.user_id))
    ));
    let previousDifference = null;
    let currentRank = 0;
    sorted.forEach((row, index) => {
      const difference = Number(row.difference ?? 999999);
      if (previousDifference === null || difference !== previousDifference) {
        currentRank = index + 1;
        previousDifference = difference;
      }
      ranks.set(`${gameweekId}:${row.user_id}`, currentRank);
    });
  });
  return ranks;
}

function scoreLookupForRound(round) {
  const scores = state.weekScores.get(String(round.id)) || [];
  return new Map(scores.map((score) => [`${score.gameweek_id}:${score.user_id}`, score]));
}

function actualValueForGameweek(round, gameweek) {
  const result = state.results.get(resultKey(round.card_id, gameweek.gameweek_id));
  if (result && result.actual_value !== null && result.actual_value !== undefined && result.actual_value !== '') {
    return result.actual_value;
  }

  const scores = state.weekScores.get(String(round.id)) || [];
  const score = scores.find((item) => String(item.gameweek_id) === String(gameweek.gameweek_id)
    && item.actual_value !== null
    && item.actual_value !== undefined
    && item.actual_value !== '');
  return score?.actual_value ?? null;
}

function activeStandingLookup(round) {
  return new Map((state.roundStandings.get(String(round.id)) || []).map((row) => [String(row.user_id), row]));
}

function compareDisplayNames(a, b) {
  return String(a || 'Player').localeCompare(
    String(b || 'Player'),
    'en-GB',
    { sensitivity: 'base' },
  );
}

function awardMemberCount() {
  const lockedCount = Number(state.league?.locked_member_count);
  return Number.isInteger(lockedCount) && lockedCount >= 2
    ? lockedCount
    : Math.max(2, state.members.size);
}

function superMedalAwardMarkup(count) {
  if (!count) return '';
  const label = `${count} Super Medal${count === 1 ? '' : 's'}`;
  return `<span class="super-medal-award" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">SM</span><b>&times;${count}</b></span>`;
}

function awardRowClass(roundRank, count) {
  if (!count) return '';
  return Number(roundRank) === 1 ? 'super-medal-place award-first' : 'super-medal-place award-second';
}

function awardSummaryMarkup() {
  return `<p class="game-card-award-summary"><span aria-hidden="true">&#127941;</span>${escapeHtml(gameCardSuperMedalAwardSummary(awardMemberCount()))}</p>`;
}

function rankingRulesMarkup() {
  return `
    <div class="game-card-ranking-rules" aria-label="Game Card leaderboard ranking rules">
      <strong>Ranking order</strong>
      <span>Fewest missed picks</span>
      <span>Most exact picks</span>
      <span>Lowest total distance</span>
      <span>Most weekly wins</span>
      <span>Lowest weekly-rank total</span>
      <span>Live/frozen league position</span>
      <span>Stored draw if still level</span>
    </div>`;
}

function activeLeaderboardMembers(round) {
  const liveOrdered = gameCardLiveOrderedStandings(
    awardMemberCount(),
    [...activeStandingLookup(round).values()],
    Object.fromEntries(state.mainLeaguePositions),
  );
  const standings = new Map(liveOrdered.map((standing) => [String(standing.user_id), standing]));
  return [...state.members.entries()]
    .map(([userId, profile]) => ({
      userId,
      profile,
      standing: standings.get(String(userId)) || null,
    }))
    .sort((a, b) => {
      const aRank = Number(a.standing?.round_rank || Number.POSITIVE_INFINITY);
      const bRank = Number(b.standing?.round_rank || Number.POSITIVE_INFINITY);
      return aRank - bRank
        || compareDisplayNames(a.profile?.display_name, b.profile?.display_name);
    });
}

function renderActivePredictionCell(round, gameweek, userId) {
  const ownPrediction = String(userId) === String(state.user.id);
  const locked = isPast(gameweek.star_man_locks_at);
  const prediction = state.visiblePredictions.get(visiblePredictionKey(round.id, gameweek.gameweek_id, userId));

  if (!ownPrediction && !locked) {
    const hiddenLabel = `Hidden until GW${gameweek.gameweek_number} locks`;
    return `<span class="history-week-rank" aria-label="${escapeHtml(hiddenLabel)}" title="${escapeHtml(hiddenLabel)}">&#128274;</span>`;
  }

  const value = prediction?.predicted_value;
  if (value !== null && value !== undefined && value !== '') {
    return `<span class="history-week-rank history-week-value">${escapeHtml(formatActualValue(value))}</span>`;
  }

  if (locked) {
    return '<span class="history-week-rank missing" aria-label="No prediction">X</span>';
  }

  return '<span class="history-week-rank" aria-label="Not entered yet">-</span>';
}

function renderActiveLeaderboardDetail(round) {
  const definition = normaliseNested(round.card_definitions);
  const cardName = definition?.name || 'Game Card';
  const gameweeks = roundGameweeks(round);
  const members = activeLeaderboardMembers(round);
  const awardCounts = gameCardSuperMedalAwardCounts(
    awardMemberCount(),
    members.map(({ standing }) => standing).filter(Boolean),
  );

  return `
    <div class="game-history-detail" style="--history-week-count: ${gameweeks.length};">
      <h3 class="history-detail-title">Current ${escapeHtml(cardName)} Leaderboard</h3>
      <p class="history-detail-description">Your picks show now. Rivals reveal after each GW locks.</p>
      ${awardSummaryMarkup()}
      ${rankingRulesMarkup()}
      <div class="history-result-row history-result-head">
        <span>Player</span>
        <span>Rank</span>
        ${gameweeks.map((gameweek) => `<span class="gameweek-badge history-week-heading">GW${escapeHtml(gameweek.gameweek_number)}</span>`).join('')}
      </div>
      <div class="history-result-row history-actual-row">
        <span class="history-player-cell history-actual-label">
          <span class="history-avatar history-actual-spacer" aria-hidden="true"></span>
          <strong>Actual</strong>
        </span>
        <span class="history-final-rank history-actual-final" aria-hidden="true"></span>
        ${gameweeks.map((gameweek) => {
          const actual = actualValueForGameweek(round, gameweek);
          const display = actual === null || actual === undefined || actual === '' ? '-' : formatActualValue(actual);
          return `<span class="history-week-rank history-week-value">${escapeHtml(display)}</span>`;
        }).join('')}
      </div>
      ${members.map(({ userId, profile, standing }) => {
        const ownRow = String(userId) === String(state.user.id);
        const hasRanking = Number(standing?.expected_gameweeks || 0) > 0;
        const currentRank = hasRanking ? ordinalRank(standing.round_rank) : '-';
        const rank = hasRanking ? Number(standing.round_rank) : 0;
        const awardCount = awardCounts[String(userId)] || 0;
        return `
          <div class="history-result-row ${ownRow ? 'current-user' : ''} ${awardRowClass(rank, awardCount)}">
            <span class="history-player-cell">
              ${avatarMarkup(profile)}
              <strong>${escapeHtml(profile.display_name || 'Player')}${ownRow ? ' (You)' : ''}</strong>
            </span>
            <span class="history-final-rank">${escapeHtml(currentRank)}${superMedalAwardMarkup(awardCount)}</span>
            ${gameweeks.map((gameweek) => renderActivePredictionCell(round, gameweek, userId)).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderActiveLeaderboard(round) {
  const open = state.activeLeaderboardRoundIds.has(String(round.id));
  return `
    <section class="game-history-launch">
      <button class="history-toggle-btn active-leaderboard-toggle" type="button" data-toggle-active-leaderboard="${escapeHtml(round.id)}" aria-expanded="${open ? 'true' : 'false'}">
        ${open ? 'Hide' : 'View'} Current Game Card Leaderboard
      </button>
      ${open ? renderActiveLeaderboardDetail(round) : ''}
    </section>
  `;
}

function renderHistoryRoundCards(rounds) {
  return `
    <div class="game-history-card-grid">
      ${rounds.map((round) => {
        const definition = normaliseNested(round.card_definitions);
        const cardName = definition?.name || 'Game Card';
        const { startNumber, endNumber } = roundNumbers(round);
        const selected = String(state.selectedHistoryRoundId || '') === String(round.id);
        return `
          <button class="game-history-card ${selected ? 'selected' : ''}" type="button" data-history-card-round="${escapeHtml(round.id)}">
            <span class="history-range-badge">GW${escapeHtml(startNumber)}-GW${escapeHtml(endNumber)}</span>
            <span>${escapeHtml(cardName)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderHistoryDetail(round) {
  if (!round) {
    return '';
  }

  const definition = normaliseNested(round.card_definitions);
  const cardName = definition?.name || 'Game Card';
  const standings = [...(state.roundStandings.get(String(round.id)) || [])]
    .sort((a, b) => (
      Number(a.round_rank || 999) - Number(b.round_rank || 999)
      || compareDisplayNames(
        profileForUser(a.user_id)?.display_name,
        profileForUser(b.user_id)?.display_name,
      )
    ));
  const gameweeks = roundGameweeks(round);
  const scoreLookup = scoreLookupForRound(round);
  const awardCounts = gameCardSuperMedalAwardCounts(awardMemberCount(), standings);

  if (!standings.length) {
    return `
      <div class="game-history-detail">
        <h3 class="history-detail-title">${escapeHtml(cardName)}</h3>
        <p class="history-detail-description">${escapeHtml(historyCardInstruction(cardName))}</p>
        <p class="state-text">Results are not available for this Game Card yet.</p>
      </div>
    `;
  }

  return `
    <div class="game-history-detail" style="--history-week-count: ${gameweeks.length};">
      <h3 class="history-detail-title">${escapeHtml(cardName)}</h3>
      <p class="history-detail-description">${escapeHtml(historyCardInstruction(cardName))}</p>
      ${awardSummaryMarkup()}
      ${rankingRulesMarkup()}
      <div class="history-result-row history-result-head">
        <span>Player</span>
        <span>Rank</span>
        ${gameweeks.map((gameweek) => `<span class="gameweek-badge history-week-heading">GW${escapeHtml(gameweek.gameweek_number)}</span>`).join('')}
      </div>
      <div class="history-result-row history-actual-row">
        <span class="history-player-cell history-actual-label">
          <span class="history-avatar history-actual-spacer" aria-hidden="true"></span>
          <strong>Actual</strong>
        </span>
        <span class="history-final-rank history-actual-final" aria-hidden="true"></span>
        ${gameweeks.map((gameweek) => {
          const actual = actualValueForGameweek(round, gameweek);
          const display = actual === null || actual === undefined || actual === '' ? '-' : formatActualValue(actual);
          return `<span class="history-week-rank history-week-value">${escapeHtml(display)}</span>`;
        }).join('')}
      </div>
      ${standings.map((row) => {
        const profile = profileForUser(row.user_id);
        const rank = Number(row.round_rank || 0);
        const awardCount = awardCounts[String(row.user_id)] || 0;
        return `
          <div class="history-result-row ${awardRowClass(rank, awardCount)}">
            <span class="history-player-cell">
              ${avatarMarkup(profile)}
              <strong>${escapeHtml(profile.display_name || 'Player')}</strong>
            </span>
            <span class="history-final-rank ${rank === 1 ? 'winner' : ''}">${escapeHtml(ordinalRank(rank))}${superMedalAwardMarkup(awardCount)}</span>
            ${gameweeks.map((gameweek) => {
              const score = scoreLookup.get(`${gameweek.gameweek_id}:${row.user_id}`);
              const value = score?.predicted_value;
              const missing = value === null || value === undefined || value === '';
              return `<span class="history-week-rank ${missing ? 'missing' : 'history-week-value'}">${missing ? 'X' : escapeHtml(formatActualValue(value))}</span>`;
            }).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
function renderHistoryPanel(rounds) {
  if (!state.historyOpen) {
    return `
      <section class="game-history-launch">
        <button class="history-toggle-btn" type="button" data-open-game-history>View Game Card History</button>
      </section>
    `;
  }

  const selectedRound = rounds.find((round) => String(round.id) === String(state.selectedHistoryRoundId || ''));
  return `
    <section class="game-history-panel">
      <p class="game-history-helper">Click each Game Card to view the results!</p>
      ${renderHistoryRoundCards(rounds)}
      ${renderHistoryDetail(selectedRound)}
      <button class="history-back-btn" type="button" data-close-game-history>Back</button>
    </section>
  `;
}

function renderRounds() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }

  const rounds = visibleRoundsForPage();
  if (!rounds.length) {
    renderNoRounds();
    return;
  }

  const activeRounds = rounds.filter((round) => roundStatus(round) === 'active');
  const historyRounds = rounds.filter((round) => roundStatus(round) === 'history');

  if (!activeRounds.length && !historyRounds.length) {
    renderNoRounds();
    return;
  }

  content.innerHTML = `
    <div class="round-list">
      ${activeRounds.map(renderRound).join('')}
      ${historyRounds.length ? renderHistoryPanel(historyRounds) : ''}
    </div>
  `;

  content.querySelectorAll('[data-save-game-card]').forEach((button) => {
    button.addEventListener('click', () => savePrediction(button.closest('[data-gameweek-id]')));
  });

  content.querySelectorAll('[data-prediction-input]').forEach((input) => {
    const row = input.closest('[data-round-id]');
    const round = state.rounds.find((item) => String(item.id) === String(row?.dataset.roundId));
    const limits = cardLimits(round?.card_definitions);
    input.addEventListener('input', () => cleanGameCardInput(input, limits));
  });

  content.querySelectorAll('[data-game-card-preview]').forEach((button) => {
    button.addEventListener('click', () => {
      const round = state.rounds.find((item) => String(item.id) === String(button.dataset.gameCardPreview));
      openCardModal(normaliseNested(round?.card_definitions));
    });
  });

  content.querySelectorAll('[data-toggle-active-leaderboard]').forEach((button) => {
    button.addEventListener('click', () => {
      const roundId = String(button.dataset.toggleActiveLeaderboard || '');
      if (state.activeLeaderboardRoundIds.has(roundId)) {
        state.activeLeaderboardRoundIds.delete(roundId);
      } else {
        state.activeLeaderboardRoundIds.add(roundId);
      }
      renderRounds();
    });
  });

  content.querySelectorAll('[data-toggle-underdog-matches]').forEach((button) => {
    button.addEventListener('click', () => {
      const roundId = String(button.dataset.toggleUnderdogMatches || '');
      if (state.underdogMatchesOpenRoundIds.has(roundId)) {
        state.underdogMatchesOpenRoundIds.delete(roundId);
      } else {
        state.underdogMatchesOpenRoundIds.add(roundId);
      }
      renderRounds();
    });
  });

  content.querySelector('[data-open-game-history]')?.addEventListener('click', () => {
    state.historyOpen = true;
    state.selectedHistoryRoundId = null;
    renderRounds();
  });

  content.querySelector('[data-close-game-history]')?.addEventListener('click', () => {
    state.historyOpen = false;
    state.selectedHistoryRoundId = null;
    renderRounds();
  });

  content.querySelectorAll('[data-history-card-round]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedHistoryRoundId = button.dataset.historyCardRound;
      renderRounds();
    });
  });

  updateCountdowns();
  countdownTimer = window.setInterval(updateCountdowns, 30000);
}

function refreshVisibleGameCardData() {
  if (!bootComplete || !state.league) {
    return Promise.resolve();
  }

  if (!refreshPromise) {
    refreshPromise = Promise.all([
      loadPredictionsAndResults(),
      loadHistoryData(),
      loadUnderdogMatchData(),
    ])
      .then(() => renderRounds())
      .catch((error) => {
        setMessage(error.message || 'Could not refresh Game Card predictions.', 'error');
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function updateCountdowns() {
  content.querySelectorAll('[data-deadline]').forEach((element) => {
    if (!element.dataset.deadline) {
      return;
    }

    const locked = isPast(element.dataset.deadline);
    const wasLocked = element.dataset.wasLocked === 'true';
    element.textContent = locked ? 'Locked' : countdownText(element.dataset.deadline);
    element.classList.toggle('locked', locked);
    element.dataset.wasLocked = locked ? 'true' : 'false';

    const row = element.closest('[data-gameweek-id]');
    const editable = row?.dataset.currentGameweek === 'true' && !locked;
    row?.querySelector('[data-prediction-input]')?.toggleAttribute('disabled', !editable);
    row?.querySelector('[data-save-game-card]')?.toggleAttribute('disabled', !editable);

    if (locked && !wasLocked) {
      const refreshKey = `${row?.dataset.roundId || ''}:${row?.dataset.gameweekId || ''}:${element.dataset.deadline}`;
      if (!refreshedDeadlineKeys.has(refreshKey)) {
        refreshedDeadlineKeys.add(refreshKey);
        void refreshVisibleGameCardData();
      }
    }
  });
}

async function savePrediction(row) {
  const roundId = row?.dataset.roundId;
  const gameweekId = row?.dataset.gameweekId;
  const input = row?.querySelector('[data-prediction-input]');
  const rawValue = input?.value.trim() || '';

  if (!roundId || !gameweekId || !input) {
    setMessage('Could not find this Game Card prediction row.', 'error');
    return;
  }

  const round = state.rounds.find((item) => item.id === roundId);
  if (!round || roundStatus(round) !== 'active') {
    setMessage('Only the active Game Card can be edited.', 'error');
    return;
  }

  if (rawValue === '') {
    await clearPrediction(row, roundId, gameweekId);
    return;
  }

  const roundDefinition = normaliseNested(round.card_definitions);
  const limits = cardLimits(roundDefinition);
  if (!/^\d+$/.test(rawValue)) {
    setMessage('Enter a whole number.', 'error');
    return;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
    setMessage(`Enter a whole number between ${limits.min} and ${limits.max}.`, 'error');
    return;
  }

  setMessage('Saving Game Card prediction...', 'info');

  const { error } = await supabase.from('game_card_predictions').upsert({
    round_id: roundId,
    gameweek_id: gameweekId,
    user_id: state.user.id,
    predicted_value: value,
    submitted_at: new Date().toISOString(),
  }, {
    onConflict: 'round_id,gameweek_id,user_id',
  });

  if (error) {
    setMessage(error.message || 'Could not save Game Card prediction.', 'error');
    return;
  }

  const savedPrediction = {
    round_id: roundId,
    gameweek_id: gameweekId,
    user_id: state.user.id,
    predicted_value: value,
  };
  state.predictions.set(predictionKey(roundId, gameweekId), savedPrediction);
  state.visiblePredictions.set(visiblePredictionKey(roundId, gameweekId, state.user.id), savedPrediction);
  row.querySelector('.save-light')?.classList.add('saved');
  row.querySelector('.save-light')?.setAttribute('aria-label', 'Prediction saved');
  row.querySelector('.save-light')?.setAttribute('title', 'Prediction saved');
  renderRounds();
  setMessage('Game Card prediction saved.', 'success');
}

async function clearPrediction(row, roundId, gameweekId) {
  setMessage('Clearing Game Card prediction...', 'info');

  const { error } = await supabase
    .from('game_card_predictions')
    .delete()
    .eq('round_id', roundId)
    .eq('gameweek_id', gameweekId)
    .eq('user_id', state.user.id);

  if (error) {
    setMessage(error.message || 'Could not clear Game Card prediction.', 'error');
    return;
  }

  state.predictions.delete(predictionKey(roundId, gameweekId));
  state.visiblePredictions.delete(visiblePredictionKey(roundId, gameweekId, state.user.id));
  const light = row.querySelector('.save-light');
  light?.classList.remove('saved');
  light?.setAttribute('aria-label', 'No prediction saved');
  light?.setAttribute('title', 'No prediction saved');
  renderRounds();
  setMessage('Game Card prediction cleared.', 'success');
}

async function boot() {
  const context = await loadLeagueContext();
  setPageLoaderProgress(30);
  if (context.error) {
    content.innerHTML = `<p class="state-text">${escapeHtml(context.error)}</p>`;
    return;
  }

  state.user = context.user;
  state.league = context.league;
  leagueLink.href = leagueUrl('league.html', state.league.id);

  try {
    const [{ activeGameweek }] = await Promise.all([
      loadActiveGameweek(state.league),
      loadGameweeks(),
    ]);

    state.activeGameweek = activeGameweek;
    setPageLoaderProgress(52);

    if (!state.activeGameweek) {
      renderNoRounds();
      return;
    }

    await loadRounds();
    setPageLoaderProgress(70);
    await Promise.all([
      loadPredictionsAndResults(),
      loadHistoryData(),
      loadUnderdogMatchData(),
    ]);
    bootComplete = true;
    renderRounds();
    setPageLoaderProgress(94);
  } catch (error) {
    bootComplete = false;
    content.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load Game Card page.')}</p>`;
  }
}

boot().finally(finishPageLoader);

closeCardButton?.addEventListener('click', closeCardModal);
cardModal?.addEventListener('click', (event) => {
  if (event.target === cardModal) {
    closeCardModal();
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    void refreshVisibleGameCardData();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshVisibleGameCardData();
  }
});
