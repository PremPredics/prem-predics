import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  formatDateTime,
  leagueUrl,
  loadLeagueContext,
  shortTeamName,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';

const leagueTitle = document.querySelector('[data-league-title]');
const gameweekSummary = document.querySelector('[data-gameweek-summary]');
const fixturesContainer = document.querySelector('[data-fixtures]');
const saveAllButton = document.querySelector('[data-save-all]');
const editButton = document.querySelector('[data-edit-predictions]');
const predictionMessage = document.querySelector('[data-prediction-message]');
const leagueBackLink = document.querySelector('[data-league-back]');
const predictionsBackLink = document.querySelector('[data-predictions-back]');
const curseModal = document.querySelector('[data-curse-modal]');
const curseModalBody = document.querySelector('[data-curse-modal-body]');
const closeCurseButton = document.querySelector('[data-close-curse]');

const predictionCurseKeys = new Set([
  'curse_deleted_match',
  'curse_glasses',
  'curse_even_number',
  'curse_odd_number',
  'curse_hated',
  'curse_gambler',
]);

const predictionPowerKeys = new Set([
  'power_pessimist',
]);

const CURSE_ACTIVATION_MS = 24 * 60 * 60 * 1000;
const effectNameOverrides = {
  curse_gambler: 'Curse of the Random',
};

const effectDescriptionOverrides = {
  curse_deleted_match: "Valid for 1 Gameweek. Choose one opponent prediction. The opponent cannot earn points from this game. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_glasses: "Valid for 1 Gameweek. Any 0-0 prediction that the opponent makes scores nothing. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_even_number: "Valid for 1 Gameweek. Opponent can only predict an even number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_odd_number: "Valid for 1 Gameweek. Opponent can only predict an odd number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_hated: "Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this Gameweek. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_gambler: "Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek's first KO time.",
};

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  teams: new Map(),
  fixtures: [],
  predictions: new Map(),
  hedgeEffect: null,
  hedgePrediction: null,
  godEffect: null,
  godPrediction: null,
  superScoreEffect: null,
  superScorePick: null,
  pessimistEffect: null,
  targetEffects: [],
  effectProfiles: new Map(),
  curseOverridePredictions: new Map(),
  predictionParity: null,
  mode: 'edit',
};

let predictionCountdownTimer = null;

function setMessage(text, type = 'info') {
  predictionMessage.textContent = text;
  predictionMessage.dataset.type = type;
}

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function curseActivationAt() {
  const firstKickoff = state.activeGameweek?.first_fixture_kickoff_at || state.fixtures[0]?.kickoff_at;
  if (!firstKickoff) {
    return null;
  }
  return new Date(new Date(firstKickoff).getTime() - CURSE_ACTIVATION_MS).toISOString();
}

function curseActiveNow() {
  const activationAt = curseActivationAt();
  return activationAt ? isPast(activationAt) : false;
}

function countdownText(value) {
  if (!value) {
    return 'No deadline';
  }

  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Locked';
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isCompact = window.matchMedia?.('(max-width: 720px)').matches;
  if (isCompact) {
    return hours >= 1 ? `${hours}hr` : `${Math.max(1, minutes)}m`;
  }
  return `${hours}hr ${minutes}m Remaining`;
}

function fixtureLockText(fixture) {
  return isPast(fixture.prediction_locks_at) ? '🔒' : countdownText(fixture.prediction_locks_at);
}

function teamName(teamId) {
  return shortTeamName(state.teams.get(teamId) || 'Team');
}

function fixtureLabel(fixture) {
  return `${teamName(fixture.home_team_id)} v ${teamName(fixture.away_team_id)}`;
}

function effectDefinition(effect) {
  return Array.isArray(effect.card_definitions) ? effect.card_definitions[0] : effect.card_definitions;
}

function effectKey(effect) {
  return effectDefinition(effect)?.effect_key;
}

function effectName(effect) {
  const key = effectKey(effect);
  return effectNameOverrides[key] || effectDefinition(effect)?.name || 'Curse Card';
}

function effectDescription(effect) {
  const key = effectKey(effect);
  return effectDescriptionOverrides[key] || effectDefinition(effect)?.description || 'This curse affects how your prediction can score.';
}

function playedByName(effect) {
  if (String(effect.played_by_user_id || '') === String(state.user?.id || '')) {
    return 'You';
  }

  return state.effectProfiles.get(effect.played_by_user_id)?.display_name || 'An opponent';
}

function isPredictionCurse(effect) {
  return predictionCurseKeys.has(effectKey(effect));
}

function isPredictionPower(effect) {
  return predictionPowerKeys.has(effectKey(effect));
}

function effectCategory(effect) {
  return isPredictionCurse(effect) ? 'curse' : 'power';
}

function predictionIsNilNil(prediction) {
  return prediction
    && Number(prediction.home_goals) === 0
    && Number(prediction.away_goals) === 0;
}

function fixturePredictionForEffects(fixture) {
  return displayPredictionForFixture(fixture);
}

function curseAppliesToFixture(effect, fixture, prediction = fixturePredictionForEffects(fixture)) {
  const key = effectKey(effect);
  if (key === 'curse_deleted_match' || key === 'curse_hated') {
    return !effect.fixture_id || effect.fixture_id === fixture.id;
  }
  if (key === 'curse_gambler') {
    const ids = effect.payload?.gambler_fixture_ids || [];
    return !ids.length || ids.includes(fixture.id);
  }
  if (key === 'curse_glasses') {
    return predictionIsNilNil(prediction);
  }
  return true;
}

