import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
} from './league-context.js';

const container = document.querySelector('[data-correct-scores]');
const leagueLink = document.querySelector('[data-league-link]');

function avatarMarkup(profile, displayName) {
  const imageUrl = profile?.profile_image_url;
  if (imageUrl?.startsWith('data:image/')) {
    return `<span class="avatar"><img src="${escapeHtml(imageUrl)}" alt=""></span>`;
  }

  const initial = (displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
  return `<span class="avatar">${escapeHtml(initial)}</span>`;
}

function render(members, scoresByUser) {
  if (!members.length) {
    container.innerHTML = '<p class="empty">No league members found.</p>';
    return;
  }

  container.innerHTML = members.map((member) => {
    const profile = normaliseNested(member.profiles);
    const displayName = profile?.display_name || 'Player';
    const scores = scoresByUser.get(member.user_id) || [];

    return `
      <article class="player-card">
        <div class="player-head">
          ${avatarMarkup(profile, displayName)}
          <h2>${escapeHtml(displayName)}</h2>
        </div>
        <div class="score-list">
          ${scores.length ? scores.map((score) => `
            <div class="score-row">
              <strong>GW${escapeHtml(score.gameweek_number)}</strong>
              <span>${escapeHtml(score.home_team)} v ${escapeHtml(score.away_team)}</span>
              <strong>${escapeHtml(score.actual_home_goals)}-${escapeHtml(score.actual_away_goals)}</strong>
            </div>
          `).join('') : '<p class="empty">No Correct Scores</p>'}
        </div>
      </article>
    `;
  }).join('');
}

async function loadCorrectScores() {
  const context = await loadLeagueContext();
  if (context.error) {
    container.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    return;
  }

  leagueLink.href = leagueUrl('league.html', context.league.id);

  const [{ data: members, error: memberError }, { data: scores, error: scoreError }] = await Promise.all([
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(id, display_name, profile_image_url)')
      .eq('competition_id', context.league.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('correct_scores')
      .select('competition_id, user_id, fixture_id, gameweek_number, home_team, away_team, actual_home_goals, actual_away_goals')
      .eq('competition_id', context.league.id)
      .order('gameweek_number', { ascending: true }),
  ]);

  if (memberError || scoreError) {
    container.innerHTML = `<p class="empty">${escapeHtml(memberError?.message || scoreError?.message)}</p>`;
    return;
  }

  const scoresByUser = new Map();
  const seen = new Set();
  (scores || []).forEach((score) => {
    const key = `${score.user_id}:${score.fixture_id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const group = scoresByUser.get(score.user_id) || [];
    group.push(score);
    scoresByUser.set(score.user_id, group);
  });

  render(members || [], scoresByUser);
}

loadCorrectScores();
