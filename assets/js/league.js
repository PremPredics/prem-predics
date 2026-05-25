import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import { isGameweekStarted, loadActiveGameweek, startCountdown } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const leagueName = document.querySelector('[data-league-name]');
const memberCount = document.querySelector('[data-member-count]');
const joinCode = document.querySelector('[data-join-code]');
const copyJoinCodeButton = document.querySelector('[data-copy-join-code]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const gameweekCountdown = document.querySelector('[data-gameweek-countdown]');
const gameweekCard = document.querySelector('[data-gameweek-card]');
const deadlineStrip = document.querySelector('[data-deadline-strip]');
const playGrid = document.querySelector('[data-play-grid]');
const profileLink = document.querySelector('[data-profile-link]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
let deadlineTimer = null;

function renderError(error) {
  leagueName.textContent = 'Private league unavailable';
  gameweekLabel.textContent = error;
  gameweekCountdown.textContent = '--d --h --m --s';
  gameweekCard?.classList.remove('is-active', 'is-countdown');
  joinCode.textContent = '-';
  if (memberCount) {
    memberCount.textContent = '';
  }
  playGrid.innerHTML = '';
  if (deadlineStrip) {
    deadlineStrip.innerHTML = '';
  }
}

function renderProfileAvatar(profile, user) {
  if (!profileAvatar) {
    return;
  }

  const imageUrl = profile?.profile_image_url || '';
  if (imageUrl) {
    profileAvatar.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="">`;
    return;
  }

  const fallback = profile?.display_name || user?.email || 'P';
  profileAvatar.textContent = fallback.trim().charAt(0).toUpperCase() || 'P';
}

async function loadOwnProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, profile_image_url')
    .eq('id', user.id)
    .maybeSingle();

  if (!error) {
    renderProfileAvatar(data, user);
  } else {
    renderProfileAvatar(null, user);
  }
}

function earliestTime(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0] || null;
}

function isoFromMs(value) {
  return value ? new Date(value).toISOString() : null;
}

function compactCountdownText(value) {
  if (!value) {
    return 'Not Set';
  }

  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Locked';
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}hr ${minutes}m` : `${minutes}m`;
}

function deadlineDisplay(value, options = {}) {
  if (options.enabled === false) {
    return {
      className: 'disabled',
      action: '',
      countdown: 'Disabled',
    };
  }

  if (!value) {
    return {
      className: 'disabled',
      action: '',
      countdown: 'Not Set',
    };
  }

  const locked = Date.now() >= new Date(value).getTime();
  const countdown = compactCountdownText(value);

  if (options.windowOnly) {
    return {
      className: locked ? 'bad locked' : 'good',
      action: '',
      countdown,
    };
  }

  if (locked && !options.completed) {
    return {
      className: 'bad locked',
      action: '',
      countdown,
    };
  }

  if (!options.completed) {
    return {
      className: 'action',
      action: 'Action Required',
      countdown,
    };
  }

  return {
    className: 'good',
    action: '',
    countdown,
  };
}

function renderDeadlineCard(label, value, options = {}) {
  const display = deadlineDisplay(value, options);

  return `
    <div class="deadline-card ${escapeHtml(display.className)}">
      <span class="deadline-title">${escapeHtml(label)}</span>
      <div class="deadline-body">
        <span class="deadline-action">${escapeHtml(display.action || '')}</span>
        <strong class="deadline-countdown">${escapeHtml(display.countdown)}</strong>
        <span class="deadline-light" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

async function loadPredictionCompletion(league, user, fixtures) {
  const activeFixtures = fixtures.filter((fixture) => fixture.status !== 'postponed');
  if (!activeFixtures.length) {
    return false;
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('fixture_id, home_goals, away_goals')
    .eq('competition_id', league.id)
    .eq('season_id', league.season_id)
    .eq('user_id', user.id)
    .eq('prediction_slot', 'primary')
    .in('fixture_id', activeFixtures.map((fixture) => fixture.id));

  if (error) {
    return false;
  }

  const completedFixtureIds = new Set((data || [])
    .filter((prediction) => Number.isFinite(Number(prediction.home_goals)) && Number.isFinite(Number(prediction.away_goals)))
    .map((prediction) => prediction.fixture_id));

  return activeFixtures.every((fixture) => completedFixtureIds.has(fixture.id));
}

async function loadStarManCompletion(league, user, activeGameweek) {
  if (!activeGameweek) {
    return false;
  }

  const { data, error } = await supabase
    .from('star_man_picks')
    .select('id')
    .eq('competition_id', league.id)
    .eq('season_id', league.season_id)
    .eq('gameweek_id', activeGameweek.gameweek_id)
    .eq('user_id', user.id)
    .eq('pick_slot', 'primary')
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.id);
}

async function loadGameCardCompletion(league, user, activeGameweek) {
  if (!activeGameweek) {
    return { enabled: false, completed: false };
  }

  try {
    await supabase.rpc('ensure_game_card_rounds', {
      target_competition_id: league.id,
    });

    const [{ data: gameweeks, error: gameweekError }, { data: rounds, error: roundError }] = await Promise.all([
      supabase
        .from('gameweeks')
        .select('id, number')
        .eq('season_id', league.season_id),
      supabase
        .from('game_card_rounds')
        .select('id, start_gameweek_id, end_gameweek_id, status')
        .eq('competition_id', league.id)
        .eq('season_id', league.season_id)
        .order('round_number', { ascending: true }),
    ]);

    if (gameweekError || roundError) {
      return { enabled: false, completed: false };
    }

    const numberById = new Map((gameweeks || []).map((gameweek) => [String(gameweek.id), Number(gameweek.number)]));
    const activeNumber = Number(activeGameweek.gameweek_number || 0);
    const activeRound = (rounds || []).find((round) => {
      const startNumber = numberById.get(String(round.start_gameweek_id));
      const endNumber = numberById.get(String(round.end_gameweek_id));
      return activeNumber >= startNumber && activeNumber <= endNumber;
    });

    if (!activeRound) {
      return { enabled: false, completed: false };
    }

    const { data, error } = await supabase
      .from('game_card_predictions')
      .select('id, predicted_value')
      .eq('round_id', activeRound.id)
      .eq('gameweek_id', activeGameweek.gameweek_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return { enabled: true, completed: false };
    }

    return {
      enabled: true,
      completed: data?.predicted_value !== null && data?.predicted_value !== undefined && String(data.predicted_value) !== '',
    };
  } catch {
    return { enabled: false, completed: false };
  }
}

async function renderDeadlineStrip(activeGameweek, fixtures, league, user) {
  if (!deadlineStrip) {
    return;
  }

  if (deadlineTimer) {
    window.clearInterval(deadlineTimer);
    deadlineTimer = null;
  }

  const firstKickoffMs = earliestTime(fixtures.map((fixture) => fixture.kickoff_at));
  const predictionDeadlineMs = firstKickoffMs ? firstKickoffMs - (90 * 60 * 1000) : earliestTime(fixtures.map((fixture) => fixture.prediction_locks_at));
  const curseDeadlineMs = firstKickoffMs ? firstKickoffMs - (24 * 60 * 60 * 1000) : null;
  const starDeadline = activeGameweek?.star_man_locks_at || isoFromMs(predictionDeadlineMs);
  const gameweekLabelText = `GW${activeGameweek?.gameweek_number || 'X'}`;
  const [predictionsCompleted, starManCompleted, gameCardCompletion] = await Promise.all([
    loadPredictionCompletion(league, user, fixtures),
    loadStarManCompletion(league, user, activeGameweek),
    loadGameCardCompletion(league, user, activeGameweek),
  ]);

  function update() {
    deadlineStrip.innerHTML = [
      renderDeadlineCard(`${gameweekLabelText} Predictions Deadline`, isoFromMs(predictionDeadlineMs), { completed: predictionsCompleted }),
      renderDeadlineCard(`${gameweekLabelText} Star Man Deadline`, starDeadline, { completed: starManCompleted }),
      renderDeadlineCard(`${gameweekLabelText} Game Card Deadline`, starDeadline, { completed: gameCardCompletion.completed, enabled: gameCardCompletion.enabled }),
      renderDeadlineCard('Play Power Card Deadline', isoFromMs(predictionDeadlineMs), { windowOnly: true }),
      renderDeadlineCard('Play Curse Card Deadline', isoFromMs(curseDeadlineMs), { windowOnly: true }),
    ].join('');
  }

  update();
  deadlineTimer = window.setInterval(update, 1000);
}

async function copyJoinCode() {
  const code = joinCode.textContent.trim();
  if (!code || code === '-' || code === '...') {
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    copyJoinCodeButton.textContent = 'Copied';
    setTimeout(() => {
      copyJoinCodeButton.textContent = 'Copy';
    }, 1400);
  } catch {
    copyJoinCodeButton.textContent = code;
  }
}

async function renderLeague(league, user) {
  const { activeGameweek, fixturesByGameweek } = await loadActiveGameweek(league);
  const gameweekNumber = activeGameweek?.gameweek_number || 'X';
  const pages = [
    {
      page: 'prediction-hub.html',
      title: 'Predictions',
      detail: `Submit your Score Predictions for Gameweek ${gameweekNumber}.`,
      accent: '#00e5ff',
      tier: 'primary',
    },
    {
      page: 'star-man-hub.html',
      title: 'Star Man',
      detail: `Submit your Star Man for Gameweek ${gameweekNumber}.`,
      accent: '#facc15',
      tier: 'primary',
    },
    {
      page: 'power-cards.html',
      title: 'Power Cards',
      detail: 'Play/View/Draw Cards against Opponents.',
      accent: '#fb7185',
      tier: 'game',
    },
    {
      page: 'game-card.html',
      title: 'Game Cards',
      detail: 'View active Game Card.',
      accent: '#34d399',
      tier: 'game',
    },
    {
      page: 'medals.html',
      title: 'Medals',
      detail: 'View medals earned this season.',
      accent: '#f59e0b',
      tier: 'game',
    },
    {
      page: 'leaderboard.html',
      title: 'Leaderboard',
      detail: 'View Leaderboard.',
      accent: '#a78bfa',
      tier: 'reference',
    },
    {
      page: 'statistics.html',
      title: 'Statistics',
      detail: 'View Statistics.',
      accent: '#22d3ee',
      tier: 'reference',
    },
    {
      page: 'correct-scores.html',
      title: 'Correct Scores',
      detail: 'View all Correct Scores.',
      accent: '#f472b6',
      tier: 'reference',
    },
  ];

  leagueName.textContent = league.name;
  joinCode.textContent = league.join_code;
  if (memberCount) {
    const { count, error } = await supabase
      .from('competition_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('competition_id', league.id);

    memberCount.textContent = error ? '' : `(${count || 0} Active Players)`;
  }
  if (profileLink) {
    profileLink.href = leagueUrl('profile.html', league.id);
  }
  await loadOwnProfile(user);

  if (activeGameweek) {
    const activeFixtures = fixturesByGameweek.get(String(activeGameweek.gameweek_id)) || [];
    await renderDeadlineStrip(activeGameweek, activeFixtures.filter((fixture) => fixture.status !== 'postponed'), league, user);
    gameweekCountdown.classList.remove('active-gameweek');
    if (isGameweekStarted(activeGameweek)) {
      gameweekLabel.textContent = 'Current Gameweek:';
      gameweekCountdown.textContent = `Gameweek ${activeGameweek.gameweek_number} Is Active`;
      gameweekCountdown.classList.add('active-gameweek');
      gameweekCard?.classList.add('is-active');
      gameweekCard?.classList.remove('is-countdown');
    } else {
      gameweekLabel.textContent = `Next Gameweek ${activeGameweek.gameweek_number}`;
      gameweekCard?.classList.add('is-countdown');
      gameweekCard?.classList.remove('is-active');
      startCountdown(gameweekCountdown, activeGameweek);
    }
  } else {
    gameweekCountdown.classList.remove('active-gameweek');
    gameweekCard?.classList.remove('is-active', 'is-countdown');
    gameweekLabel.textContent = 'No active gameweek found';
    gameweekCountdown.textContent = '--d --h --m --s';
    if (deadlineStrip) {
      deadlineStrip.innerHTML = '';
    }
  }

  const groupedPages = ['primary', 'game', 'reference'].map((tier) => pages.filter((item) => item.tier === tier));
  playGrid.innerHTML = groupedPages.map((group) => `
    <div class="play-group ${escapeHtml(group[0]?.tier || '')}">
      ${group.map((item) => `
        <a class="play-card" href="${leagueUrl(item.page, league.id)}" style="--accent: ${item.accent}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail)}</span>
        </a>
      `).join('')}
    </div>
  `).join('');
}

const context = await loadLeagueContext();
if (context.error) {
  renderError(context.error);
} else {
  try {
    await renderLeague(context.league, context.user);
  } catch (error) {
    renderError(error.message || 'Could not load this private league.');
  }
}

copyJoinCodeButton?.addEventListener('click', copyJoinCode);