function curseRevealAllowed(effect, fixture) {
  return Boolean(effect && fixture);
}

function predictionCursesForFixture(fixture) {
  return state.targetEffects
    .filter(isPredictionCurse)
    .filter((effect) => curseAppliesToFixture(effect, fixture));
}

function visiblePredictionCursesForFixture(fixture) {
  return predictionCursesForFixture(fixture)
    .filter((effect) => curseRevealAllowed(effect, fixture))
    .sort((a, b) => new Date(a.played_at || 0) - new Date(b.played_at || 0));
}

function effectPlayedAtMs(effect) {
  return new Date(effect?.played_at || 0).getTime() || 0;
}

function renderCurseMarker(fixture) {
  const curses = visiblePredictionCursesForFixture(fixture);
  if (!curses.length) {
    return '';
  }

  const label = curses.length === 1 ? 'View active curse' : `View ${curses.length} active curses`;
  return `<button class="curse-marker" type="button" data-card-fixture="${fixture.id}" data-card-kind="curse" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">&#9760;</button>`;
}

function visiblePredictionPowersForFixture() {
  return state.pessimistEffect ? [state.pessimistEffect] : [];
}

function ownPredictionPanelPowers() {
  return [state.pessimistEffect, state.hedgeEffect, state.godEffect, state.superScoreEffect]
    .filter(Boolean);
}

function activeParityEffect() {
  return state.targetEffects.find((effect) => (
    effectKey(effect) === 'curse_even_number' || effectKey(effect) === 'curse_odd_number'
  )) || null;
}

function paritySaveFailedMessage() {
  const effect = activeParityEffect();
  const isOdd = effectKey(effect) === 'curse_odd_number';
  const curseName = isOdd ? 'Curse of the Odd Number' : 'Curse of the Even Number';
  const scoreWord = isOdd ? 'Odd' : 'Even';
  return `Save Failed - ${playedByName(effect)} has played ${curseName}, each score must be ${scoreWord}.`;
}

function renderPowerMarker(fixture) {
  const powers = visiblePredictionPowersForFixture(fixture);
  if (!powers.length) {
    return '';
  }

  const label = powers.length === 1 ? 'View active power' : `View ${powers.length} active powers`;
  return `<button class="power-marker" type="button" data-card-fixture="${fixture.id}" data-card-kind="power" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">&#9994;</button>`;
}

function revealedCurseOverride(fixture) {
  return state.curseOverridePredictions.get(fixture.id) || null;
}

function displayPredictionForFixture(fixture) {
  return revealedCurseOverride(fixture) || state.predictions.get(fixture.id) || null;
}

function cleanScoreInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 3);
  const score = digits === '' ? '' : String(Math.min(Number(digits), 100));
  input.value = score;
}

function scoreInputState(input) {
  const raw = input.value.trim();
  if (raw === '') {
    return { filled: false, value: null, valid: true, parityOk: true };
  }

  const value = Number(raw);
  const valid = Number.isInteger(value) && value >= 0 && value <= 100;
  const parityOk = !state.predictionParity
    || (state.predictionParity === 'even' && value % 2 === 0)
    || (state.predictionParity === 'odd' && value % 2 === 1);

  return { filled: true, value, valid, parityOk };
}

function fixtureRowPredictionState(fixture) {
  const fixtureRow = fixturesContainer.querySelector(`[data-fixture-id="${fixture.id}"]`);
  if (!fixtureRow) {
    return { status: 'missing' };
  }

  const home = scoreInputState(fixtureRow.querySelector('[data-home-goals]'));
  const away = scoreInputState(fixtureRow.querySelector('[data-away-goals]'));

  if (!home.filled && !away.filled) {
    return { status: 'blank' };
  }

  if (home.filled !== away.filled) {
    return { status: 'partial' };
  }

  if (!home.valid || !away.valid) {
    return { status: 'invalid' };
  }

  if (!home.parityOk || !away.parityOk) {
    return { status: 'parity' };
  }

  return { status: 'complete', home_goals: home.value, away_goals: away.value };
}

function collectDraftPredictionInputs() {
  const draft = new Map();
  fixturesContainer.querySelectorAll('[data-fixture-id]').forEach((row) => {
    const homeInput = row.querySelector('[data-home-goals]');
    const awayInput = row.querySelector('[data-away-goals]');
    if (!homeInput || !awayInput) {
      return;
    }
    draft.set(row.dataset.fixtureId, {
      home: homeInput.value,
      away: awayInput.value,
    });
  });
  return draft;
}

function restoreDraftPredictionInputs(draft) {
  if (!draft?.size) {
    return;
  }
  draft.forEach((values, fixtureId) => {
    const row = fixturesContainer.querySelector(`[data-fixture-id="${fixtureId}"]`);
    if (!row || row.dataset.curseOverride === 'true') {
      return;
    }
    const homeInput = row.querySelector('[data-home-goals]');
    const awayInput = row.querySelector('[data-away-goals]');
    if (homeInput && !homeInput.disabled) homeInput.value = values.home;
    if (awayInput && !awayInput.disabled) awayInput.value = values.away;
  });
  setSaveButtonState();
}

