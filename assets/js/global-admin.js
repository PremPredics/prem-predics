import { supabase } from './supabase-client.js';
import { escapeHtml, normaliseNested, shortTeamName } from './league-context.js';

const gate = document.querySelector('[data-admin-gate]');
const content = document.querySelector('[data-admin-content]');
const passwordInput = document.querySelector('[data-admin-password]');
const unlockButton = document.querySelector('[data-admin-unlock]');
const gateMessage = document.querySelector('[data-admin-gate-message]');

const state = {
  user: null,
  season: null,
  seasons: [],
  gameweeks: [],
  teams: [],
  teamsById: new Map(),
  fixtures: [],
  cards: [],
};

function setMessage(element, text, type = 'info') {
  element.textContent = text;
  element.dataset.type = type;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function toDatetimeLocal(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value) {
  return value ? new Date(value).toISOString() : null;
}

function teamName(teamId) {
  return shortTeamName(state.teamsById.get(teamId)?.name || 'Team');
}

function gameweekNumber(gameweekId) {
  return state.gameweeks.find((gameweek) => String(gameweek.id) === String(gameweekId))?.number || '';
}

function fixtureLabel(fixture) {
  return `GW${gameweekNumber(fixture.gameweek_id)} - ${teamName(fixture.home_team_id)} v ${teamName(fixture.away_team_id)}`;
}

function options(items, valueKey, labelFn, selectedValue = '') {
  return items.map((item) => {
    const value = String(item[valueKey]);
    const selected = String(selectedValue) === value ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(labelFn(item))}</option>`;
  }).join('');
}

function populateGameweekSelect(select, includeAll = false) {
  if (!select) {
    return;
  }

  const allOption = includeAll ? '<option value="all">All Fixtures</option>' : '';
  select.innerHTML = `${allOption}${options(state.gameweeks, 'id', (gameweek) => `Gameweek ${gameweek.number}`)}`;
}

function fixtureOptions(fixtures) {
  return fixtures.map((fixture) => `<option value="${fixture.id}">${escapeHtml(fixtureLabel(fixture))}</option>`).join('');
}

async function requireAdminSession() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    window.location.href = 'login.html?redirect=global-admin.html';
    return false;
  }

  state.user = userData.user;
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) {
    gate.innerHTML = '<p class="message" data-type="error">This page is only available to the global admin account.</p>';
    return false;
  }

  return true;
}

async function unlockAdmin() {
  const password = passwordInput.value;
  if (!password) {
    setMessage(gateMessage, 'Enter your password.', 'error');
    return;
  }

  unlockButton.disabled = true;
  setMessage(gateMessage, 'Checking password...', 'info');

  const { error } = await supabase.auth.signInWithPassword({
    email: state.user.email,
    password,
  });

  unlockButton.disabled = false;

  if (error) {
    setMessage(gateMessage, 'Password check failed.', 'error');
    return;
  }

  gate.hidden = true;
  content.hidden = false;

  try {
    await loadReferenceData();
    wireAdminPanels();
    showSection('actual-results');
  } catch (error) {
    content.hidden = true;
    gate.hidden = false;
    setMessage(gateMessage, error.message || 'Could not load admin tools.', 'error');
  }
}

async function loadReferenceData() {
  const [seasonResponse, teamResponse, gameweekResponse, fixtureResponse, cardResponse] = await Promise.all([
    supabase.from('seasons').select('id, name, starts_on, ends_on, is_active').order('starts_on', { ascending: false }),
    supabase.from('teams').select('id, name').order('name', { ascending: true }),
    supabase.from('gameweeks').select('id, season_id, number, star_man_locks_at').order('number', { ascending: true }),
    supabase.from('fixtures').select('id, season_id, gameweek_id, original_gameweek_id, home_team_id, away_team_id, kickoff_at, status, sort_order').order('kickoff_at', { ascending: true }),
    supabase.from('card_definitions').select('id, name, deck_type').eq('deck_type', 'game').order('name', { ascending: true }),
  ]);

  for (const response of [seasonResponse, teamResponse, gameweekResponse, fixtureResponse, cardResponse]) {
    if (response.error) {
      throw response.error;
    }
  }

  state.seasons = seasonResponse.data || [];
  state.season = state.seasons.find((season) => season.is_active) || state.seasons[0] || null;
  if (!state.season) {
    throw new Error('No season found in Supabase.');
  }
  state.teams = teamResponse.data || [];
  state.teamsById = new Map(state.teams.map((team) => [team.id, team]));
  state.gameweeks = (gameweekResponse.data || []).filter((gameweek) => gameweek.season_id === state.season?.id);
  state.fixtures = (fixtureResponse.data || []).filter((fixture) => fixture.season_id === state.season?.id);
  state.cards = cardResponse.data || [];
}

function showSection(name) {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTab === name);
  });

  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = section.dataset.adminSection !== name;
  });

  if (name === 'actual-results') renderActualResults();
  if (name === 'schedule') renderSchedule();
  if (name === 'fixture-stats') renderFixtureStatsControls();
  if (name === 'player-stats') renderPlayerStatsControls();
  if (name === 'game-card-results') renderGameCardResults();
  if (name === 'team-standings') renderTeamStandings();
}

function wireAdminPanels() {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => showSection(button.dataset.adminTab));
  });
}

async function renderActualResults() {
  const select = document.querySelector('[data-actual-gameweek]');
  const list = document.querySelector('[data-actual-list]');
  const message = document.querySelector('[data-actual-message]');
  populateGameweekSelect(select);

  async function renderList() {
    const fixtures = state.fixtures.filter((fixture) => String(fixture.gameweek_id) === select.value);
    if (!fixtures.length) {
      list.innerHTML = '<p class="section-copy">No fixtures found.</p>';
      return;
    }

    const { data: results, error } = await supabase
      .from('match_results')
      .select('fixture_id, home_goals, away_goals')
      .in('fixture_id', fixtures.map((fixture) => fixture.id));

    if (error) {
      setMessage(message, error.message, 'error');
      return;
    }

    const resultByFixture = new Map((results || []).map((result) => [result.fixture_id, result]));
    list.innerHTML = fixtures.map((fixture) => {
      const result = resultByFixture.get(fixture.id);
      return `
        <div class="admin-row" data-fixture-id="${fixture.id}">
          <strong>${escapeHtml(fixtureLabel(fixture))}<small>${escapeHtml(new Date(fixture.kickoff_at).toLocaleString('en-GB'))}</small></strong>
          <input data-home-goals type="number" min="0" max="99" value="${result?.home_goals ?? ''}" placeholder="Home">
          <input data-away-goals type="number" min="0" max="99" value="${result?.away_goals ?? ''}" placeholder="Away">
          <span>${escapeHtml(fixture.status)}</span>
          <span></span>
          <button type="button" data-save-result>Save</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-save-result]').forEach((button) => {
      button.addEventListener('click', () => saveActualResult(button.closest('[data-fixture-id]'), message));
    });
  }

  select.onchange = renderList;
  await renderList();
}

