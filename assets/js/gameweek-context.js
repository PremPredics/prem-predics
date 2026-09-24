import { supabase } from './supabase-client.js';
import { boundedRead } from './async-read.js';
import { formatDeadlineDuration } from './deadline-countdown.js';

const pendingGameweeks = new Map();

export function countdownText(targetTime) {
  if (!targetTime) {
    return 'No kickoff time set';
  }

  const remainingMs = new Date(targetTime).getTime() - Date.now();
  if (remainingMs <= 0) {
    return '0h 0m';
  }

  return formatDeadlineDuration(remainingMs);
}

export function isGameweekStarted(gameweek) {
  return Boolean(gameweek?.first_fixture_kickoff_at)
    && Date.now() >= new Date(gameweek.first_fixture_kickoff_at).getTime();
}

export async function loadActiveGameweek(league) {
  const key = `${league.season_id}:${league.starts_gameweek_id}`;
  if (pendingGameweeks.has(key)) return pendingGameweeks.get(key);
  const request = readActiveGameweek(league).finally(() => pendingGameweeks.delete(key));
  pendingGameweeks.set(key, request);
  return request;
}

async function readActiveGameweek(league) {
  // Independent reads run together, and simultaneous callers share the work.
  // No persisted cache: deadlines and final-result transitions remain fresh.
  const [{ data: gameweeks, error: gameweekError }, { data: fixtures, error: fixtureError }] = await Promise.all([
    boundedRead(signal => supabase
    .from('gameweek_deadlines')
    .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at, star_man_locks_at')
    .eq('season_id', league.season_id)
    .order('gameweek_number', { ascending: true }).abortSignal(signal)),
    boundedRead(signal => supabase.from('fixtures')
      .select('id, gameweek_id, status, kickoff_at, prediction_locks_at')
      .eq('season_id', league.season_id)
      .gte('gameweek_id', league.starts_gameweek_id)
      .abortSignal(signal)),
  ]);

  if (gameweekError) {
    throw gameweekError;
  }

  const eligibleGameweeks = (gameweeks || [])
    .filter((gameweek) => Number(gameweek.gameweek_id) >= Number(league.starts_gameweek_id));

  if (!eligibleGameweeks.length) {
    return { activeGameweek: null, fixturesByGameweek: new Map() };
  }

  if (fixtureError) {
    throw fixtureError;
  }

  const fixturesByGameweek = new Map();
  (fixtures || []).forEach((fixture) => {
    const key = String(fixture.gameweek_id);
    const group = fixturesByGameweek.get(key) || [];
    group.push(fixture);
    fixturesByGameweek.set(key, group);
  });

  return { activeGameweek: selectActiveGameweek(eligibleGameweeks, fixturesByGameweek), fixturesByGameweek };
}

export function selectActiveGameweek(eligibleGameweeks, fixturesByGameweek) {
  return eligibleGameweeks.find((gameweek) => {
    const gameweekFixtures = fixturesByGameweek.get(String(gameweek.gameweek_id)) || [];
    const playableFixtures = gameweekFixtures.filter((fixture) => fixture.status !== 'postponed');

    if (!playableFixtures.length) {
      return false;
    }

    return playableFixtures.some((fixture) => fixture.status !== 'final');
  }) || eligibleGameweeks[eligibleGameweeks.length - 1] || null;
}

export function startCountdown(element, gameweek) {
  if (!element || !gameweek) {
    return null;
  }

  function update() {
    if (isGameweekStarted(gameweek)) {
      element.textContent = 'Gameweek is active';
      return;
    }

    element.textContent = countdownText(gameweek.first_fixture_kickoff_at);
  }

  update();
  return window.setInterval(update, 1000);
}