function setSaveButtonState() {
  const unlockedFixtures = state.fixtures.filter((fixture) => (
    !isPast(fixture.prediction_locks_at) && !revealedCurseOverride(fixture)
  ));
  saveAllButton.disabled = !unlockedFixtures.length;
}

async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  state.teams = new Map((data || []).map((team) => [team.id, team.name]));
}

async function loadFixtures() {
  if (!state.activeGameweek) {
    state.fixtures = [];
    return;
  }

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, season_id, gameweek_id, home_team_id, away_team_id, kickoff_at, prediction_locks_at, second_half_deadline_at, status, sort_order')
    .eq('season_id', state.league.season_id)
    .eq('gameweek_id', state.activeGameweek.gameweek_id)
    .order('kickoff_at', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  state.fixtures = data || [];
}

async function loadExistingPredictions() {
  if (!state.fixtures.length) {
    state.predictions = new Map();
    return;
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('fixture_id, home_goals, away_goals, prediction_slot, source_card_effect_id, updated_at')
    .eq('competition_id', state.league.id)
    .eq('user_id', state.user.id)
    .in('prediction_slot', ['primary', 'hedge', 'power_of_god'])
    .in('fixture_id', state.fixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  state.predictions = new Map((data || [])
    .filter((prediction) => prediction.prediction_slot === 'primary')
    .map((prediction) => [prediction.fixture_id, prediction]));
  state.hedgePrediction = (data || []).find((prediction) => prediction.prediction_slot === 'hedge') || null;
  state.godPrediction = (data || []).find((prediction) => prediction.prediction_slot === 'power_of_god') || null;
  if (state.fixtures.length && state.predictions.size === state.fixtures.length) {
    state.mode = 'summary';
  }
}

async function loadCurseOverridePredictions() {
  state.curseOverridePredictions = new Map();
  if (!state.fixtures.length) {
    return;
  }

  const fixtureIds = state.fixtures.map((fixture) => fixture.id);
  const [hatedResult, gamblerResult] = await Promise.all([
    supabase
      .from('curse_hated_forced_predictions')
      .select('fixture_id, home_goals, away_goals, card_effect_id')
      .eq('competition_id', state.league.id)
      .eq('target_user_id', state.user.id)
      .in('fixture_id', fixtureIds),
    supabase
      .from('curse_gambler_rolls')
      .select('fixture_id, home_goals, away_goals, card_effect_id')
      .eq('competition_id', state.league.id)
      .eq('target_user_id', state.user.id)
      .in('fixture_id', fixtureIds),
  ]);

  if (hatedResult.error) {
    throw hatedResult.error;
  }
  if (gamblerResult.error) {
    throw gamblerResult.error;
  }

  const activeEffectIds = new Set(state.targetEffects.map((effect) => String(effect.id)));
  const effectById = new Map(state.targetEffects.map((effect) => [String(effect.id), effect]));
  [...(hatedResult.data || []), ...(gamblerResult.data || [])]
    .filter((row) => activeEffectIds.has(String(row.card_effect_id)))
    .sort((a, b) => (
      effectPlayedAtMs(effectById.get(String(a.card_effect_id)))
      - effectPlayedAtMs(effectById.get(String(b.card_effect_id)))
    ))
    .forEach((row) => {
      state.curseOverridePredictions.set(row.fixture_id, {
      fixture_id: row.fixture_id,
      home_goals: row.home_goals,
      away_goals: row.away_goals,
      prediction_slot: 'curse_override',
      source_card_effect_id: row.card_effect_id,
    });
    });
}

function isEffectForCurrentGameweek(effect) {
  const gameweekId = Number(state.activeGameweek.gameweek_id);
  const directGameweek = !effect.gameweek_id || Number(effect.gameweek_id) === gameweekId;
  const startsOk = !effect.start_gameweek_id || Number(effect.start_gameweek_id) <= gameweekId;
  const endsOk = !effect.end_gameweek_id || Number(effect.end_gameweek_id) >= gameweekId;
  return directGameweek && startsOk && endsOk;
}

async function loadActivePredictionEffects() {
  const { data, error } = await supabase
    .from('active_card_effects')
    .select('id, fixture_id, gameweek_id, start_gameweek_id, end_gameweek_id, played_at, played_by_user_id, target_user_id, status, payload, card_definitions(effect_key, name, description, category)')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  const activeEffects = (data || []).filter(isEffectForCurrentGameweek);
  const ownEffects = activeEffects.filter((effect) => effect.played_by_user_id === state.user.id);
  state.targetEffects = activeEffects.filter((effect) => effect.target_user_id === state.user.id);
  state.pessimistEffect = ownEffects.find((effect) => effectKey(effect) === 'power_pessimist') || null;
  const visibleEffects = [...state.targetEffects, ...ownEffects].filter(Boolean);
  const playedByUserIds = [...new Set(visibleEffects.map((effect) => effect.played_by_user_id).filter(Boolean))];
  state.effectProfiles = new Map();
  if (playedByUserIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', playedByUserIds);
    state.effectProfiles = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }
  const activeTargetEffects = state.targetEffects;
  state.predictionParity = activeTargetEffects.some((effect) => effectKey(effect) === 'curse_even_number')
    ? 'even'
    : activeTargetEffects.some((effect) => effectKey(effect) === 'curse_odd_number')
      ? 'odd'
      : null;

  state.hedgeEffect = ownEffects.find((effect) => (
    effectKey(effect) === 'power_hedge'
  )) || null;

  state.godEffect = ownEffects.find((effect) => (
    effectKey(effect) === 'power_of_god'
  )) || null;

  state.superScoreEffect = ownEffects.find((effect) => (
    effectKey(effect) === 'super_score'
  )) || null;

  if (!state.superScoreEffect) {
    state.superScorePick = null;
    return;
  }

  const { data: superScoreData, error: superScoreError } = await supabase
    .from('super_score_picks')
    .select('id, card_effect_id, home_goals, away_goals, updated_at')
    .eq('card_effect_id', state.superScoreEffect.id)
    .maybeSingle();

  if (superScoreError) {
    throw superScoreError;
  }

  state.superScorePick = superScoreData || null;
}

function renderSummary() {
  if (predictionCountdownTimer) {
    window.clearInterval(predictionCountdownTimer);
    predictionCountdownTimer = null;
  }

  fixturesContainer.innerHTML = `
    ${renderTargetRestrictionPanel()}
    <div class="prediction-summary-list">
      ${state.fixtures.map((fixture) => {
        const prediction = displayPredictionForFixture(fixture);
        const curseOverride = revealedCurseOverride(fixture);
        const locked = isPast(fixture.prediction_locks_at);
        return `
          <article class="fixture-row summary-fixture-row ${curseOverride ? 'curse-override-row' : ''}" data-fixture-id="${fixture.id}" data-curse-override="${curseOverride ? 'true' : 'false'}">
            <span class="fixture-flags">
              <span class="fixture-gameweek">GW${escapeHtml(state.activeGameweek.gameweek_number)}</span>
            </span>
            <span class="fixture-main summary-fixture-main">
              <span class="fixture-team home">${escapeHtml(teamName(fixture.home_team_id))}</span>
              <strong class="summary-score ${curseOverride ? 'curse-score' : ''}">${prediction?.home_goals ?? '-'}-${prediction?.away_goals ?? '-'}</strong>
              <span class="fixture-team away">${escapeHtml(teamName(fixture.away_team_id))}</span>
            </span>
            <span class="fixture-meta">
              <span class="fixture-lock ${locked ? 'locked' : 'remaining'}" data-prediction-lock="${escapeHtml(fixture.prediction_locks_at || '')}">${fixtureLockText(fixture)}</span>
              <span class="fixture-effects">
                ${renderPowerMarker(fixture)}
                ${renderCurseMarker(fixture)}
              </span>
            </span>
            ${state.hedgePrediction?.fixture_id === fixture.id ? `<small>Hedge: ${state.hedgePrediction.home_goals}-${state.hedgePrediction.away_goals}</small>` : ''}
            ${state.godPrediction?.fixture_id === fixture.id ? `<small>Power of God: ${state.godPrediction.home_goals}-${state.godPrediction.away_goals}</small>` : ''}
            ${curseOverride ? '<small class="summary-cursed-label">Cursed</small>' : ''}
          </article>
        `;
      }).join('')}
      ${state.superScorePick ? `<div class="summary-row special-summary"><span>Super Score</span><strong>${state.superScorePick.home_goals}-${state.superScorePick.away_goals}</strong><span>Scoreline Pick</span><span class="summary-status"></span></div>` : ''}
    </div>
  `;
  saveAllButton.hidden = true;
  editButton.hidden = false;
  wireCurseMarkers();
  updatePredictionCountdowns();
  predictionCountdownTimer = window.setInterval(updatePredictionCountdowns, 30000);
  setMessage('Predictions saved.', 'success');
}

function renderEdit() {
  if (predictionCountdownTimer) {
    window.clearInterval(predictionCountdownTimer);
    predictionCountdownTimer = null;
  }

  if (!state.fixtures.length) {
    fixturesContainer.innerHTML = '<p class="state-text">No fixtures found for this gameweek.</p>';
    saveAllButton.hidden = true;
    editButton.hidden = true;
    return;
  }

  fixturesContainer.innerHTML = `${renderSpecialPanels()}${renderTargetRestrictionPanel()}${state.fixtures.map((fixture) => {
    const prediction = displayPredictionForFixture(fixture);
    const curseOverride = revealedCurseOverride(fixture);
    const locked = isPast(fixture.prediction_locks_at);
    return `
      <article class="fixture-row ${curseOverride ? 'curse-override-row' : ''}" data-fixture-id="${fixture.id}" data-curse-override="${curseOverride ? 'true' : 'false'}">
        <span class="fixture-flags">
          <span class="fixture-gameweek">GW${escapeHtml(state.activeGameweek.gameweek_number)}</span>
        </span>
        <span class="fixture-main">
          <span class="fixture-team home">${escapeHtml(teamName(fixture.home_team_id))}</span>
          <input class="score-input" data-score-input data-home-goals type="text" inputmode="numeric" maxlength="3" value="${prediction?.home_goals ?? ''}" ${locked || curseOverride ? 'disabled' : ''} aria-label="${escapeHtml(teamName(fixture.home_team_id))} goals">
          <span class="score-separator">-</span>
          <input class="score-input" data-score-input data-away-goals type="text" inputmode="numeric" maxlength="3" value="${prediction?.away_goals ?? ''}" ${locked || curseOverride ? 'disabled' : ''} aria-label="${escapeHtml(teamName(fixture.away_team_id))} goals">
          <span class="fixture-team away">${escapeHtml(teamName(fixture.away_team_id))}</span>
        </span>
        <span class="fixture-meta">
          <span class="fixture-lock ${locked ? 'locked' : 'remaining'}" data-prediction-lock="${escapeHtml(fixture.prediction_locks_at || '')}">${fixtureLockText(fixture)}</span>
          <span class="fixture-effects">
            ${renderPowerMarker(fixture)}
            ${renderCurseMarker(fixture)}
          </span>
        </span>
      </article>
    `;
  }).join('')}`;

  fixturesContainer.querySelectorAll('[data-score-input]').forEach((input) => {
    input.addEventListener('input', () => {
      cleanScoreInput(input);
      setSaveButtonState();
    });
  });
  wireSpecialPanels();
  wireCurseMarkers();

  saveAllButton.hidden = false;
  editButton.hidden = true;
  setMessage('', 'info');
  setSaveButtonState();
  updatePredictionCountdowns();
  predictionCountdownTimer = window.setInterval(updatePredictionCountdowns, 30000);
}

function renderSpecialPanels() {
  return `${renderHedgePanel()}${renderGodPanel()}${renderSuperScorePanel()}`;
}

function renderHedgePanel() {
  if (!state.hedgeEffect) {
    return '';
  }

  const selectedFixtureId = state.hedgeEffect.fixture_id || state.hedgePrediction?.fixture_id || '';
  const selectedFixture = state.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const locked = selectedFixture ? isPast(selectedFixture.prediction_locks_at) : false;
  const fixtureOptions = state.fixtures.map((fixture) => `
    <option value="${fixture.id}" ${fixture.id === selectedFixtureId ? 'selected' : ''}>
      ${escapeHtml(fixtureLabel(fixture))}
    </option>
  `).join('');

  return `
    <section class="hedge-panel" data-hedge-panel>
      <h3>Power of the Hedge</h3>
      <p class="state-text">Choose one match for a second scoreline. The best answer counts for that match.</p>
      <div class="hedge-controls">
        <select data-hedge-fixture ${state.hedgeEffect.fixture_id ? 'disabled' : ''}>
          <option value="">Choose match</option>
          ${fixtureOptions}
        </select>
        <input class="score-input" data-hedge-home type="text" inputmode="numeric" maxlength="3" value="${state.hedgePrediction?.home_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Hedge home goals">
        <span class="score-separator">-</span>
        <input class="score-input" data-hedge-away type="text" inputmode="numeric" maxlength="3" value="${state.hedgePrediction?.away_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Hedge away goals">
        <button type="button" data-save-hedge ${locked ? 'disabled' : ''}>Save Hedge</button>
      </div>
    </section>
  `;
}

function renderGodPanel() {
  if (!state.godEffect) {
    return '';
  }

  const selectedFixtureId = state.godEffect.fixture_id || state.godPrediction?.fixture_id || '';
  const selectedFixture = state.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const locked = selectedFixture ? isPast(selectedFixture.second_half_deadline_at) : false;
  const fixtureOptions = state.fixtures.map((fixture) => `
    <option value="${fixture.id}" ${fixture.id === selectedFixtureId ? 'selected' : ''}>
      ${escapeHtml(fixtureLabel(fixture))}
    </option>
  `).join('');

  return `
    <section class="hedge-panel god-panel" data-god-panel>
      <h3>Power of God</h3>
      <p class="state-text">Choose one match to override before the second-half deadline.</p>
      <div class="hedge-controls">
        <select data-god-fixture ${state.godEffect.fixture_id ? 'disabled' : ''}>
          <option value="">Choose match</option>
          ${fixtureOptions}
        </select>
        <input class="score-input" data-god-home type="text" inputmode="numeric" maxlength="3" value="${state.godPrediction?.home_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Power of God home goals">
        <span class="score-separator">-</span>
        <input class="score-input" data-god-away type="text" inputmode="numeric" maxlength="3" value="${state.godPrediction?.away_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Power of God away goals">
        <button type="button" data-save-god ${locked ? 'disabled' : ''}>Save</button>
      </div>
      <p class="state-text">${selectedFixture ? `Deadline: ${countdownText(selectedFixture.second_half_deadline_at)}` : 'Pick a match to see the deadline.'}</p>
    </section>
  `;
}

function renderSuperScorePanel() {
  if (!state.superScoreEffect) {
    return '';
  }

  const locked = isPast(state.activeGameweek.star_man_locks_at);
  return `
    <section class="hedge-panel super-score-panel" data-super-score-panel>
      <h3>Super Score</h3>
      <p class="state-text">Choose one scoreline. Every fixture that finishes with that exact home-away scoreline earns +3 UC pts.</p>
      <div class="hedge-controls scoreline-controls">
        <span class="scoreline-label">Scoreline</span>
        <input class="score-input" data-super-score-home type="text" inputmode="numeric" maxlength="3" value="${state.superScorePick?.home_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Super Score home goals">
        <span class="score-separator">-</span>
        <input class="score-input" data-super-score-away type="text" inputmode="numeric" maxlength="3" value="${state.superScorePick?.away_goals ?? ''}" ${locked ? 'disabled' : ''} aria-label="Super Score away goals">
        <button type="button" data-save-super-score ${locked ? 'disabled' : ''}>Save</button>
      </div>
      <p class="state-text">${locked ? 'Super Score is locked for this gameweek.' : `Deadline: ${countdownText(state.activeGameweek.star_man_locks_at)}`}</p>
    </section>
  `;
}

function wireSpecialPanels() {
  const panel = fixturesContainer.querySelector('[data-hedge-panel]');
  if (!panel) {
    // Continue wiring other panels.
  } else {
    panel.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => cleanScoreInput(input));
    });
    panel.querySelector('[data-save-hedge]')?.addEventListener('click', saveHedgePrediction);
  }

  const godPanel = fixturesContainer.querySelector('[data-god-panel]');
  godPanel?.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => cleanScoreInput(input));
  });
  godPanel?.querySelector('[data-save-god]')?.addEventListener('click', saveGodPrediction);

  const superScorePanel = fixturesContainer.querySelector('[data-super-score-panel]');
  superScorePanel?.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => cleanScoreInput(input));
  });
  superScorePanel?.querySelector('[data-save-super-score]')?.addEventListener('click', saveSuperScorePick);
}

