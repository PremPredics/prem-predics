import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';

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
  results: new Map(),
  members: new Map(),
  roundStandings: new Map(),
  weekScores: new Map(),
  historyOpen: false,
  selectedHistoryRoundId: null,
};

let countdownTimer = null;

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
    return;
  }

  const roundIds = visibleRounds.map((round) => round.id);
  const gameweekIds = [...new Set(visibleRounds.flatMap((round) => roundGameweeks(round).map((gameweek) => gameweek.gameweek_id)))];
  const cardIds = [...new Set(visibleRounds.map((round) => round.card_id))];

  const { data: predictions, error: predictionError } = await supabase
    .from('game_card_predictions')
    .select('id, round_id, gameweek_id, user_id, predicted_value, updated_at')
    .eq('user_id', state.user.id)
    .in('round_id', roundIds)
    .in('gameweek_id', gameweekIds);

  if (predictionError) {
    throw predictionError;
  }

  state.predictions = new Map((predictions || []).map((prediction) => [
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
  const historyRounds = visibleRoundsForPage().filter((round) => roundStatus(round) === 'history');
  state.members = new Map();
  state.roundStandings = new Map();
  state.weekScores = new Map();

  if (!historyRounds.length) {
    return;
  }

  const roundIds = historyRounds.map((round) => round.id);

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

  const [{ data: standings, error: standingsError }, { data: scores, error: scoresError }] = await Promise.all([
    supabase
      .from('game_card_round_standings')
      .select('round_id, user_id, round_rank, weekly_wins, total_difference, completed_gameweeks, earns_super_medal')
      .eq('competition_id', state.league.id)
      .in('round_id', roundIds),
    supabase
      .from('game_card_week_scores')
      .select('round_id, gameweek_id, gameweek_number, user_id, predicted_value, actual_value, difference, is_weekly_winner')
      .eq('competition_id', state.league.id)
      .in('round_id', roundIds),
  ]);

  if (standingsError) {
    throw standingsError;
  }
  if (scoresError) {
    throw scoresError;
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
        <span class="deadline ${deadlineClass}" data-deadline="${escapeHtml(editable ? gameweek.star_man_locks_at || '' : '')}">
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
      ${renderRows(round)}
    </section>
  `;
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
    .sort((a, b) => Number(a.round_rank || 999) - Number(b.round_rank || 999));
  const gameweeks = roundGameweeks(round);
  const scoreLookup = scoreLookupForRound(round);

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
      <div class="history-result-row history-result-head">
        <span>Player</span>
        <span>Final</span>
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
        return `
          <div class="history-result-row">
            <span class="history-player-cell">
              ${avatarMarkup(profile)}
              <strong>${escapeHtml(profile.display_name || 'Player')}</strong>
            </span>
            <span class="history-final-rank ${rank === 1 ? 'winner' : ''}">${escapeHtml(ordinalRank(rank))}</span>
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

function updateCountdowns() {
  content.querySelectorAll('[data-deadline]').forEach((element) => {
    if (!element.dataset.deadline) {
      return;
    }

    const locked = isPast(element.dataset.deadline);
    element.textContent = locked ? 'Locked' : countdownText(element.dataset.deadline);
    element.classList.toggle('locked', locked);

    const row = element.closest('[data-gameweek-id]');
    const editable = row?.dataset.currentGameweek === 'true' && !locked;
    row?.querySelector('[data-prediction-input]')?.toggleAttribute('disabled', !editable);
    row?.querySelector('[data-save-game-card]')?.toggleAttribute('disabled', !editable);
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

  state.predictions.set(predictionKey(roundId, gameweekId), { round_id: roundId, gameweek_id: gameweekId, predicted_value: value });
  row.querySelector('.save-light')?.classList.add('saved');
  row.querySelector('.save-light')?.setAttribute('aria-label', 'Prediction saved');
  row.querySelector('.save-light')?.setAttribute('title', 'Prediction saved');
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
  const light = row.querySelector('.save-light');
  light?.classList.remove('saved');
  light?.setAttribute('aria-label', 'No prediction saved');
  light?.setAttribute('title', 'No prediction saved');
  setMessage('Game Card prediction cleared.', 'success');
}

async function boot() {
  const context = await loadLeagueContext();
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

    if (!state.activeGameweek) {
      renderNoRounds();
      return;
    }

    await loadRounds();
    await loadPredictionsAndResults();
    await loadHistoryData();
    renderRounds();
  } catch (error) {
    content.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load Game Card page.')}</p>`;
  }
}

boot();

closeCardButton?.addEventListener('click', closeCardModal);
cardModal?.addEventListener('click', (event) => {
  if (event.target === cardModal) {
    closeCardModal();
  }
});
