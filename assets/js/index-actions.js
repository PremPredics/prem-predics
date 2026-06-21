import { escapeHtml, leagueUrl, normaliseNested } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const panel = document.querySelector('[data-home-action-panel]');
const list = document.querySelector('[data-home-action-list]');
const HOME_ACTION_STYLE_ID = 'prem-predics-home-action-style';

function injectHomeActionStyles() {
  if (document.getElementById(HOME_ACTION_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = HOME_ACTION_STYLE_ID;
  style.textContent = `
    .home-action-row {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 10px !important;
      padding: 10px !important;
      border-radius: 13px !important;
    }

    .home-action-league-pill {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 9px 9px 9px 16px !important;
      border-radius: 999px !important;
      background:
        radial-gradient(circle at 12% 8%, rgba(255,255,255,0.18), transparent 28%),
        linear-gradient(135deg, rgba(139, 92, 246, 0.78), rgba(91, 33, 182, 0.72)) !important;
      border: 1px solid rgba(233, 213, 255, 0.34) !important;
      box-shadow:
        0 8px 18px rgba(17, 7, 38, 0.22),
        inset 0 1px 0 rgba(255,255,255,0.12) !important;
    }

    .home-action-league-copy {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 1px !important;
      text-align: center !important;
    }

    .home-action-league-name {
      max-width: 100% !important;
      color: #fff !important;
      font-weight: 950 !important;
      line-height: 1.05 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .home-action-gameweek {
      color: #ede9fe !important;
      font-weight: 900 !important;
      line-height: 1.05 !important;
    }

    .home-action-open {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #fff !important;
      font-weight: 950 !important;
      text-decoration: none !important;
      border-radius: 999px !important;
      background:
        radial-gradient(circle at 26% 18%, rgba(255,255,255,0.38), transparent 22%),
        linear-gradient(135deg, #a78bfa, #7c3aed 72%) !important;
      border: 1px solid rgba(255,255,255,0.28) !important;
      text-align: center !important;
      box-shadow:
        0 6px 14px rgba(46, 16, 102, 0.28),
        inset 0 1px 0 rgba(255,255,255,0.18) !important;
    }

    .home-action-status-grid {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }

    .home-action-status-line {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 4px !important;
      min-height: 58px !important;
      padding: 8px 6px !important;
      border-radius: 11px !important;
      background: rgba(17, 7, 38, 0.34) !important;
      border: 1px solid rgba(216, 180, 254, 0.16) !important;
      text-align: center !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.06) !important;
    }

    @media (max-width: 768px) {
      .home-action-league-pill {
        gap: 8px !important;
        padding: 8px 8px 8px 13px !important;
      }

      .home-action-league-name {
        font-size: 13px !important;
      }

      .home-action-gameweek {
        font-size: 10px !important;
      }

      .home-action-open {
        min-width: 56px !important;
        padding: 8px 12px !important;
        font-size: 12px !important;
      }

      .home-action-status-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 5px !important;
      }

      .home-action-status-line {
        min-height: 54px !important;
        padding: 7px 3px !important;
      }

      .home-action-status-line strong,
      .home-action-status {
        font-size: 10.5px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function normaliseActionState(state) {
  if (state === true) {
    return 'complete';
  }
  if (state === false) {
    return 'required';
  }
  return ['complete', 'required', 'na'].includes(state) ? state : 'na';
}

function statusMarkup(state) {
  const actionState = normaliseActionState(state);
  const labels = {
    complete: 'Completed',
    required: 'Action Required',
    na: 'N/A',
  };

  return `<span class="home-action-status ${actionState}">${labels[actionState]}</span>`;
}

function actionStatus(label, state) {
  return `
    <span class="home-action-status-line">
      <strong>${escapeHtml(label)}:</strong>
      ${statusMarkup(state)}
    </span>
  `;
}

function hasSavedGameCardValue(row) {
  return row?.predicted_value !== null
    && row?.predicted_value !== undefined
    && String(row.predicted_value) !== '';
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

async function gameCardStatus(userId, league, activeGameweek) {
  if (!activeGameweek) {
    return 'na';
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
      return 'na';
    }

    const numberById = new Map((gameweeks || []).map((gameweek) => [String(gameweek.id), Number(gameweek.number)]));
    const activeNumber = Number(activeGameweek.gameweek_number || 0);
    const activeRound = (rounds || []).find((round) => {
      const startNumber = numberById.get(String(round.start_gameweek_id));
      const endNumber = numberById.get(String(round.end_gameweek_id));
      return Number.isFinite(startNumber)
        && Number.isFinite(endNumber)
        && activeNumber >= startNumber
        && activeNumber <= endNumber;
    });

    if (!activeRound) {
      return 'na';
    }

    const { data, error } = await supabase
      .from('game_card_predictions')
      .select('id, predicted_value')
      .eq('round_id', activeRound.id)
      .eq('gameweek_id', activeGameweek.gameweek_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return 'na';
    }

    if (hasSavedGameCardValue(data)) {
      return 'complete';
    }

    return isPast(activeGameweek.star_man_locks_at) ? 'na' : 'required';
  } catch {
    return 'na';
  }
}

async function leagueRow(userId, league) {
  const { activeGameweek } = await loadActiveGameweek(league);
  if (!activeGameweek) {
    return '';
  }

  const [predictionsComplete, starManComplete, gameCardActionStatus] = await Promise.all([
    predictionStatus(userId, league, activeGameweek),
    starManStatus(userId, league, activeGameweek),
    gameCardStatus(userId, league, activeGameweek),
  ]);

  return `
    <div class="home-action-row">
      <div class="home-action-league-pill">
        <span class="home-action-league-copy">
          <strong class="home-action-league-name">${escapeHtml(league.name)}</strong>
          <small class="home-action-gameweek">GW${escapeHtml(activeGameweek.gameweek_number)}</small>
        </span>
        <a class="home-action-open" href="${leagueUrl('league.html', league.id)}">Open</a>
      </div>
      <div class="home-action-status-grid">
        ${actionStatus('Predictions', predictionsComplete)}
        ${actionStatus('Star Man', starManComplete)}
        ${actionStatus('Game Card', gameCardActionStatus)}
      </div>
    </div>
  `;
}

async function boot() {
  if (!panel || !list) {
    return;
  }

  injectHomeActionStyles();

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