function updatePredictionCountdowns() {
  fixturesContainer.querySelectorAll('[data-prediction-lock]').forEach((element) => {
    const deadline = element.dataset.predictionLock;
    const locked = isPast(deadline);
    element.textContent = locked ? '🔒' : countdownText(deadline);
    element.classList.toggle('locked', locked);
    element.classList.toggle('remaining', !locked);

    const row = element.closest('[data-fixture-id]');
    row?.querySelectorAll('[data-score-input]').forEach((input) => {
      input.disabled = locked || row.dataset.curseOverride === 'true';
    });
  });

  setSaveButtonState();
}

function curseCardDetailMarkup(effect) {
  const category = effectCategory(effect);
  return `
    <div class="curse-card-wrap">
      <div class="curse-card-played-by">Played by ${escapeHtml(playedByName(effect))}</div>
      <article class="curse-detail-card ${category === 'power' ? 'power-detail-card' : ''}">
        <strong>${escapeHtml(effectName(effect))}</strong>
        <p>${escapeHtml(effectDescription(effect))}</p>
      </article>
    </div>
  `;
}

function openCardEffectsModal(effects, title = 'Active Card') {
  if (!curseModal || !curseModalBody || !effects.length) {
    return;
  }

  const titleElement = curseModal.querySelector('h2');
  if (titleElement) {
    titleElement.textContent = title;
  }
  curseModalBody.innerHTML = effects
    .map(curseCardDetailMarkup)
    .join('<div class="curse-audit-separator">AND THEN</div>');

  document.body.classList.add('card-preview-open');
  curseModal.classList.add('show');
  curseModal.setAttribute('aria-hidden', 'false');
}

