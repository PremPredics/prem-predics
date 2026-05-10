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

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  rounds: [],
  gameweeks: [],
  predictions: new Map(),
  results: new Map(),
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
      return statusA - statusB || numberB - numberA;
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

function renderNoRounds() {
  content.innerHTML = `
    <div class="card-copy">
      <h2>No active Game Card</h2>
      <p>No Game Card is active for the current gameweek in this league, and there is no Game Card history yet.</p>
    </div>
  `;
}

function renderRows(round) {
  const isActiveRound = roundStatus(round) === 'active';
  const rows = roundGameweeks(round).map((gameweek) => {
    const prediction = state.predictions.get(predictionKey(round.id, gameweek.gameweek_id));
    const result = state.results.get(resultKey(round.card_id, gameweek.gameweek_id));
    const locked = isPast(gameweek.star_man_locks_at) || !isActiveRound;
    const inputValue = prediction?.predicted_value ?? '';

    return `
      <article class="gameweek-row" data-round-id="${round.id}" data-gameweek-id="${gameweek.gameweek_id}">
        <strong>GW ${gameweek.gameweek_number}</strong>
        <span class="deadline ${locked ? 'locked' : ''}" data-deadline="${escapeHtml(isActiveRound ? gameweek.star_man_locks_at || '' : '')}">
          ${isActiveRound ? (locked ? 'Locked' : countdownText(gameweek.star_man_locks_at)) : 'History'}
        </span>
        ${isActiveRound ? `
          <input class="prediction-input" data-prediction-input type="number" inputmode="numeric" min="0" max="999" step="1" value="${escapeHtml(inputValue)}" ${locked ? 'disabled' : ''} aria-label="Game Card prediction for Gameweek ${gameweek.gameweek_number}">
        ` : `
          <span class="prediction-value">${inputValue !== '' ? escapeHtml(inputValue) : 'No pick'}</span>
        `}
        <span>${result ? `Result: ${escapeHtml(result.actual_value)}` : 'Result pending'}</span>
        ${isActiveRound ? `<button type="button" data-save-game-card ${locked ? 'disabled' : ''}>Save</button>` : '<span></span>'}
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
        <div class="game-card-visual">${escapeHtml(cardName)}</div>
        <div class="card-copy">
          <h2>${escapeHtml(cardName)}</h2>
          <p>${escapeHtml(definition?.description || cardInstruction(cardName))}</p>
          <span class="range-pill">Active Gameweeks ${startNumber} to ${endNumber}</span>
          <p>${escapeHtml(cardInstruction(cardName))}</p>
        </div>
      </div>
      ${renderRows(round)}
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

  content.innerHTML = `<div class="round-list">${rounds.map(renderRound).join('')}</div>`;

  content.querySelectorAll('[data-save-game-card]').forEach((button) => {
    button.addEventListener('click', () => savePrediction(button.closest('[data-gameweek-id]')));
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
    row?.querySelector('[data-prediction-input]')?.toggleAttribute('disabled', locked);
    row?.querySelector('[data-save-game-card]')?.toggleAttribute('disabled', locked);
  });
}

async function savePrediction(row) {
  const roundId = row?.dataset.roundId;
  const gameweekId = row?.dataset.gameweekId;
  const input = row?.querySelector('[data-prediction-input]');
  const value = Number(input?.value);

  if (!roundId || !gameweekId || !input || input.value === '' || Number.isNaN(value) || value < 0 || value > 999) {
    setMessage('Enter a number between 0 and 999.', 'error');
    return;
  }

  const round = state.rounds.find((item) => item.id === roundId);
  if (!round || roundStatus(round) !== 'active') {
    setMessage('Only the active Game Card can be edited.', 'error');
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
  setMessage('Game Card prediction saved.', 'success');
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
    renderRounds();
  } catch (error) {
    content.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load Game Card page.')}</p>`;
  }
}

boot();
