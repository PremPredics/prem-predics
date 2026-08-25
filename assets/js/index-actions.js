import { escapeHtml, leagueUrl, normaliseNested } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const panel = document.querySelector('[data-home-action-panel]');
const list = document.querySelector('[data-home-action-list]');
const HOME_ACTION_STYLE_ID = 'prem-predics-home-action-style';
let actionCountdownTimer = null;
let deadlineRefreshQueued = false;

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
      border: 3px solid #f5d76e !important;
      box-shadow:
        0 0 18px rgba(245, 215, 110, 0.82),
        0 0 42px rgba(250, 204, 21, 0.46),
        0 0 72px rgba(255, 244, 184, 0.24),
        inset 0 1px 0 rgba(255,255,255,0.12) !important;
    }

    .home-action-title {
      color: #fff !important;
      text-shadow:
        -1px -1px 0 rgba(0,0,0,0.95),
        1px -1px 0 rgba(0,0,0,0.95),
        -1px 1px 0 rgba(0,0,0,0.95),
        1px 1px 0 rgba(0,0,0,0.95) !important;
    }

    .home-action-league-pill {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 9px 9px 9px 16px !important;
      border-radius: 999px !important;
      background:
        radial-gradient(circle at 12% 12%, rgba(255,255,255,0.18), transparent 22%),
        linear-gradient(135deg, #9a12d3, #8a00c4 62%, #7600aa) !important;
      border: 1px solid rgba(232, 170, 255, 0.66) !important;
      box-shadow:
        0 0 17px rgba(218, 0, 255, 0.46),
        0 8px 18px rgba(17, 7, 38, 0.22),
        inset 0 1px 0 rgba(255,255,255,0.18) !important;
    }

    .home-action-league-copy {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      text-align: center !important;
      white-space: nowrap !important;
    }

    .home-action-league-details {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 1px !important;
    }

    .home-action-league-name {
      max-width: 100% !important;
      color: #fff !important;
      font-weight: 1000 !important;
      line-height: 1.05 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .home-action-member-count {
      max-width: 100% !important;
      color: rgba(237, 233, 254, 0.72) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      line-height: 1 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .home-action-gameweek {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 2px 7px !important;
      border-radius: 999px !important;
      background: rgba(17, 7, 38, 0.28) !important;
      color: #ede9fe !important;
      font-weight: 1000 !important;
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
        radial-gradient(circle at 26% 18%, rgba(255,255,255,0.48), transparent 22%),
        linear-gradient(135deg, #34d399, #16a34a 62%, #047857) !important;
      border: 1px solid rgba(187, 247, 208, 0.72) !important;
      text-align: center !important;
      box-shadow:
        0 0 18px rgba(34, 197, 94, 0.42),
        0 6px 14px rgba(6, 78, 59, 0.28),
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
      height: 58px !important;
      min-height: 58px !important;
      padding: 8px 6px !important;
      border-radius: 11px !important;
      background: #8a00c4 !important;
      border: 1px solid rgba(232, 170, 255, 0.58) !important;
      text-align: center !important;
      box-shadow:
        0 0 15px rgba(218, 0, 255, 0.46),
        inset 0 1px 0 rgba(255,255,255,0.16) !important;
    }

    .home-action-countdown {
      color: #fde68a !important;
      font-size: 9px !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      white-space: nowrap !important;
      text-shadow: 0 0 8px rgba(250, 204, 21, 0.34) !important;
    }

    @media (max-width: 768px) {
      .home-action-league-pill {
        gap: 8px !important;
        padding: 8px 8px 8px 13px !important;
      }

      .home-action-league-name {
        font-size: 13.5px !important;
      }

      .home-action-member-count {
        font-size: 8.5px !important;
      }

      .home-action-gameweek {
        font-size: 10.5px !important;
        padding: 2px 6px !important;
      }

      .home-action-open {
        min-width: 62px !important;
        padding: 8px 12px !important;
        font-size: 12px !important;
      }

      .home-action-status-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 5px !important;
      }

      .home-action-status-line {
        height: 54px !important;
        min-height: 54px !important;
        padding: 7px 3px !important;
      }

      .home-action-status-line strong,
      .home-action-status {
        font-size: 10.5px !important;
      }

      .home-action-countdown {
        font-size: 8.5px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function earliestDeadline(fixtures) {
  return fixtures
    .map((fixture) => ({
      value: fixture.prediction_locks_at,
      time: new Date(fixture.prediction_locks_at).getTime(),
    }))
    .filter((deadline) => deadline.value && Number.isFinite(deadline.time))
    .sort((a, b) => a.time - b.time)[0]?.value || null;
}

function actionCountdownText(value) {
  const remainingMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '0m 00s';
  }

  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function startActionCountdowns() {
  if (actionCountdownTimer) {
    window.clearInterval(actionCountdownTimer);
    actionCountdownTimer = null;
  }

  function update() {
    let deadlineReached = false;
    const countdowns = list.querySelectorAll('[data-home-action-deadline]');
    countdowns.forEach((countdown) => {
      const deadline = countdown.dataset.homeActionDeadline;
      const remainingMs = new Date(deadline).getTime() - Date.now();
      countdown.textContent = actionCountdownText(deadline);
      deadlineReached ||= Number.isFinite(remainingMs) && remainingMs <= 0;
    });

    if (deadlineReached && !deadlineRefreshQueued) {
      deadlineRefreshQueued = true;
      if (actionCountdownTimer) {
        window.clearInterval(actionCountdownTimer);
        actionCountdownTimer = null;
      }
      window.setTimeout(() => {
        deadlineRefreshQueued = false;
        boot();
      }, 250);
    }

    return countdowns.length;
  }

  if (update()) {
    actionCountdownTimer = window.setInterval(update, 1000);
  }
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

function statusMarkup(result) {
  const state = result && typeof result === 'object' ? result.state : result;
  const deadline = result && typeof result === 'object' ? result.deadline : null;
  const actionState = normaliseActionState(state);
  const labels = {
    complete: 'Completed',
    required: 'Action Required',
    na: 'N/A',
  };

  const hasCountdown = actionState === 'required'
    && deadline
    && Number.isFinite(new Date(deadline).getTime());
  const countdownMarkup = hasCountdown
    ? `<small class="home-action-countdown" data-home-action-deadline="${escapeHtml(deadline)}">${escapeHtml(actionCountdownText(deadline))}</small>`
    : '';

  return `<span class="home-action-status ${actionState}">${labels[actionState]}</span>${countdownMarkup}`;
}

function actionStatus(label, result) {
  return `
    <span class="home-action-status-line">
      <strong>${escapeHtml(label)}:</strong>
      ${statusMarkup(result)}
    </span>
  `;
}

function hasSavedGameCardValue(row) {
  return row?.predicted_value !== null
    && row?.predicted_value !== undefined
    && String(row.predicted_value) !== '';
}

function memberCountsByLeague(memberRows) {
  return (memberRows || []).reduce((counts, member) => {
    const key = String(member.competition_id);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
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
    return { state: 'complete', deadline: null };
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('fixture_id')
    .eq('competition_id', league.id)
    .eq('user_id', userId)
    .eq('prediction_slot', 'primary')
    .in('fixture_id', openFixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  const predictedFixtureIds = new Set((data || []).map((prediction) => String(prediction.fixture_id)));
  const missingOpenFixtures = openFixtures.filter((fixture) => !predictedFixtureIds.has(String(fixture.id)));
  return missingOpenFixtures.length
    ? { state: 'required', deadline: earliestDeadline(missingOpenFixtures) }
    : { state: 'complete', deadline: null };
}

async function starManStatus(userId, league, activeGameweek) {
  if (isPast(activeGameweek.star_man_locks_at)) {
    return { state: 'complete', deadline: null };
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

  return data
    ? { state: 'complete', deadline: null }
    : { state: 'required', deadline: activeGameweek.star_man_locks_at };
}

async function gameCardStatus(userId, league, activeGameweek) {
  if (!activeGameweek) {
    return { state: 'na', deadline: null };
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
      return { state: 'na', deadline: null };
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
      return { state: 'na', deadline: null };
    }

    const { data, error } = await supabase
      .from('game_card_predictions')
      .select('id, predicted_value')
      .eq('round_id', activeRound.id)
      .eq('gameweek_id', activeGameweek.gameweek_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { state: 'na', deadline: null };
    }

    if (hasSavedGameCardValue(data)) {
      return { state: 'complete', deadline: null };
    }

    return isPast(activeGameweek.star_man_locks_at)
      ? { state: 'na', deadline: null }
      : { state: 'required', deadline: activeGameweek.star_man_locks_at };
  } catch {
    return { state: 'na', deadline: null };
  }
}

async function leagueRow(userId, league, memberCount) {
  const { activeGameweek } = await loadActiveGameweek(league);
  if (!activeGameweek) {
    return '';
  }

  const [predictionsComplete, starManComplete, gameCardActionStatus] = await Promise.all([
    predictionStatus(userId, league, activeGameweek),
    starManStatus(userId, league, activeGameweek),
    gameCardStatus(userId, league, activeGameweek),
  ]);
  const memberCountMarkup = Number.isInteger(memberCount)
    ? `<small class="home-action-member-count">${memberCount} ${memberCount === 1 ? 'user' : 'users'}</small>`
    : '';

  return `
    <div class="home-action-row">
      <div class="home-action-league-pill">
        <span class="home-action-league-copy">
          <span class="home-action-league-details">
            <strong class="home-action-league-name">${escapeHtml(league.name)}</strong>
            ${memberCountMarkup}
          </span>
          <small class="home-action-gameweek">GW${escapeHtml(activeGameweek.gameweek_number)}</small>
        </span>
        <a class="home-action-open" href="${leagueUrl('league.html', league.id)}">Enter</a>
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
  const leagueIds = leagues.map((league) => league.id);
  const { data: memberRows, error: memberError } = await supabase
    .from('competition_members')
    .select('competition_id')
    .in('competition_id', leagueIds);
  const memberCounts = memberError
    ? new Map()
    : memberCountsByLeague(memberRows);
  const rows = (await Promise.all(leagues.map((league) => (
    leagueRow(user.id, league, memberCounts.get(String(league.id)))
  ))))
    .filter(Boolean);

  if (!rows.length) {
    return;
  }

  list.innerHTML = rows.join('');
  panel.hidden = false;
  startActionCountdowns();
}

boot().catch(() => {
  if (panel) {
    panel.hidden = true;
  }
});
