import { supabase } from './supabase-client.js';

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

export function getCompetitionIdFromUrl() {
  return new URLSearchParams(window.location.search).get('competition_id');
}

export function leagueUrl(page, competitionId) {
  return `${page}?competition_id=${encodeURIComponent(competitionId)}`;
}

export function formatDateTime(value) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function shortTeamName(name) {
  const teamName = String(name || '');
  const names = {
    'Manchester United': 'Man U',
    'Manchester City': 'Man City',
    'Wolverhampton Wanderers': 'Wolves',
    Wolverhampton: 'Wolves',
    'Nottingham Forest': "Nott'm Forest",
    'Nottigham Forest': "Nott'm Forest",
  };

  return names[teamName] || teamName;
}

export function normaliseNested(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getSignedInUser(redirectPage = 'login.html') {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const currentPage = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}`;
    window.location.href = `${redirectPage}?redirect=${encodeURIComponent(currentPage)}`;
    return null;
  }

  return data.user;
}

export async function loadLeagueContext() {
  const user = await getSignedInUser();
  const competitionId = getCompetitionIdFromUrl();

  if (!user) {
    return { error: 'You need to log in first.' };
  }

  if (!competitionId) {
    return { user, error: 'Choose a private league first.' };
  }

  let { data, error } = await supabase
    .from('competition_members')
    .select('role, joined_at, competitions(id, name, slug, join_code, season_id, starts_gameweek_id, starts_at, member_lock_at, started_at, deck_variant_id, locked_member_count, locked_deck_variant_id)')
    .eq('user_id', user.id)
    .eq('competition_id', competitionId)
    .maybeSingle();

  if (error) {
    return { user, error: error.message };
  }

  if (!data) {
    return { user, error: 'You do not have access to this private league.' };
  }

  const league = normaliseNested(data.competitions);
  const lockTime = league?.member_lock_at ? new Date(league.member_lock_at).getTime() : null;
  if (lockTime && Date.now() >= lockTime && !league.locked_member_count) {
    try {
      await supabase.rpc('sync_competition_member_lock', {
        target_competition_id: competitionId,
      });

      const refreshed = await supabase
        .from('competition_members')
        .select('role, joined_at, competitions(id, name, slug, join_code, season_id, starts_gameweek_id, starts_at, member_lock_at, started_at, deck_variant_id, locked_member_count, locked_deck_variant_id)')
        .eq('user_id', user.id)
        .eq('competition_id', competitionId)
        .maybeSingle();

      if (!refreshed.error && refreshed.data) {
        data = refreshed.data;
      }
    } catch {
      // Older Supabase projects may not have this helper until the latest SQL is run.
    }
  }

  return {
    user,
    membership: data,
    league: normaliseNested(data.competitions),
  };
}
