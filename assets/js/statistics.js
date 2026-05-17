import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';

const grid = document.querySelector('[data-stats-grid]');
const leagueLink = document.querySelector('[data-league-link]');

function numberValue(value) {
  return Number(value || 0);
}

function safeProfileColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#ffffff';
}

function avatar(profile, displayName) {
  const imageUrl = profile?.profile_image_url;
  if (imageUrl?.startsWith('data:image/')) {
    return `<span class="avatar"><img src="${escapeHtml(imageUrl)}" alt=""></span>`;
  }

  return `<span class="avatar">${escapeHtml((displayName || 'P').trim().charAt(0).toUpperCase() || 'P')}</span>`;
}

const statVisuals = {
  uc: '',
  cs: '<span class="symbol tick-green">&#10003;</span>',
  cr: '<span class="symbol tick-amber">&#10003;</span>',
  smp: '<span class="symbol star">&#9733;</span>',
  smg: '<span class="symbol star">&#9733;</span><span class="symbol ball">&#9917;</span>',
  sma: '<span class="symbol star">&#9733;</span><span class="symbol target">&#10166;</span>',
  smy: '<span class="symbol star">&#9733;</span><span class="symbol card yellow"></span>',
  smr: '<span class="symbol star">&#9733;</span><span class="symbol card red"></span>',
};

function statClass(key) {
  if (key === 'uc') {
    return 'uc-stat';
  }
  if (key === 'medals' || key === 'spent') {
    return 'gold-stat';
  }
  if (key === 'games') {
    return 'green-stat game-won-stat';
  }
  return '';
}

function stat(key, label, value) {
  const icons = statVisuals[key] || '';
  return `
    <div class="stat ${statClass(key)}">
      <span class="stat-label">
        ${icons ? `<span class="stat-icons">${icons}</span>` : ''}
        <span>${escapeHtml(label)}</span>
      </span>
      <strong>${numberValue(value)}</strong>
    </div>
  `;
}

function sortRows(rows, currentUserId) {
  return [...rows].sort((a, b) => {
    if (a.user_id === currentUserId) {
      return -1;
    }
    if (b.user_id === currentUserId) {
      return 1;
    }
    return String(a.display_name || 'Player').localeCompare(String(b.display_name || 'Player'));
  });
}

function render(rows, profilesById, medalsByUser, spentByUser, gameCardsWonByUser, currentUserId) {
  if (!rows.length) {
    grid.innerHTML = '<p class="empty">No statistics available yet.</p>';
    return;
  }

  grid.innerHTML = sortRows(rows, currentUserId).map((row) => {
    const displayName = row.display_name || 'Player';
    const profile = profilesById.get(row.user_id);

    return `
      <article class="stats-card">
        <div class="player-head">
          ${avatar(profile, displayName)}
          <h2 style="color: ${safeProfileColor(profile?.favorite_color)}">${escapeHtml(displayName)}</h2>
        </div>
        <div class="stat-list">
          ${stat('uc', 'UC PTS', row.ultimate_champion_points)}
          ${stat('cs', 'Correct Scores', row.correct_scores)}
          ${stat('cr', 'Correct Results', row.correct_results)}
          ${stat('smp', 'Star Man Points', row.star_man_points)}
          ${stat('smg', 'Star Man Goals', row.star_man_goals)}
          ${stat('sma', 'Star Man Assists', row.star_man_assists)}
          ${stat('smy', 'Star Man Yellows', row.star_man_yellows)}
          ${stat('smr', 'Star Man Reds', row.star_man_reds)}
          ${stat('medals', 'Medals Earned', medalsByUser.get(row.user_id) || 0)}
          ${stat('spent', 'Medals Spent', spentByUser.get(row.user_id) || 0)}
          ${stat('games', 'Game Cards Won', gameCardsWonByUser.get(row.user_id) || 0)}
        </div>
      </article>
    `;
  }).join('');
}

async function loadStatistics() {
  const context = await loadLeagueContext();
  if (context.error) {
    grid.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    return;
  }

  leagueLink.href = leagueUrl('league.html', context.league.id);

  await supabase.rpc('sync_my_card_draw_tokens', {
    target_competition_id: context.league.id,
  });

  const [{ data: rows, error }, { data: tokens }, { data: gameCardWins }] = await Promise.all([
    supabase
      .from('leaderboard')
      .select('competition_id, user_id, display_name, ultimate_champion_points, correct_scores, correct_results, star_man_points, star_man_goals, star_man_assists, star_man_yellows, star_man_reds')
      .eq('competition_id', context.league.id),
    supabase
      .from('card_draw_tokens')
      .select('user_id, status')
      .eq('competition_id', context.league.id),
    supabase
      .from('game_card_round_standings')
      .select('user_id, earns_super_medal, completed_gameweeks')
      .eq('competition_id', context.league.id)
      .eq('earns_super_medal', true)
      .gte('completed_gameweeks', 5),
  ]);

  if (error) {
    grid.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    return;
  }

  const userIds = (rows || []).map((row) => row.user_id);
  const profilesById = new Map();

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, profile_image_url, favorite_color')
      .in('id', userIds);

    (profiles || []).forEach((profile) => {
      profilesById.set(profile.id, profile);
    });
  }

  const medalsByUser = new Map();
  const spentByUser = new Map();
  (tokens || []).forEach((token) => {
    if (token.status !== 'void') {
      medalsByUser.set(token.user_id, (medalsByUser.get(token.user_id) || 0) + 1);
    }
    if (token.status === 'redeemed') {
      spentByUser.set(token.user_id, (spentByUser.get(token.user_id) || 0) + 1);
    }
  });

  const gameCardsWonByUser = new Map();
  (gameCardWins || []).forEach((win) => {
    gameCardsWonByUser.set(win.user_id, (gameCardsWonByUser.get(win.user_id) || 0) + 1);
  });

  render(rows || [], profilesById, medalsByUser, spentByUser, gameCardsWonByUser, context.user.id);
}

loadStatistics();
