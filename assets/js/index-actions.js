import { escapeHtml, leagueUrl, normaliseNested } from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';
import { getSessionUser, onSessionUserChange } from './session-user.js';
import { boundedRead, readData } from './async-read.js';

const panel = document.querySelector('[data-home-action-panel]');
const list = document.querySelector('[data-home-action-list]');
const HOME_ACTION_STYLE_ID = 'prem-predics-home-action-style';
let actionCountdownTimer = null;
let deadlineRefreshQueued = false;
let lastExpiredDeadlines = '';
let homeGeneration = 0;
let homeUserId = null;
let homeRefresh = null;
let homeLastRefresh = 0;
let homeRetryTimer = null;
let homeRetryAttempts = 0;
let homeRows = new Map();
const HOME_LEAGUE_CACHE_PREFIX = 'premPredicsHomeLeagues:v1:';

function injectHomeActionStyles() {
  if (document.getElementById(HOME_ACTION_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = HOME_ACTION_STYLE_ID;
  style.textContent = `
    [data-home-action-message] {
      font-size: 13px;
      line-height: 1.5;
      color: #ede9fe;
    }
    [data-home-action-retry] {
      margin-left: 6px;
      padding: 5px 12px;
      min-height: 32px;
      border: 1px solid #fef3c7;
      border-radius: 8px;
      background: linear-gradient(135deg, #fef3c7, #fbbf24);
      color: #2e1065;
      font-weight: 800;
      cursor: pointer;
    }
    [data-home-action-retry]:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
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
    return '0m';
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}hr ${minutes}m` : `${minutes}m`;
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

    const expiredKey = Array.from(countdowns).map((node) => node.dataset.homeActionDeadline).sort().join('|');
    if (deadlineReached && !deadlineRefreshQueued && expiredKey !== lastExpiredDeadlines) {
      lastExpiredDeadlines = expiredKey;
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
  return ['complete', 'required', 'na', 'pending', 'error'].includes(state) ? state : 'na';
}

function statusMarkup(result) {
  const state = result && typeof result === 'object' ? result.state : result;
  const deadline = result && typeof result === 'object' ? result.deadline : null;
  const actionState = normaliseActionState(state);
  const labels = {
    complete: 'Completed',
    required: 'Action Required',
    na: 'N/A',
    pending: 'Checking…',
    error: 'Unavailable',
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

async function predictionStatus(userId, league, activeGameweek, fixtures) {
  const openFixtures = fixtures.filter((fixture) => fixture.status !== 'postponed'
    && fixture.status !== 'final' && !isPast(fixture.prediction_locks_at));
  if (!openFixtures.length) return { state: 'complete', deadline: null };
  const data = await readData(() => supabase.from('predictions').select('fixture_id')
    .eq('competition_id', league.id).eq('user_id', userId).eq('prediction_slot', 'primary')
    .in('fixture_id', openFixtures.map((fixture) => fixture.id)));
  const saved = new Set((data || []).map((row) => String(row.fixture_id)));
  const missing = openFixtures.filter((fixture) => !saved.has(String(fixture.id)));
  return missing.length
    ? { state: 'required', deadline: earliestDeadline(missing) }
    : { state: 'complete', deadline: null };
}

async function starManStatus(userId, league, activeGameweek) {
  if (isPast(activeGameweek.star_man_locks_at)) return { state: 'complete', deadline: null };
  const data = await readData(() => supabase.from('star_man_picks').select('id')
    .eq('competition_id', league.id).eq('user_id', userId)
    .eq('gameweek_id', activeGameweek.gameweek_id).eq('pick_slot', 'primary').maybeSingle());
  return data ? { state: 'complete', deadline: null }
    : { state: 'required', deadline: activeGameweek.star_man_locks_at };
}

async function gameCardStatus(userId, league, activeGameweek, seasonGameweeks) {
  const roundsQuery = () => supabase.from('game_card_rounds')
    .select('id, start_gameweek_id, end_gameweek_id, status')
    .eq('competition_id', league.id).eq('season_id', league.season_id).order('round_number');
  let [rounds, gameweeks] = await Promise.all([readData(roundsQuery), seasonGameweeks]);
  // Existing leagues need no write/round-creation round trip on every homepage load.
  if (!rounds?.length) {
    const { error } = await boundedRead((signal) => supabase.rpc('ensure_game_card_rounds', {
      target_competition_id: league.id,
    }).abortSignal(signal));
    if (error) throw error;
    rounds = await readData(roundsQuery);
  }
  const numbers = new Map((gameweeks || []).map((gw) => [String(gw.id), Number(gw.number)]));
  const current = Number(activeGameweek.gameweek_number);
  const round = (rounds || []).find((row) => current >= numbers.get(String(row.start_gameweek_id))
    && current <= numbers.get(String(row.end_gameweek_id)));
  if (!round) return { state: 'na', deadline: null };
  const data = await readData(() => supabase.from('game_card_predictions').select('id, predicted_value')
    .eq('round_id', round.id).eq('gameweek_id', activeGameweek.gameweek_id)
    .eq('user_id', userId).maybeSingle());
  if (hasSavedGameCardValue(data)) return { state: 'complete', deadline: null };
  return isPast(activeGameweek.star_man_locks_at) ? { state: 'na', deadline: null }
    : { state: 'required', deadline: activeGameweek.star_man_locks_at };
}

function leagueRow(row) {
  const { league, memberCount, gameweek, predictions, starMan, gameCard } = row;
  const members = Number.isInteger(memberCount)
    ? `<small class="home-action-member-count">${memberCount} ${memberCount === 1 ? 'user' : 'users'}</small>` : '';
  return `
    <div class="home-action-row">
      <div class="home-action-league-pill">
        <span class="home-action-league-copy">
          <span class="home-action-league-details">
            <strong class="home-action-league-name">${escapeHtml(league.name)}</strong>
            ${members}
          </span>
          <small class="home-action-gameweek">${gameweek ? `GW${escapeHtml(gameweek.gameweek_number)}` : 'GW —'}</small>
        </span>
        <a class="home-action-open" href="${leagueUrl('league.html', league.id)}">Enter</a>
      </div>
      <div class="home-action-status-grid">
        ${actionStatus('Predictions', predictions)}
        ${actionStatus('Star Man', starMan)}
        ${actionStatus('Game Card', gameCard)}
      </div>
    </div>`;
}

function renderHomeRows() {
  if (!homeRows.size) return;
  list.innerHTML = [...homeRows.values()].map(leagueRow).join('');
  panel.hidden = false;
  startActionCountdowns();
}

function homeMessage(text = '') {
  const message = panel?.querySelector('[data-home-action-message]');
  if (!message) return;
  message.hidden = !text;
  message.querySelector('span').textContent = text;
}

function cachedHomeLeagues(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_LEAGUE_CACHE_PREFIX + userId) || 'null');
    if (cached?.userId !== userId || Date.now() - cached.at > 86400000) return [];
    return Array.isArray(cached.leagues) ? cached.leagues.filter((l) => l.id && l.name && l.season_id) : [];
  } catch { return []; }
}

function cacheHomeLeagues(userId, leagues) {
  try {
    // Cache navigation only, never predictions, picks or authoritative action state.
    localStorage.setItem(HOME_LEAGUE_CACHE_PREFIX + userId, JSON.stringify({
      userId, at: Date.now(), leagues,
    }));
  } catch { /* Storage being unavailable must never prevent live rendering. */ }
}

function pendingRow(league) {
  return { league, predictions: 'pending', starMan: 'pending', gameCard: 'pending' };
}

function reportHomeError(error) {
  console.warn('Prem Predics Quick Access could not fully refresh:', error?.message || error);
  if (!panel) return;
  panel.hidden = false;
  homeMessage('Some league details could not load. You can still enter your leagues.');
  if (!homeRows.size) list.innerHTML = '<p>Unable to load Quick Access. Use Retry or open the Leagues page below.</p>';
  if (homeRetryAttempts < 1 && navigator.onLine) {
    homeRetryAttempts += 1;
    homeRetryTimer = window.setTimeout(() => { void boot(); }, 15000);
  }
}

async function loadHomeActions(generation) {
  const user = await getSessionUser();
  if (generation !== homeGeneration) return;
  if (!user) {
    homeUserId = null;
    homeRows.clear();
    list.innerHTML = '';
    panel.hidden = true;
    return;
  }
  if (homeUserId !== user.id) {
    homeUserId = user.id;
    homeRows = new Map(cachedHomeLeagues(user.id).map((league) => [league.id, pendingRow(league)]));
    list.innerHTML = '<p>Loading your leagues…</p>';
  }
  panel.hidden = false;
  homeMessage('');
  renderHomeRows();
  const current = () => generation === homeGeneration && homeUserId === user.id;
  const memberships = await readData(() => supabase.from('competition_members')
    .select('competitions(id, name, season_id, starts_gameweek_id)')
    .eq('user_id', user.id).order('joined_at'));
  if (!current()) return;
  const leagues = (memberships || []).map((row) => normaliseNested(row.competitions)).filter(Boolean);
  cacheHomeLeagues(user.id, leagues);
  homeRows = new Map(leagues.map((league) => [league.id, pendingRow(league)]));
  if (!leagues.length) {
    list.innerHTML = '';
    panel.hidden = true;
    return;
  }
  renderHomeRows(); // League links appear before any deadlines/picks/rounds finish.
  const contexts = new Map();
  const gameweeksBySeason = new Map();
  let hadError = false;
  const counts = readData(() => supabase.from('competition_members').select('competition_id')
    .in('competition_id', leagues.map((league) => league.id)))
    .then((members) => {
      if (!current()) return;
      const totals = memberCountsByLeague(members);
      for (const row of homeRows.values()) row.memberCount = totals.get(String(row.league.id)) || 0;
      renderHomeRows();
    }).catch((error) => { if (current()) { hadError = true; reportHomeError(error); } });

  const tasks = leagues.map(async (league) => {
    const row = homeRows.get(league.id);
    const key = `${league.season_id}:${league.starts_gameweek_id}`;
    try {
      if (!contexts.has(key)) contexts.set(key, boundedRead(() => loadActiveGameweek(league)));
      const { activeGameweek, fixturesByGameweek } = await contexts.get(key);
      if (!current()) return;
      row.gameweek = activeGameweek;
      if (!activeGameweek) {
        row.predictions = row.starMan = row.gameCard = 'na';
        renderHomeRows();
        return;
      }
      if (!gameweeksBySeason.has(league.season_id)) {
        gameweeksBySeason.set(league.season_id, readData(() => supabase.from('gameweeks')
          .select('id, number').eq('season_id', league.season_id)));
      }
      const checks = {
        predictions: predictionStatus(user.id, league, activeGameweek,
          fixturesByGameweek.get(String(activeGameweek.gameweek_id)) || []),
        starMan: starManStatus(user.id, league, activeGameweek),
        gameCard: gameCardStatus(user.id, league, activeGameweek, gameweeksBySeason.get(league.season_id)),
      };
      // Each status paints independently. A slow/failed game-card request cannot
      // hide Predictions, Star Man or another league.
      await Promise.allSettled(Object.entries(checks).map(async ([name, request]) => {
        try {
          const value = await request;
          if (current()) { row[name] = value; renderHomeRows(); }
        } catch (error) {
          if (current()) { row[name] = 'error'; hadError = true; renderHomeRows(); reportHomeError(error); }
        }
      }));
    } catch (error) {
      if (current()) {
        row.predictions = row.starMan = row.gameCard = 'error';
        hadError = true;
        renderHomeRows();
        reportHomeError(error);
      }
    }
  });
  await Promise.allSettled([counts, ...tasks]);
  if (current() && !hadError) {
    homeRetryAttempts = 0;
    window.clearTimeout(homeRetryTimer);
    homeMessage('');
  }
}

function boot() {
  if (!panel || !list) return Promise.resolve();
  if (homeRefresh) return homeRefresh;
  homeLastRefresh = Date.now();
  const generation = homeGeneration;
  let request;
  request = loadHomeActions(generation).catch((error) => {
    if (generation === homeGeneration) reportHomeError(error);
  }).finally(() => { if (homeRefresh === request) homeRefresh = null; });
  homeRefresh = request;
  return request;
}

panel?.querySelector('[data-home-action-retry]')?.addEventListener('click', () => { void boot(); });
window.addEventListener('online', () => { void boot(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) void boot(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - homeLastRefresh > 30000) void boot();
});
onSessionUserChange((user, event) => {
  if (event === 'SIGNED_OUT' || (homeUserId && user && homeUserId !== user.id)) {
    homeGeneration += 1;
    homeRefresh = null;
    homeUserId = null;
    homeRows.clear();
    window.clearTimeout(homeRetryTimer);
    window.clearInterval(actionCountdownTimer);
    if (list) list.innerHTML = '';
    if (panel) panel.hidden = true;
  }
  if (user && (!homeUserId || Date.now() - homeLastRefresh > 30000)) void boot();
});
void boot();
