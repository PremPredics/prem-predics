import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';

const container = document.querySelector('[data-correct-scores]');
const leagueLink = document.querySelector('[data-league-link]');
const playerPills = document.querySelector('[data-player-pills]');
const title = document.querySelector('[data-correct-score-title]');

const state = {
  user: null,
  league: null,
  members: [],
  scoresByUser: new Map(),
  selectedUserId: null,
};

function avatarMarkup(member) {
  const imageUrl = member.profile_image_url?.startsWith('data:image/')
    ? member.profile_image_url
    : null;

  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="">`;
  }

  return escapeHtml((member.display_name || 'P').trim().charAt(0).toUpperCase() || 'P');
}

function selectedMember() {
  return state.members.find((member) => member.user_id === state.selectedUserId) || state.members[0] || null;
}

function renderPlayerPills() {
  playerPills.innerHTML = state.members.map((member) => `
    <button class="player-pill ${member.user_id === state.selectedUserId ? 'active' : ''}" type="button" data-user-id="${member.user_id}" title="${escapeHtml(member.display_name)}">
      ${avatarMarkup(member)}
    </button>
  `).join('');

  playerPills.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedUserId = button.dataset.userId;
      render();
    });
  });
}

function render() {
  if (!state.members.length) {
    title.textContent = 'Correct Scores';
    container.innerHTML = '<p class="empty">No league members found.</p>';
    return;
  }

  const member = selectedMember();
  const scores = state.scoresByUser.get(member.user_id) || [];

  renderPlayerPills();
  title.textContent = `${member.display_name}'s Correct Scores`;

  if (!scores.length) {
    container.innerHTML = '<p class="empty">No Correct Scores</p>';
    return;
  }

  container.innerHTML = scores.map((score) => {
    return `
      <div class="correct-score-row">
        <span class="correct-gw-pill">GW${escapeHtml(score.gameweek_number)}</span>
        <span class="correct-fixture">
          <span class="correct-team correct-home">${escapeHtml(shortTeamName(score.home_team))}</span>
          <strong class="correct-scoreline">${escapeHtml(score.actual_home_goals)}-${escapeHtml(score.actual_away_goals)}</strong>
          <span class="correct-team correct-away">${escapeHtml(shortTeamName(score.away_team))}</span>
        </span>
      </div>
    `;
  }).join('');
}

async function loadCorrectScores() {
  const context = await loadLeagueContext();
  if (context.error) {
    container.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    return;
  }

  state.user = context.user;
  state.league = context.league;
  leagueLink.href = leagueUrl('league.html', context.league.id);

  const [{ data: members, error: memberError }, { data: scores, error: scoreError }] = await Promise.all([
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(id, display_name, profile_image_url, favorite_color)')
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

  state.members = (members || [])
    .map((member) => {
      const profile = normaliseNested(member.profiles);
      return {
        user_id: member.user_id,
        joined_at: member.joined_at,
        display_name: profile?.display_name || 'Player',
        profile_image_url: profile?.profile_image_url || null,
      };
    })
    .sort((a, b) => {
      if (a.user_id === context.user.id) return -1;
      if (b.user_id === context.user.id) return 1;
      return String(a.display_name).localeCompare(String(b.display_name), 'en-GB');
    });

  state.scoresByUser = new Map();
  const seen = new Set();
  (scores || []).forEach((score) => {
    const key = `${score.user_id}:${score.fixture_id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const group = state.scoresByUser.get(score.user_id) || [];
    group.push(score);
    state.scoresByUser.set(score.user_id, group);
  });

  state.selectedUserId = context.user.id;
  render();
}

loadCorrectScores();
