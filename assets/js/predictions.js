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
const HEDGE_DELETED_MATCH_CONFLICT_TEXT = 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
const effectNameOverrides = {
  curse_gambler: 'Curse of the Random',
};

const effectDescriptionOverrides = {
  curse_deleted_match: "Valid for 1 Gameweek. Choose one opponent prediction. The opponent cannot earn points from this game. Must be played at least 24 hours before the gameweek's first KO time. Cannot be played on a fixture while Power of the Hedge is active.",
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
  hedgeEffects: [],
  hedgePredictions: [],
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
  return `${hours}hr ${minutes}m`;
}

function fixtureLockText(fixture) {
  return isPast(fixture.prediction_locks_at) ? '🔒' : countdownText(fixture.prediction_locks_at);
}
