import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import { isGameweekStarted, loadActiveGameweek, startCountdown } from './gameweek-context.js';

const leagueName = document.querySelector('[data-league-name]');
const joinCode = document.querySelector('[data-join-code]');
const copyJoinCodeButton = document.querySelector('[data-copy-join-code]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const gameweekCountdown = document.querySelector('[data-gameweek-countdown]');
const playGrid = document.querySelector('[data-play-grid]');

function renderError(error) {
  leagueName.textContent = 'Private league unavailable';
  gameweekLabel.textContent = error;
  gameweekCountdown.textContent = '--d --h --m --s';
  joinCode.textContent = '-';
  playGrid.innerHTML = '';
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
  const { activeGameweek } = await loadActiveGameweek(league);
  const pages = [
    {
      page: 'predictions.html',
      title: 'Predictions',
      detail: 'Submit this gameweek score predictions.',
    },
    {
      page: 'star-man.html',
      title: 'Star Man',
      detail: 'Choose your Star Man for the active gameweek.',
    },
    {
      page: 'power-cards.html',
      title: 'Power Cards',
      detail: 'Draw, view, and play league-specific cards.',
    },
    {
      page: 'game-card.html',
      title: 'Game Card',
      detail: 'Submit active Game Card predictions and view results.',
    },
    {
      page: 'medals.html',
      title: 'Medals',
      detail: 'View medals earned this season.',
    },
    {
      page: 'leaderboard.html',
      title: 'Leaderboard',
      detail: 'View this league leaderboard.',
    },
    {
      page: 'statistics.html',
      title: 'Statistics',
      detail: 'View this league statistics page.',
    },
    {
      page: 'correct-scores.html',
      title: 'Correct Scores',
      detail: 'View this league correct scores page.',
    },
  ];

  leagueName.textContent = league.name;
  joinCode.textContent = league.join_code;

  if (activeGameweek) {
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
  }

  playGrid.innerHTML = pages.map((item) => `
    <a class="play-card" href="${leagueUrl(item.page, league.id)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </a>
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
