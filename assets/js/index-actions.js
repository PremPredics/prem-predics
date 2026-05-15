import { escapeHtml, leagueUrl, normaliseNested } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const panel = document.querySelector('[data-home-action-panel]');
const list = document.querySelector('[data-home-action-list]');

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function statusMarkup(completed) {
  return `<span class="home-action-status ${completed ? 'complete' : 'required'}">${completed ? 'Completed' : 'Action Required'}</span>`;
}

function actionStatus(label, completed) {
  return `<span class="home-action-status-line"><strong>${escapeHtml(label)}:</strong> ${statusMarkup(completed)}</span>`;
}

async function predictionStatus(userId, league, activeGameweek) {
  const { data: fixtures, error: fixtureError } = await supabase
    .from('fixtures')
    .select('id, prediction_locks_at, status')
    .eq('season_id', league.season_id)
    .eq('gameweek_id', activeGameweek.gameweek_id);

  if (fixtureError) {
    throw fixtureError;
  }

  const playableFixtures = (fixtures || []).filter((fixture) => fixture.status !== 'postponed');
  const openFixtures = playableFixtures.filter((fixture) => !isPast(fixture.prediction_locks_at));
  if (!openFixtures.length) {
    return true;
  }

  const { count, error } = await supabase
    .from('predictions')
    .select('fixture_id', { count: 'exact', head: true })
    .eq('competition_id', league.id)
    .eq('user_id', userId)
    .eq('prediction_slot', 'primary')
    .in('fixture_id', playableFixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  return Number(count || 0) >= playableFixtures.length;
}

async function starManStatus(userId, league, activeGameweek) {
  if (isPast(activeGameweek.star_man_locks_at)) {
    return true;
  }

  const { data, error } = await supabase
    .from('star_man_picks')
    .select('id')
    .eq('competition_id', league.id)
    .eq('user_id', userId)
    .eq('gameweek_id', activeGameweek.gameweek_id)
    .eq('pick_slot', 'primary')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function leagueRow(userId, league) {
  const { activeGameweek } = await loadActiveGameweek(league);
  if (!activeGameweek) {
    return '';
  }

  const [predictionsComplete, starManComplete] = await Promise.all([
    predictionStatus(userId, league, activeGameweek),
    starManStatus(userId, league, activeGameweek),
  ]);

  return `
    <div class="home-action-row">
      <strong>${escapeHtml(league.name)}<br><small>GW${escapeHtml(activeGameweek.gameweek_number)}</small></strong>
      ${actionStatus('Predictions', predictionsComplete)}
      ${actionStatus('Star Man', starManComplete)}
      <a href="${leagueUrl('league.html', league.id)}">Open</a>
    </div>
  `;
}

async function boot() {
  if (!panel || !list) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return;
  }

  const { data, error } = await supabase
    .from('competition_members')
    .select('competitions(id, name, season_id, starts_gameweek_id)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  if (error || !data?.length) {
    return;
  }

  const leagues = data.map((row) => normaliseNested(row.competitions)).filter(Boolean);
  const rows = (await Promise.all(leagues.map((league) => leagueRow(user.id, league))))
    .filter(Boolean);

  if (!rows.length) {
    return;
  }

  list.innerHTML = rows.join('');
  panel.hidden = false;
}

boot().catch(() => {
  if (panel) {
    panel.hidden = true;
  }
});