function openCurseEffectsModal(effects) {
  openCardEffectsModal(effects, effects.length === 1 ? 'Active Curse' : 'Active Curses');
}

function openCurseModal(fixtureId) {
  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) {
    return;
  }

  openCurseEffectsModal(visiblePredictionCursesForFixture(fixture));
}

function openCurseEffectModal(effectId) {
  const effect = state.targetEffects.find((item) => item.id === effectId);
  if (!effect) {
    return;
  }

  openCurseEffectsModal([effect]);
}

function openPowerModal(fixtureId) {
  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  const powers = fixture ? visiblePredictionPowersForFixture(fixture) : visiblePredictionPowersForFixture();
  if (!powers.length) {
    return;
  }

  openCardEffectsModal(powers, powers.length === 1 ? 'Active Power' : 'Active Powers');
}

function openPredictionEffectModal(effectId) {
  const effect = [...state.targetEffects, ...ownPredictionPanelPowers()].filter(Boolean)
    .find((item) => item.id === effectId);
  if (!effect) {
    return;
  }

  const title = effectCategory(effect) === 'power' ? 'Active Power' : 'Active Curse';
  openCardEffectsModal([effect], title);
}

function closeCurseModal() {
  if (!curseModal) {
    return;
  }

  curseModal.classList.remove('show');
  curseModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('card-preview-open');
}

