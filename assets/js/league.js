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

function earliestTime(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0] || null;
}

function renderDeadlineCard(label, value) {
  const locked = value && Date.now() >= new Date(value).getTime();
  const text = value ? (locked ? 'Locked' : countdownText(value)) : 'Not set';
  return `
    <div class="deadline-card ${locked ? 'locked' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(text)}</strong>
    </div>
  `;
}

function renderDeadlineStrip(activeGameweek, fixtures) {
  if (!deadlineStrip) {
    return;
  }

  if (deadlineTimer) {
    window.clearInterval(deadlineTimer);
    deadlineTimer = null;
  }

  const firstKickoffMs = earliestTime(fixtures.map((fixture) => fixture.kickoff_at));
  const firstPredictionLockMs = earliestTime(fixtures.map((fixture) => fixture.prediction_locks_at));
  const curseDeadlineMs = firstKickoffMs ? firstKickoffMs - (24 * 60 * 60 * 1000) : null;
  const starDeadline = activeGameweek?.star_man_locks_at || null;

  function update() {
    deadlineStrip.innerHTML = [
      renderDeadlineCard('Predictions Deadline', firstPredictionLockMs ? new Date(firstPredictionLockMs).toISOString() : null),
      renderDeadlineCard('Star Man Deadline', starDeadline),
      renderDeadlineCard('Curse Card Deadline', curseDeadlineMs ? new Date(curseDeadlineMs).toISOString() : null),
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

async function renderLeague(league) {
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
      page: 'star-man.html',
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

  if (activeGameweek) {
    const activeFixtures = fixturesByGameweek.get(String(activeGameweek.gameweek_id)) || [];
    renderDeadlineStrip(activeGameweek, activeFixtures.filter((fixture) => fixture.status !== 'postponed'));
    if (isGameweekStarted(activeGameweek)) {
      gameweekLabel.textContent = 'Current Gameweek';
      gameweekCountdown.textContent = `Gameweek ${activeGameweek.gameweek_number} Is Active`;
    } else {
      gameweekLabel.textContent = `Next Gameweek ${activeGameweek.gameweek_number}`;
      startCountdown(gameweekCountdown, activeGameweek);
    }
  } else {
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
    await renderLeague(context.league);
  } catch (error) {
    renderError(error.message || 'Could not load this private league.');
  }
}

copyJoinCodeButton?.addEventListener('click', copyJoinCode);