async function saveActualResult(row, message) {
  const fixtureId = row.dataset.fixtureId;
  const homeGoals = numberOrZero(row.querySelector('[data-home-goals]').value);
  const awayGoals = numberOrZero(row.querySelector('[data-away-goals]').value);

  const { error } = await supabase.from('match_results').upsert({
    fixture_id: fixtureId,
    home_goals: homeGoals,
    away_goals: awayGoals,
    entered_by: state.user.id,
  });

  if (error) {
    setMessage(message, error.message, 'error');
    return;
  }

  await supabase.from('fixtures').update({ status: 'final' }).eq('id', fixtureId);
  setMessage(message, 'Actual result saved.', 'success');
}

function renderSchedule() {
  const select = document.querySelector('[data-schedule-filter]');
  const list = document.querySelector('[data-schedule-list]');
  const message = document.querySelector('[data-schedule-message]');
  const saveAllButton = document.querySelector('[data-save-all-schedules]');
  populateGameweekSelect(select, true);

  function renderList() {
    const fixtures = select.value === 'all'
      ? state.fixtures
      : state.fixtures.filter((fixture) => String(fixture.gameweek_id) === select.value);

    list.innerHTML = fixtures.map((fixture) => `
      <div class="admin-row schedule" data-fixture-id="${fixture.id}">
        <strong>${escapeHtml(fixtureLabel(fixture))}</strong>
        <input data-kickoff type="datetime-local" value="${toDatetimeLocal(fixture.kickoff_at)}">
        <select data-new-gameweek>${options(state.gameweeks, 'id', (gameweek) => `GW${gameweek.number}`, fixture.gameweek_id)}</select>
        <select data-status>
          ${['scheduled', 'postponed', 'locked', 'in_progress', 'final'].map((status) => `<option value="${status}" ${fixture.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
        <span>Ready</span>
      </div>
    `).join('') || '<p class="section-copy">No fixtures found.</p>';

    if (saveAllButton) {
      saveAllButton.disabled = fixtures.length === 0;
    }
  }

  select.onchange = renderList;
  if (saveAllButton) {
    saveAllButton.onclick = () => saveVisibleScheduleRows(list, message, saveAllButton, renderList);
  }
  renderList();
}

async function saveVisibleScheduleRows(list, message, button, renderList) {
  const rows = [...list.querySelectorAll('[data-fixture-id]')];
  if (!rows.length) {
    setMessage(message, 'No fixtures to save.', 'info');
    return;
  }

  setMessage(message, 'Saving fixtures...', 'info');
  button.disabled = true;

  try {
    let changedCount = 0;

    for (const row of rows) {
      const fixtureId = row.dataset.fixtureId;
      const fixture = state.fixtures.find((item) => item.id === fixtureId);
      const newGameweekId = row.querySelector('[data-new-gameweek]').value;
      const newKickoff = fromDatetimeLocal(row.querySelector('[data-kickoff]').value);
      const status = row.querySelector('[data-status]').value;
      const hasChanged = !fixture
        || String(fixture.gameweek_id) !== String(newGameweekId)
        || fixture.kickoff_at !== newKickoff
        || fixture.status !== status;

      if (!hasChanged) {
        continue;
      }

      const { error } = await supabase
        .from('fixtures')
        .update({ gameweek_id: newGameweekId, kickoff_at: newKickoff, status })
        .eq('id', fixtureId);

      if (error) {
        throw error;
      }

      await supabase.from('fixture_schedule_changes').insert({
        fixture_id: fixtureId,
        previous_gameweek_id: fixture?.gameweek_id,
        new_gameweek_id: newGameweekId,
        previous_kickoff_at: fixture?.kickoff_at,
        new_kickoff_at: newKickoff,
        reason: 'Manual admin update',
        changed_by: state.user.id,
      });

      if (fixture) {
        fixture.gameweek_id = Number(newGameweekId);
        fixture.kickoff_at = newKickoff;
        fixture.status = status;
      }

      changedCount += 1;
    }

    renderList();
    setMessage(message, changedCount ? `${changedCount} fixture${changedCount === 1 ? '' : 's'} saved.` : 'No fixture changes to save.', 'success');
  } catch (error) {
    setMessage(message, error.message || 'Could not save fixture schedule.', 'error');
  } finally {
    button.disabled = list.querySelectorAll('[data-fixture-id]').length === 0;
  }
}

function renderFixtureStatsControls() {
  const gameweekSelect = document.querySelector('[data-fixture-stats-gameweek]');
  const fixtureSelect = document.querySelector('[data-fixture-stats-fixture]');
  populateGameweekSelect(gameweekSelect);

  function syncFixtures() {
    const fixtures = state.fixtures.filter((fixture) => String(fixture.gameweek_id) === gameweekSelect.value);
    fixtureSelect.innerHTML = fixtureOptions(fixtures);
    renderFixtureStats();
  }

  gameweekSelect.onchange = syncFixtures;
  fixtureSelect.onchange = renderFixtureStats;
  syncFixtures();
}

async function renderFixtureStats() {
  const fixtureId = document.querySelector('[data-fixture-stats-fixture]').value;
  const list = document.querySelector('[data-fixture-stats-list]');
  const message = document.querySelector('[data-fixture-stats-message]');
  if (!fixtureId) {
    list.innerHTML = '<p class="section-copy">Choose a fixture.</p>';
    return;
  }

  const { data } = await supabase.from('fixture_game_stats').select('*').eq('fixture_id', fixtureId).maybeSingle();
  list.innerHTML = `
    <div class="admin-row fixture-stats" data-fixture-id="${fixtureId}">
      <strong>${escapeHtml(fixtureLabel(state.fixtures.find((fixture) => fixture.id === fixtureId)))}</strong>
      <input data-home-corners type="number" min="0" placeholder="Home corners" value="${data?.home_corners ?? ''}">
      <input data-away-corners type="number" min="0" placeholder="Away corners" value="${data?.away_corners ?? ''}">
      <input data-home-yellows type="number" min="0" placeholder="Home yellows" value="${data?.home_yellow_cards ?? ''}">
      <input data-away-yellows type="number" min="0" placeholder="Away yellows" value="${data?.away_yellow_cards ?? ''}">
      <input data-early-goal type="number" min="0" placeholder="Earliest goal" value="${data?.earliest_goal_minute ?? ''}">
      <input data-stoppage-goals type="number" min="0" placeholder="90+ goals" value="${data?.stoppage_time_goals ?? ''}">
      <input data-pens type="number" min="0" placeholder="Pens scored" value="${data?.penalties_scored ?? ''}">
      <label><input data-heavy-snow type="checkbox" ${data?.played_in_heavy_snow ? 'checked' : ''}> Heavy snow</label>
      <button type="button" data-save-fixture-stats>Save</button>
    </div>
  `;
  list.querySelector('[data-save-fixture-stats]').addEventListener('click', () => saveFixtureStats(message));
}

async function saveFixtureStats(message) {
  const row = document.querySelector('[data-fixture-stats-list] [data-fixture-id]');
  const { error } = await supabase.from('fixture_game_stats').upsert({
    fixture_id: row.dataset.fixtureId,
    home_corners: numberOrZero(row.querySelector('[data-home-corners]').value),
    away_corners: numberOrZero(row.querySelector('[data-away-corners]').value),
    home_yellow_cards: numberOrZero(row.querySelector('[data-home-yellows]').value),
    away_yellow_cards: numberOrZero(row.querySelector('[data-away-yellows]').value),
    earliest_goal_minute: row.querySelector('[data-early-goal]').value === '' ? null : numberOrZero(row.querySelector('[data-early-goal]').value),
    stoppage_time_goals: numberOrZero(row.querySelector('[data-stoppage-goals]').value),
    penalties_scored: numberOrZero(row.querySelector('[data-pens]').value),
    played_in_heavy_snow: row.querySelector('[data-heavy-snow]').checked,
    entered_by: state.user.id,
  });

  setMessage(message, error ? error.message : 'Fixture stats saved.', error ? 'error' : 'success');
}

function renderPlayerStatsControls() {
  const gameweekSelect = document.querySelector('[data-player-stats-gameweek]');
  const fixtureSelect = document.querySelector('[data-player-stats-fixture]');
  populateGameweekSelect(gameweekSelect);

  function syncFixtures() {
    const fixtures = state.fixtures.filter((fixture) => String(fixture.gameweek_id) === gameweekSelect.value);
    fixtureSelect.innerHTML = fixtureOptions(fixtures);
    renderPlayerStats();
  }

  gameweekSelect.onchange = syncFixtures;
  fixtureSelect.onchange = renderPlayerStats;
  document.querySelector('[data-save-player-stats]').onclick = savePlayerStats;
  syncFixtures();
}

async function renderPlayerStats() {
  const fixtureId = document.querySelector('[data-player-stats-fixture]').value;
  const list = document.querySelector('[data-player-stats-list]');
  if (!fixtureId) {
    list.innerHTML = '<p class="section-copy">Choose a fixture.</p>';
    return;
  }

  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  const [{ data: players }, { data: stats }] = await Promise.all([
    supabase
      .from('players')
      .select('id, display_name, team_id')
      .in('team_id', [fixture.home_team_id, fixture.away_team_id])
      .eq('is_active', true)
      .order('display_name', { ascending: true })
      .range(0, 200),
    supabase.from('player_fixture_stats').select('*').eq('fixture_id', fixtureId),
  ]);

  const statsByPlayer = new Map((stats || []).map((row) => [row.player_id, row]));
  list.innerHTML = (players || []).map((player) => {
    const row = statsByPlayer.get(player.id);
    return `
      <div class="admin-row player-stats" data-player-id="${player.id}">
        <strong>${escapeHtml(player.display_name)}<small>${escapeHtml(teamName(player.team_id))}</small></strong>
        <input data-goals type="number" min="0" value="${row?.goals ?? 0}" title="Goals">
        <input data-assists type="number" min="0" value="${row?.assists ?? 0}" title="Assists">
        <input data-outside-goals type="number" min="0" value="${row?.outside_box_goals ?? 0}" title="Outside-box goals">
        <input data-outside-assists type="number" min="0" value="${row?.outside_box_assists ?? 0}" title="Outside-box assists">
        <input data-yellows type="number" min="0" value="${row?.yellow_cards ?? 0}" title="Yellow cards">
        <input data-reds type="number" min="0" value="${row?.red_cards ?? 0}" title="Red cards">
        <label><input data-started type="checkbox" ${row?.started ? 'checked' : ''}> Started</label>
        <label><input data-subbed type="checkbox" ${row?.was_substituted ? 'checked' : ''}> Subbed</label>
      </div>
    `;
  }).join('') || '<p class="section-copy">No players found for this fixture.</p>';
}

async function savePlayerStats() {
  const message = document.querySelector('[data-player-stats-message]');
  const fixtureId = document.querySelector('[data-player-stats-fixture]').value;
  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  const rows = [...document.querySelectorAll('[data-player-stats-list] [data-player-id]')];

  const playersById = new Map();
  const { data: players } = await supabase
    .from('players')
    .select('id, team_id')
    .in('id', rows.map((row) => row.dataset.playerId));
  (players || []).forEach((player) => playersById.set(player.id, player));

  const fixtureStats = rows.map((row) => {
    const player = playersById.get(row.dataset.playerId);
    const isHome = player?.team_id === fixture.home_team_id;
    return {
      season_id: state.season.id,
      fixture_id: fixtureId,
      gameweek_id: fixture.gameweek_id,
      player_id: row.dataset.playerId,
      team_id: player?.team_id,
      opponent_team_id: isHome ? fixture.away_team_id : fixture.home_team_id,
      was_home_team: isHome,
      goals: numberOrZero(row.querySelector('[data-goals]').value),
      assists: numberOrZero(row.querySelector('[data-assists]').value),
      outside_box_goals: numberOrZero(row.querySelector('[data-outside-goals]').value),
      outside_box_assists: numberOrZero(row.querySelector('[data-outside-assists]').value),
      yellow_cards: numberOrZero(row.querySelector('[data-yellows]').value),
      red_cards: numberOrZero(row.querySelector('[data-reds]').value),
      started: row.querySelector('[data-started]').checked,
      was_substituted: row.querySelector('[data-subbed]').checked,
      entered_by: state.user.id,
    };
  }).filter((row) => row.team_id);

  const gameweekStats = fixtureStats.map((row) => ({
    season_id: row.season_id,
    gameweek_id: row.gameweek_id,
    player_id: row.player_id,
    goals: row.goals,
    assists: row.assists,
    outside_box_goals: row.outside_box_goals,
    outside_box_assists: row.outside_box_assists,
    yellow_cards: row.yellow_cards,
    red_cards: row.red_cards,
    started: row.started,
    entered_by: state.user.id,
  }));

  const { error: fixtureError } = await supabase.from('player_fixture_stats').upsert(fixtureStats, {
    onConflict: 'fixture_id,player_id',
  });
  if (fixtureError) {
    setMessage(message, fixtureError.message, 'error');
    return;
  }

  const { error: gameweekError } = await supabase.from('player_gameweek_stats').upsert(gameweekStats, {
    onConflict: 'season_id,gameweek_id,player_id',
  });

  setMessage(message, gameweekError ? gameweekError.message : 'Player stats saved.', gameweekError ? 'error' : 'success');
}

async function renderGameCardResults() {
  const gameweekSelect = document.querySelector('[data-game-card-gameweek]');
  const cardSelect = document.querySelector('[data-game-card-card]');
  const valueInput = document.querySelector('[data-game-card-value]');
  populateGameweekSelect(gameweekSelect);
  cardSelect.innerHTML = options(state.cards, 'id', (card) => card.name);

  async function loadValue() {
    const { data } = await supabase
      .from('game_card_actual_results')
      .select('actual_value')
      .eq('season_id', state.season.id)
      .eq('gameweek_id', gameweekSelect.value)
      .eq('card_id', cardSelect.value)
      .maybeSingle();
    valueInput.value = data?.actual_value ?? '';
  }

  gameweekSelect.onchange = loadValue;
  cardSelect.onchange = loadValue;
  document.querySelector('[data-save-game-card-result]').onclick = saveGameCardResult;
  await loadValue();
}

async function saveGameCardResult() {
  const message = document.querySelector('[data-game-card-message]');
  const gameweekId = document.querySelector('[data-game-card-gameweek]').value;
  const cardId = document.querySelector('[data-game-card-card]').value;
  const actualValue = document.querySelector('[data-game-card-value]').value;

  if (actualValue === '') {
    setMessage(message, 'Enter an actual value.', 'error');
    return;
  }

  const { error } = await supabase.from('game_card_actual_results').upsert({
    season_id: state.season.id,
    gameweek_id: gameweekId,
    card_id: cardId,
    actual_value: numberOrZero(actualValue),
    entered_by: state.user.id,
  }, {
    onConflict: 'season_id,gameweek_id,card_id',
  });

  setMessage(message, error ? error.message : 'Game Card actual result saved.', error ? 'error' : 'success');
}

async function renderTeamStandings() {
  const select = document.querySelector('[data-standings-gameweek]');
  const list = document.querySelector('[data-standings-list]');
  populateGameweekSelect(select);

  async function renderList() {
    const { data, error } = await supabase
      .from('team_gameweek_computed_standings')
      .select('league_position, team_id, team_name, played, wins, draws, losses, goals_for, goals_against, goal_difference, points')
      .eq('season_id', state.season.id)
      .eq('gameweek_id', select.value)
      .order('league_position', { ascending: true });

    if (error) {
      list.innerHTML = '<p class="section-copy">Run the latest Supabase SQL update, then refresh this page to show the calculated Premier League table.</p>';
      return;
    }

    list.innerHTML = `
      <div class="admin-row team-standing">
        <strong>Pos</strong>
        <strong>Team</strong>
        <strong>P</strong>
        <strong>W</strong>
        <strong>D</strong>
        <strong>L</strong>
        <strong>GF</strong>
        <strong>GA</strong>
        <strong>GD</strong>
        <strong>Pts</strong>
      </div>
      ${(data || []).map((row) => `
        <div class="admin-row team-standing" data-team-id="${row.team_id}">
          <strong>${row.league_position}</strong>
          <strong>${escapeHtml(row.team_name)}</strong>
          <span>${row.played}</span>
          <span>${row.wins}</span>
          <span>${row.draws}</span>
          <span>${row.losses}</span>
          <span>${row.goals_for}</span>
          <span>${row.goals_against}</span>
          <span>${row.goal_difference}</span>
          <span>${row.points}</span>
        </div>
      `).join('') || '<p class="section-copy">No table data found for this gameweek yet.</p>'}
    `;
  }

  select.onchange = renderList;
  await renderList();
}

async function boot() {
  if (!(await requireAdminSession())) {
    return;
  }

  unlockButton.addEventListener('click', unlockAdmin);
  passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      unlockAdmin();
    }
  });
}

boot();
