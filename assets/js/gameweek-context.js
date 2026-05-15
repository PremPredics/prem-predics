import { supabase } from './supabase-client.js';

export function countdownText(targetTime) {
  if (!targetTime) {
    return 'No kickoff time set';
  }

  const remainingMs = new Date(targetTime).getTime() - Date.now();
  if (remainingMs <= 0) {
    return '00d 00h 00m 00s';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

export function isGameweekStarted(gameweek) {
  return Boolean(gameweek?.first_fixture_kickoff_at)
    && Date.now() >= new Date(gameweek.first_fixture_kickoff_at).getTime();
}

export async function loadActiveGameweek(league) {
  const { data: gameweeks, error: gameweekError } = await supabase
    .from('gameweek_deadlines')
    .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at, star_man_locks_at')
    .eq('season_id', league.season_id)
    .order('gameweek_number', { ascending: true });

  if (gameweekError) {
    throw gameweekError;
  }

  const eligibleGameweeks = (gameweeks || [])
    .filter((gameweek) => Number(gameweek.gameweek_id) >= Number(league.starts_gameweek_id));

  if (!eligibleGameweeks.length) {
    return { activeGameweek: null, fixturesByGameweek: new Map() };
  }

  const gameweekIds = eligibleGameweeks.map((gameweek) => gameweek.gameweek_id);
  const { data: fixtures, error: fixtureError } = await supabase
    .from('fixtures')
    .select('id, gameweek_id, status, kickoff_at, prediction_locks_at')
    .eq('season_id', league.season_id)
    .in('gameweek_id', gameweekIds);

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

  const activeGameweek = eligibleGameweeks.find((gameweek) => {
    const gameweekFixtures = fixturesByGameweek.get(String(gameweek.gameweek_id)) || [];
    const playableFixtures = gameweekFixtures.filter((fixture) => fixture.status !== 'postponed');

    if (!playableFixtures.length) {
      return false;
    }

    return playableFixtures.some((fixture) => fixture.status !== 'final');
  }) || eligibleGameweeks[eligibleGameweeks.length - 1];

  return { activeGameweek, fixturesByGameweek };
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