function wireCurseMarkers() {
  fixturesContainer.querySelectorAll('[data-card-fixture]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.cardKind === 'power') {
        openPowerModal(button.dataset.cardFixture);
        return;
      }

      openCurseModal(button.dataset.cardFixture);
    });
  });

  fixturesContainer.querySelectorAll('[data-prediction-card-effect]').forEach((button) => {
    button.addEventListener('click', () => openPredictionEffectModal(button.dataset.predictionCardEffect));
  });
}

function render() {
  if (state.mode === 'summary') {
    renderSummary();
    return;
  }

  renderEdit();
}

function renderTargetRestrictionPanel() {
  const visibleCurses = state.targetEffects.filter(isPredictionCurse);
  const visiblePowers = ownPredictionPanelPowers();
  const visibleEffects = [...visiblePowers, ...visibleCurses]
    .sort((a, b) => effectPlayedAtMs(a) - effectPlayedAtMs(b));

  if (!visibleEffects.length) {
    return '';
  }

  return `
    <section class="hedge-panel restriction-panel">
      <h3>Active Power &amp; Curses on Predictions</h3>
      <div class="prediction-restriction-cards" aria-label="Active prediction cards">
        ${visibleEffects.map((effect) => {
          const category = effectCategory(effect);
          const icon = category === 'power' ? '&#9994;' : '&#9760;';
          return `
          <div class="prediction-restriction-card-wrap">
            <button class="prediction-restriction-card ${category === 'power' ? 'power-restriction-card' : 'curse-restriction-card'}" type="button" data-prediction-card-effect="${escapeHtml(effect.id)}" aria-label="View ${escapeHtml(effectName(effect))}">
              <span class="prediction-restriction-card-icon" aria-hidden="true">${icon}</span>
              <span class="prediction-restriction-card-name">${escapeHtml(effectName(effect))}</span>
            </button>
            <span class="prediction-restriction-played-by">Played by ${escapeHtml(playedByName(effect))}</span>
          </div>
        `;
        }).join('')}
      </div>
    </section>
  `;
}

