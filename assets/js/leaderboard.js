import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';

const body = document.querySelector('[data-leaderboard-body]');
const leagueLink = document.querySelector('[data-league-link]');
const legendModal = document.querySelector('[data-legend-modal]');
const openLegendButton = document.querySelector('[data-open-legend]');
const closeLegendButton = document.querySelector('[data-close-legend]');

function numberValue(value) {
  return Number(value || 0);
}

function avatarMarkup(profile, displayName) {
  const imageUrl = profile?.profile_image_url;
  if (imageUrl?.startsWith('data:image/')) {
    return `<span class="avatar"><img src="${escapeHtml(imageUrl)}" alt=""></span>`;
  }

  const initial = (displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
  return `<span class="avatar">${escapeHtml(initial)}</span>`;
}

function sortRows(rows) {
  return rows.sort((a, b) => (
    numberValue(b.ultimate_champion_points) - numberValue(a.ultimate_champion_points)
    || numberValue(b.correct_scores) - numberValue(a.correct_scores)
    || numberValue(b.correct_results) - numberValue(a.correct_results)
    || numberValue(b.star_man_points) - numberValue(a.star_man_points)
    || numberValue(b.star_man_goals) - numberValue(a.star_man_goals)
    || numberValue(b.star_man_assists) - numberValue(a.star_man_assists)
    || numberValue(a.star_man_yellows) - numberValue(b.star_man_yellows)
    || numberValue(b.star_man_reds) - numberValue(a.star_man_reds)
    || String(a.display_name || '').localeCompare(String(b.display_name || ''), 'en-GB')
  ));
}

function render(rows, profilesById) {
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty">No leaderboard data yet.</td></tr>';
    return;
  }

  body.innerHTML = sortRows(rows).map((row, index) => {
    const displayName = row.display_name || 'Player';
    const profile = profilesById.get(row.user_id);

    return `
      <tr>
        <td class="rank">${index + 1}</td>
        <td>
          <div class="player-cell">
            ${avatarMarkup(profile, displayName)}
            <span class="username">${escapeHtml(displayName)}</span>
          </div>
        </td>
        <td class="uc-cell">${numberValue(row.ultimate_champion_points)}</td>
        <td>${numberValue(row.correct_scores)}</td>
        <td>${numberValue(row.correct_results)}</td>
        <td>${numberValue(row.star_man_points)}</td>
        <td>${numberValue(row.star_man_goals)}</td>
        <td>${numberValue(row.star_man_assists)}</td>
        <td>${numberValue(row.star_man_yellows)}</td>
        <td>${numberValue(row.star_man_reds)}</td>
      </tr>
    `;
  }).join('');
}

async function loadLeaderboard() {
  const context = await loadLeagueContext();
  if (context.error) {
    body.innerHTML = `<tr><td colspan="10" class="empty">${escapeHtml(context.error)}</td></tr>`;
    return;
  }

  leagueLink.href = leagueUrl('league.html', context.league.id);

  const { data: rows, error } = await supabase
    .from('leaderboard')
    .select('competition_id, user_id, display_name, ultimate_champion_points, correct_scores, correct_results, star_man_points, star_man_goals, star_man_assists, star_man_yellows, star_man_reds')
    .eq('competition_id', context.league.id);

  if (error) {
    body.innerHTML = `<tr><td colspan="10" class="empty">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const userIds = (rows || []).map((row) => row.user_id);
  const profilesById = new Map();

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, profile_image_url')
      .in('id', userIds);

    (profiles || []).forEach((profile) => {
      profilesById.set(profile.id, profile);
    });
  }

  render(rows || [], profilesById);
}

loadLeaderboard();

openLegendButton?.addEventListener('click', () => {
  legendModal.classList.add('show');
  legendModal.setAttribute('aria-hidden', 'false');
});

closeLegendButton?.addEventListener('click', () => {
  legendModal.classList.remove('show');
  legendModal.setAttribute('aria-hidden', 'true');
});

legendModal?.addEventListener('click', (event) => {
  if (event.target === legendModal) {
    legendModal.classList.remove('show');
    legendModal.setAttribute('aria-hidden', 'true');
  }
});
