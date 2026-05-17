import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import { countdownText, isGameweekStarted, loadActiveGameweek, startCountdown } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const leagueName = document.querySelector('[data-league-name]');
const memberCount = document.querySelector('[data-member-count]');
const joinCode = document.querySelector('[data-join-code]');
const copyJoinCodeButton = document.querySelector('[data-copy-join-code]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const gameweekCountdown = document.querySelector('[data-gameweek-countdown]');
const deadlineStrip = document.querySelector('[data-deadline-strip]');
const playGrid = document.querySelector('[data-play-grid]');
const profileLink = document.querySelector('[data-profile-link]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
let deadlineTimer = null;

function renderError(error) {
  leagueName.textContent = 'Private league unavailable';
  gameweekLabel.textContent = error;
  gameweekCountdown.textContent = '--d --h --m --s';
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

function deadlineDisplay(value, options = {}) {
  if (!value) {
    return {
      className: 'unset',
      countdown: '',
      status: 'Not set',
    };
  }

  if (Date.now() >= new Date(value).getTime()) {
    return {
      className: 'locked',
      countdown: '',
      status: 'Locked',
    };
  }

  if (options.type === 'curse') {
    return {
      className: 'playable',
      countdown: countdownText(value),
      status: 'Playable',
    };
  }

  if (options.completed) {
    return {
      className: 'complete',
      countdown: countdownText(value),
      status: 'Completed',
    };
  }

  return {
    className: 'action',
    countdown: countdownText(value),
    status: 'Action Required',
  };
}

function renderDeadlineCard(label, value, options = {}) {
  const display = deadlineDisplay(value, options);
  const body = display.countdown
    ? `
      <span class="deadline-countdown">${escapeHtml(display.countdown)}</span>
      <strong class="deadline-status">${escapeHtml(display.status)}</strong>
    `
    : `<strong class="deadline-status">${escapeHtml(display.status)}</strong>`;

  return `
    <div class="deadline-card ${escapeHtml(display.className)}">
      <span class="deadline-title">${escapeHtml(label)}</span>
      <div class="deadline-body">${body}</div>
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
  const [predictionsCompleted, starManCompleted] = await Promise.all([
    loadPredictionCompletion(league, user, fixtures),
    loadStarManCompletion(league, user, activeGameweek),
  ]);

  function update() {
    deadlineStrip.innerHTML = [
      renderDeadlineCard('Predictions Deadline', isoFromMs(predictionDeadlineMs), { completed: predictionsCompleted }),
      renderDeadlineCard('Star Man Deadline', starDeadline, { completed: starManCompleted }),
      renderDeadlineCard('Curse Card Deadline', isoFromMs(curseDeadlineMs), { type: 'curse' }),
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
    } else {
      gameweekLabel.textContent = `Next Gameweek ${activeGameweek.gameweek_number}`;
      startCountdown(gameweekCountdown, activeGameweek);
    }
  } else {
    gameweekCountdown.classList.remove('active-gameweek');
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