async function saveAllPredictions() {
  const rows = [];
  const deleteFixtureIds = [];
  const unlockedFixtures = state.fixtures.filter((fixture) => (
    !isPast(fixture.prediction_locks_at) && !revealedCurseOverride(fixture)
  ));

  for (const fixture of unlockedFixtures) {
    const result = fixtureRowPredictionState(fixture);
    if (result.status === 'blank') {
      if (state.predictions.has(fixture.id)) {
        deleteFixtureIds.push(fixture.id);
      }
      continue;
    }

    if (result.status === 'partial') {
      setMessage('Enter both scores for a fixture or leave both boxes blank.', 'error');
      return;
    }

    if (result.status === 'invalid') {
      setMessage('Predictions must be whole numbers from 0 to 100.', 'error');
      return;
    }

    if (result.status === 'parity') {
      setMessage(paritySaveFailedMessage(), 'error');
      return;
    }

    if (result.status !== 'complete') {
      continue;
    }

    rows.push({
      competition_id: state.league.id,
      season_id: state.league.season_id,
      fixture_id: fixture.id,
      user_id: state.user.id,
      prediction_slot: 'primary',
      home_goals: result.home_goals,
      away_goals: result.away_goals,
      submitted_at: new Date().toISOString(),
    });
  }

  if (!rows.length && !deleteFixtureIds.length) {
    state.mode = 'summary';
    render();
    return;
  }

  setMessage('Saving predictions...', 'info');
  saveAllButton.disabled = true;

  let error = null;

  if (deleteFixtureIds.length) {
    const result = await supabase
      .from('predictions')
      .delete()
      .eq('competition_id', state.league.id)
      .eq('user_id', state.user.id)
      .eq('prediction_slot', 'primary')
      .in('fixture_id', deleteFixtureIds);
    error = result.error;
  }

  if (!error && rows.length) {
    const result = await supabase.from('predictions').upsert(rows, {
      onConflict: 'competition_id,fixture_id,user_id,prediction_slot',
    });
    error = result.error;
  }

  if (error) {
    setMessage(error.message || 'Could not save predictions.', 'error');
    setSaveButtonState();
    return;
  }

  rows.forEach((prediction) => state.predictions.set(prediction.fixture_id, prediction));
  deleteFixtureIds.forEach((fixtureId) => state.predictions.delete(fixtureId));
  state.mode = 'summary';
  render();
}

async function saveHedgePrediction() {
  const panel = fixturesContainer.querySelector('[data-hedge-panel]');
  const draftPredictions = collectDraftPredictionInputs();
  const fixtureId = panel?.querySelector('[data-hedge-fixture]')?.value;
  const homeInput = panel?.querySelector('[data-hedge-home]');
  const awayInput = panel?.querySelector('[data-hedge-away]');

  if (!state.hedgeEffect || !fixtureId || !homeInput?.value || !awayInput?.value) {
    setMessage('Choose a match and enter both Hedge scores.', 'error');
    return;
  }

  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  if (!fixture || isPast(fixture.prediction_locks_at)) {
    setMessage('This match is locked.', 'error');
    return;
  }

  setMessage('Saving Hedge prediction...', 'info');

  if (!state.hedgeEffect.fixture_id || state.hedgeEffect.fixture_id !== fixtureId) {
    const { error: effectError } = await supabase
      .from('active_card_effects')
      .update({ fixture_id: fixtureId })
      .eq('id', state.hedgeEffect.id)
      .eq('played_by_user_id', state.user.id);

    if (effectError) {
      setMessage(effectError.message || 'Could not choose Hedge match.', 'error');
      return;
    }

    state.hedgeEffect.fixture_id = fixtureId;
  }

  const row = {
    competition_id: state.league.id,
    season_id: state.league.season_id,
    fixture_id: fixtureId,
    user_id: state.user.id,
    prediction_slot: 'hedge',
    home_goals: Number(homeInput.value),
    away_goals: Number(awayInput.value),
    source_card_effect_id: state.hedgeEffect.id,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('predictions').upsert(row, {
    onConflict: 'competition_id,fixture_id,user_id,prediction_slot',
  });

  if (error) {
    setMessage(error.message || 'Could not save Hedge prediction.', 'error');
    return;
  }

  state.hedgePrediction = row;
  setMessage('Hedge prediction saved.', 'success');
  render();
  restoreDraftPredictionInputs(draftPredictions);
}

async function saveGodPrediction() {
  const panel = fixturesContainer.querySelector('[data-god-panel]');
  const fixtureId = panel?.querySelector('[data-god-fixture]')?.value;
  const homeInput = panel?.querySelector('[data-god-home]');
  const awayInput = panel?.querySelector('[data-god-away]');

  if (!state.godEffect || !fixtureId || !homeInput?.value || !awayInput?.value) {
    setMessage('Choose a match and enter both Power of God scores.', 'error');
    return;
  }

  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  if (!fixture || isPast(fixture.second_half_deadline_at)) {
    setMessage('The second-half deadline has passed for this match.', 'error');
    return;
  }

  setMessage('Saving Power of God prediction...', 'info');

  if (!state.godEffect.fixture_id || state.godEffect.fixture_id !== fixtureId) {
    const { error: effectError } = await supabase
      .from('active_card_effects')
      .update({ fixture_id: fixtureId })
      .eq('id', state.godEffect.id)
      .eq('played_by_user_id', state.user.id);

    if (effectError) {
      setMessage(effectError.message || 'Could not choose Power of God match.', 'error');
      return;
    }

    state.godEffect.fixture_id = fixtureId;
  }

  const row = {
    competition_id: state.league.id,
    season_id: state.league.season_id,
    fixture_id: fixtureId,
    user_id: state.user.id,
    prediction_slot: 'power_of_god',
    home_goals: Number(homeInput.value),
    away_goals: Number(awayInput.value),
    source_card_effect_id: state.godEffect.id,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('predictions').upsert(row, {
    onConflict: 'competition_id,fixture_id,user_id,prediction_slot',
  });

  if (error) {
    setMessage(error.message || 'Could not save Power of God prediction.', 'error');
    return;
  }

  state.godPrediction = row;
  setMessage('Power of God prediction saved.', 'success');
  render();
}

async function saveSuperScorePick() {
  const panel = fixturesContainer.querySelector('[data-super-score-panel]');
  const homeInput = panel?.querySelector('[data-super-score-home]');
  const awayInput = panel?.querySelector('[data-super-score-away]');

  if (!state.superScoreEffect || !homeInput?.value || !awayInput?.value) {
    setMessage('Enter both Super Score numbers.', 'error');
    return;
  }

  if (isPast(state.activeGameweek.star_man_locks_at)) {
    setMessage('Super Score is locked for this gameweek.', 'error');
    return;
  }

  const row = {
    competition_id: state.league.id,
    season_id: state.league.season_id,
    gameweek_id: state.activeGameweek.gameweek_id,
    user_id: state.user.id,
    card_effect_id: state.superScoreEffect.id,
    home_goals: Number(homeInput.value),
    away_goals: Number(awayInput.value),
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('super_score_picks').upsert(row, {
    onConflict: 'card_effect_id',
  });

  if (error) {
    setMessage(error.message || 'Could not save Super Score.', 'error');
    return;
  }

  state.superScorePick = row;
  setMessage('Super Score saved.', 'success');
  render();
}

saveAllButton.addEventListener('click', saveAllPredictions);
editButton.addEventListener('click', () => {
  state.mode = 'edit';
  render();
});
closeCurseButton?.addEventListener('click', closeCurseModal);
curseModal?.addEventListener('click', (event) => {
  if (event.target === curseModal) {
    closeCurseModal();
  }
});

async function boot() {
  const context = await loadLeagueContext();
  if (context.error) {
    leagueTitle.textContent = 'Predictions unavailable';
    gameweekSummary.textContent = context.error;
    fixturesContainer.innerHTML = '';
    saveAllButton.hidden = true;
    editButton.hidden = true;
    return;
  }

  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);
  if (predictionsBackLink) {
    predictionsBackLink.href = leagueUrl('prediction-hub.html', state.league.id);
  }
  leagueTitle.textContent = 'Loading predictions...';

  try {
    const { activeGameweek } = await loadActiveGameweek(state.league);
    state.activeGameweek = activeGameweek;

    if (!state.activeGameweek) {
      gameweekSummary.textContent = 'No active gameweek found for this league.';
      fixturesContainer.innerHTML = '';
      saveAllButton.hidden = true;
      editButton.hidden = true;
      return;
    }

    await Promise.all([loadTeams(), loadFixtures(), loadActivePredictionEffects()]);
    await loadExistingPredictions();
    await loadCurseOverridePredictions();
    leagueTitle.textContent = `Gameweek ${state.activeGameweek.gameweek_number} Predictions`;
    gameweekSummary.textContent = 'predictions lock 90 mins before kick-off.';
    render();
  } catch (error) {
    leagueTitle.textContent = 'Predictions unavailable';
    gameweekSummary.textContent = error.message || 'Could not load predictions.';
    fixturesContainer.innerHTML = '';
    saveAllButton.hidden = true;
    editButton.hidden = true;
  }
}

boot();
