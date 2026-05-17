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
  players: [],
  cards: [],
};

const playerStatFlow = {
  query: '',
  playerId: null,
  fixtureId: null,
};

function setMessage(element, text, type = 'info') {
  element.textContent = text;
  element.dataset.type = type;
}

function setButtonsDisabled(buttons, disabled) {
  buttons.forEach((button) => {
    button.disabled = disabled;
  });
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

function normaliseSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function playerSearchText(player) {
  return normaliseSearchText(`${player.display_name || ''} ${teamName(player.team_id)}`);
}

function playerMatchesSearch(player, query) {
  const terms = normaliseSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return false;
  }

  const haystack = playerSearchText(player);
  return terms.every((term) => haystack.includes(term));
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
  const [seasonResponse, teamResponse, gameweekResponse, fixtureResponse, playerResponse, cardResponse] = await Promise.all([
    supabase.from('seasons').select('id, name, starts_on, ends_on, is_active').order('starts_on', { ascending: false }),
    supabase.from('teams').select('id, name').order('name', { ascending: true }),
    supabase.from('gameweeks').select('id, season_id, number, star_man_locks_at').order('number', { ascending: true }),
    supabase.from('fixtures').select('id, season_id, gameweek_id, original_gameweek_id, home_team_id, away_team_id, kickoff_at, status, sort_order').order('kickoff_at', { ascending: true }),
    supabase.from('players').select('id, display_name, team_id').eq('is_active', true).order('display_name', { ascending: true }).range(0, 2500),
    supabase.from('card_definitions').select('id, name, deck_type').order('name', { ascending: true }),
  ]);

  for (const response of [seasonResponse, teamResponse, gameweekResponse, fixtureResponse, playerResponse, cardResponse]) {
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
  state.players = playerResponse.data || [];
  state.cards = (cardResponse.data || []).filter((card) => card.deck_type === 'game' || card.id === 'super_pen');
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
  const saveAllButtons = [...document.querySelectorAll('[data-save-all-results]')];
  populateGameweekSelect(select);

  async function renderList() {
    const fixtures = state.fixtures.filter((fixture) => String(fixture.gameweek_id) === select.value);
    if (!fixtures.length) {
      list.innerHTML = '<p class="section-copy">No fixtures found.</p>';
      setButtonsDisabled(saveAllButtons, true);
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
          <span>${result ? 'Saved' : 'Pending'}</span>
        </div>
      `;
    }).join('');

    setButtonsDisabled(saveAllButtons, fixtures.length === 0);
  }

  select.onchange = renderList;
  saveAllButtons.forEach((button) => {
    button.onclick = () => saveVisibleActualResults(list, message, saveAllButtons, renderList);
  });
  await renderList();
}

async function saveVisibleActualResults(list, message, buttons, renderList) {
  const rows = [...list.querySelectorAll('[data-fixture-id]')]
    .filter((row) => row.querySelector('[data-home-goals]').value !== '' && row.querySelector('[data-away-goals]').value !== '');

  if (!rows.length) {
    setMessage(message, 'Enter at least one complete result before saving.', 'error');
    return;
  }

  setMessage(message, 'Saving results...', 'info');
  setButtonsDisabled(buttons, true);

  try {
    for (const row of rows) {
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
        throw error;
      }

      const { error: fixtureError } = await supabase.from('fixtures').update({ status: 'final' }).eq('id', fixtureId);
      if (fixtureError) {
        throw fixtureError;
      }
    }

    setMessage(message, `${rows.length} result${rows.length === 1 ? '' : 's'} saved.`, 'success');
    await renderList();
  } catch (error) {
    setMessage(message, error.message || 'Could not save actual results.', 'error');
  } finally {
    setButtonsDisabled(buttons, false);
  }
}

function renderSchedule() {
  const select = document.querySelector('[data-schedule-filter]');
  const list = document.querySelector('[data-schedule-list]');
  const message = document.querySelector('[data-schedule-message]');
  const saveAllButtons = [...document.querySelectorAll('[data-save-all-schedules]')];
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

    setButtonsDisabled(saveAllButtons, fixtures.length === 0);
  }

  select.onchange = renderList;
  saveAllButtons.forEach((button) => {
    button.onclick = () => saveVisibleScheduleRows(list, message, saveAllButtons, renderList);
  });
  renderList();
}

async function saveVisibleScheduleRows(list, message, buttons, renderList) {
  const rows = [...list.querySelectorAll('[data-fixture-id]')];
  if (!rows.length) {
    setMessage(message, 'No fixtures to save.', 'info');
    return;
  }

  setMessage(message, 'Saving fixtures...', 'info');
  setButtonsDisabled(buttons, true);

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
    setButtonsDisabled(buttons, list.querySelectorAll('[data-fixture-id]').length === 0);
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
  const saveButtons = [...document.querySelectorAll('[data-save-fixture-stats]')];
  if (!fixtureId) {
    list.innerHTML = '<p class="section-copy">Choose a fixture.</p>';
    setButtonsDisabled(saveButtons, true);
    return;
  }

  const { data } = await supabase.from('fixture_game_stats').select('*').eq('fixture_id', fixtureId).maybeSingle();
  list.innerHTML = `
    <div class="admin-row fixture-stats" data-fixture-id="${fixtureId}">
      <strong>${escapeHtml(fixtureLabel(state.fixtures.find((fixture) => fixture.id === fixtureId)))}</strong>
      <label><input data-heavy-snow type="checkbox" ${data?.played_in_heavy_snow ? 'checked' : ''}> Heavy snow</label>
    </div>
  `;
  setButtonsDisabled(saveButtons, false);
  saveButtons.forEach((button) => {
    button.onclick = () => saveFixtureStats(message);
  });
}

async function saveFixtureStats(message) {
  const row = document.querySelector('[data-fixture-stats-list] [data-fixture-id]');
  if (!row) {
    setMessage(message, 'Choose a fixture before saving.', 'error');
    return;
  }
  const { error } = await supabase.from('fixture_game_stats').upsert({
    fixture_id: row.dataset.fixtureId,
    played_in_heavy_snow: row.querySelector('[data-heavy-snow]').checked,
    entered_by: state.user.id,
  });

  setMessage(message, error ? error.message : 'Fixture stats saved.', error ? 'error' : 'success');
}

function sortedTeamFixtures(teamId) {
  return state.fixtures
    .filter((fixture) => fixture.home_team_id === teamId || fixture.away_team_id === teamId)
    .sort((a, b) => {
      const gameweekDiff = Number(gameweekNumber(a.gameweek_id)) - Number(gameweekNumber(b.gameweek_id));
      if (gameweekDiff) {
        return gameweekDiff;
      }
      return new Date(a.kickoff_at || 0).getTime() - new Date(b.kickoff_at || 0).getTime();
    });
}

function selectedPlayerStatPlayer() {
  return state.players.find((player) => player.id === playerStatFlow.playerId) || null;
}

function selectedPlayerStatFixture() {
  return state.fixtures.find((fixture) => fixture.id === playerStatFlow.fixtureId) || null;
}

function updatePlayerStatsStepVisibility() {
  const section = document.querySelector('[data-admin-section="player-stats"]');
  if (!section) {
    return;
  }

  const step = !playerStatFlow.playerId
    ? 'search'
    : !playerStatFlow.fixtureId
      ? 'fixture'
      : 'entry';

  section.querySelectorAll('[data-player-step]').forEach((panel) => {
    panel.hidden = panel.dataset.playerStep !== step;
  });

  const entry = section.querySelector('[data-player-stats-entry]');
  if (entry) {
    entry.hidden = step !== 'entry';
  }
}

function renderPlayerStatsControls() {
  const message = document.querySelector('[data-player-stats-message]');
  if (message) {
    setMessage(message, '', 'info');
  }

  if (playerStatFlow.playerId && !selectedPlayerStatPlayer()) {
    playerStatFlow.playerId = null;
    playerStatFlow.fixtureId = null;
  }

  updatePlayerStatsStepVisibility();
  renderPlayerStatsSearch();
  renderPlayerStatsFixtureList();
  renderPlayerStatsEntry();
}

function matchingPlayerStatsSearchResults() {
  if (normaliseSearchText(playerStatFlow.query).length < 2) {
    return [];
  }

  return state.players
    .filter((player) => playerMatchesSearch(player, playerStatFlow.query))
    .slice(0, 24);
}

function choosePlayerForStats(playerId) {
  playerStatFlow.playerId = playerId;
  playerStatFlow.fixtureId = null;

  const player = selectedPlayerStatPlayer();
  if (player) {
    playerStatFlow.query = player.display_name || '';
  }

  updatePlayerStatsStepVisibility();
  renderPlayerStatsSearch();
  renderPlayerStatsFixtureList();
  renderPlayerStatsEntry();
}

function renderPlayerStatsSearch() {
  const list = document.querySelector('[data-player-stats-player-list]');
  const input = document.querySelector('[data-player-stats-search]');
  const confirmButton = document.querySelector('[data-player-stats-confirm]');
  if (!list) {
    return;
  }

  if (input && document.activeElement !== input) {
    input.value = playerStatFlow.query;
  }

  const results = matchingPlayerStatsSearchResults();
  if (confirmButton) {
    confirmButton.disabled = !results.length && !selectedPlayerStatPlayer();
    confirmButton.onclick = () => {
      const selected = selectedPlayerStatPlayer();
      choosePlayerForStats(selected?.id || results[0]?.id);
    };
  }

  if (input) {
    input.oninput = () => {
      playerStatFlow.query = input.value;
      playerStatFlow.playerId = null;
      playerStatFlow.fixtureId = null;
      updatePlayerStatsStepVisibility();
      renderPlayerStatsSearch();
      renderPlayerStatsFixtureList();
      renderPlayerStatsEntry();
    };

    input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (results[0]) {
          choosePlayerForStats(results[0].id);
        }
      }
    };
  }

  if (normaliseSearchText(playerStatFlow.query).length < 2) {
    list.innerHTML = '<p class="section-copy">Type at least 2 letters to search players.</p>';
    return;
  }

  list.innerHTML = results.map((player) => `
    <button class="admin-pick-card ${player.id === playerStatFlow.playerId ? 'active' : ''}" type="button" data-player-stats-player="${player.id}">
      ${escapeHtml(player.display_name)}
      <small>${escapeHtml(teamName(player.team_id))}</small>
    </button>
  `).join('') || '<p class="section-copy">No matching active players found.</p>';

  list.querySelectorAll('[data-player-stats-player]').forEach((button) => {
    button.addEventListener('click', () => {
      choosePlayerForStats(button.dataset.playerStatsPlayer);
    });
  });
}

function renderPlayerStatsFixtureList() {
  const list = document.querySelector('[data-player-stats-fixture-list]');
  if (!list) {
    return;
  }

  const player = selectedPlayerStatPlayer();
  if (!player) {
    list.innerHTML = '<p class="section-copy">Search and choose a player first.</p>';
    return;
  }

  const fixtures = sortedTeamFixtures(player.team_id);
  if (playerStatFlow.fixtureId && !fixtures.some((fixture) => fixture.id === playerStatFlow.fixtureId)) {
    playerStatFlow.fixtureId = null;
  }

  list.innerHTML = `
    <div class="admin-step-actions">
      <button class="admin-step-back" type="button" data-player-stats-back-player>Change Player</button>
    </div>
    <p class="section-copy">${escapeHtml(player.display_name)} - ${escapeHtml(teamName(player.team_id))}</p>
    ${fixtures.map((fixture) => `
    <button class="admin-pick-card ${fixture.id === playerStatFlow.fixtureId ? 'active' : ''}" type="button" data-player-stats-fixture="${fixture.id}">
      ${escapeHtml(fixtureLabel(fixture))}
      <small>${escapeHtml(new Date(fixture.kickoff_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }))}</small>
    </button>
  `).join('') || '<p class="section-copy">No fixtures found for this team.</p>'}
  `;

  list.querySelector('[data-player-stats-back-player]')?.addEventListener('click', () => {
    playerStatFlow.playerId = null;
    playerStatFlow.fixtureId = null;
    updatePlayerStatsStepVisibility();
    renderPlayerStatsSearch();
    renderPlayerStatsFixtureList();
    renderPlayerStatsEntry();
  });

  list.querySelectorAll('[data-player-stats-fixture]').forEach((button) => {
    button.addEventListener('click', () => {
      playerStatFlow.fixtureId = button.dataset.playerStatsFixture;
      updatePlayerStatsStepVisibility();
      renderPlayerStatsFixtureList();
      renderPlayerStatsEntry();
    });
  });
}

async function renderPlayerStatsEntry() {
  const entry = document.querySelector('[data-player-stats-entry]');
  const message = document.querySelector('[data-player-stats-message]');
  if (!entry) {
    return;
  }

  const player = selectedPlayerStatPlayer();
  const fixture = selectedPlayerStatFixture();

  if (!player) {
    entry.innerHTML = '<p class="section-copy">Search for a player to begin.</p>';
    return;
  }

  if (!fixture) {
    entry.innerHTML = '<p class="section-copy">Select a fixture.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('player_fixture_stats')
    .select('goals, assists, yellow_cards, red_cards')
    .eq('fixture_id', fixture.id)
    .eq('player_id', player.id)
    .maybeSingle();

  if (error) {
    entry.innerHTML = `<p class="section-copy">${escapeHtml(error.message)}</p>`;
    return;
  }

  entry.innerHTML = `
    <div class="player-stat-summary">
      <strong>${escapeHtml(player.display_name)}</strong>
      <span>${escapeHtml(fixtureLabel(fixture))}</span>
    </div>
    <div class="player-stat-save-row">
      <button class="admin-step-back" type="button" data-player-stats-back-fixture>Change Fixture</button>
    </div>
    <div class="player-stat-save-row">
      <button class="primary" type="button" data-save-selected-player-stat>Save Player Stats</button>
    </div>
    <div class="player-stat-form">
      <label class="stat-field"><span>Goals</span><input data-goals type="number" min="0" max="20" value="${data?.goals ?? 0}"></label>
      <label class="stat-field"><span>Assists</span><input data-assists type="number" min="0" max="20" value="${data?.assists ?? 0}"></label>
      <label class="stat-field"><span>Yellow Cards</span><input data-yellows type="number" min="0" max="2" value="${data?.yellow_cards ?? 0}"></label>
      <label class="stat-field"><span>Red Cards</span><input data-reds type="number" min="0" max="2" value="${data?.red_cards ?? 0}"></label>
    </div>
    <div class="player-stat-save-row">
      <button class="primary" type="button" data-save-selected-player-stat>Save Player Stats</button>
    </div>
  `;

  entry.querySelectorAll('[data-save-selected-player-stat]').forEach((button) => {
    button.addEventListener('click', () => saveSelectedPlayerStats(message));
  });

  entry.querySelector('[data-player-stats-back-fixture]')?.addEventListener('click', () => {
      playerStatFlow.fixtureId = null;
      updatePlayerStatsStepVisibility();
      renderPlayerStatsFixtureList();
      renderPlayerStatsEntry();
  });
}

async function saveSelectedPlayerStats(message) {
  const entry = document.querySelector('[data-player-stats-entry]');
  const player = selectedPlayerStatPlayer();
  const fixture = selectedPlayerStatFixture();

  if (!entry || !player || !fixture) {
    setMessage(message, 'Choose a player and fixture before saving.', 'error');
    return;
  }

  const isHome = player.team_id === fixture.home_team_id;
  const fixtureStats = {
    season_id: state.season.id,
    fixture_id: fixture.id,
    gameweek_id: fixture.gameweek_id,
    player_id: player.id,
    team_id: player.team_id,
    opponent_team_id: isHome ? fixture.away_team_id : fixture.home_team_id,
    was_home_team: isHome,
    goals: numberOrZero(entry.querySelector('[data-goals]').value),
    assists: numberOrZero(entry.querySelector('[data-assists]').value),
    outside_box_goals: 0,
    outside_box_assists: 0,
    yellow_cards: numberOrZero(entry.querySelector('[data-yellows]').value),
    red_cards: numberOrZero(entry.querySelector('[data-reds]').value),
    started: null,
    was_benched: null,
    was_in_matchday_squad: null,
    was_substituted: null,
    substituted_on_minute: null,
    substituted_off_minute: null,
    minutes_played: null,
    entered_by: state.user.id,
  };

  setMessage(message, 'Saving player stats...', 'info');

  const { error: fixtureError } = await supabase
    .from('player_fixture_stats')
    .upsert(fixtureStats, { onConflict: 'fixture_id,player_id' });

  if (fixtureError) {
    setMessage(message, fixtureError.message, 'error');
    return;
  }

  const { data: fixtureRows, error: totalsError } = await supabase
    .from('player_fixture_stats')
    .select('goals, assists, yellow_cards, red_cards')
    .eq('season_id', state.season.id)
    .eq('gameweek_id', fixture.gameweek_id)
    .eq('player_id', player.id)
    .range(0, 100);

  if (totalsError) {
    setMessage(message, totalsError.message, 'error');
    return;
  }

  const totals = (fixtureRows || []).reduce((sum, row) => ({
    goals: sum.goals + numberOrZero(row.goals),
    assists: sum.assists + numberOrZero(row.assists),
    yellow_cards: sum.yellow_cards + numberOrZero(row.yellow_cards),
    red_cards: sum.red_cards + numberOrZero(row.red_cards),
  }), { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 });

  const { error: gameweekError } = await supabase.from('player_gameweek_stats').upsert({
    season_id: state.season.id,
    gameweek_id: fixture.gameweek_id,
    player_id: player.id,
    goals: totals.goals,
    assists: totals.assists,
    outside_box_goals: 0,
    outside_box_assists: 0,
    yellow_cards: totals.yellow_cards,
    red_cards: totals.red_cards,
    started: null,
    was_benched: null,
    minutes_played: null,
    entered_by: state.user.id,
  }, {
    onConflict: 'season_id,gameweek_id,player_id',
  });

  if (gameweekError) {
    setMessage(message, gameweekError.message, 'error');
    return;
  }

  setMessage(message, 'Player stats saved.', 'success');
  await renderPlayerStatsEntry();
}

async function renderGameCardResults() {
  const gameweekSelect = document.querySelector('[data-game-card-gameweek]');
  const cardSelect = document.querySelector('[data-game-card-card]');
  const valueInput = document.querySelector('[data-game-card-value]');
  populateGameweekSelect(gameweekSelect);
  cardSelect.innerHTML = options(state.cards, 'id', (card) => (
    card.id === 'super_pen' ? 'Weekly Penalties Scored (for Super Pen)' : card.name
  ));

  async function calculatedValue(cardId, gameweekId) {
    if (cardId === 'game_goals') {
      const fixtureIds = state.fixtures
        .filter((fixture) => String(fixture.gameweek_id) === String(gameweekId))
        .map((fixture) => fixture.id);

      if (!fixtureIds.length) {
        return null;
      }

      const { data, error } = await supabase
        .from('match_results')
        .select('home_goals, away_goals')
        .in('fixture_id', fixtureIds);

      if (error || !data?.length) {
        return null;
      }

      return data.reduce((total, row) => total + numberOrZero(row.home_goals) + numberOrZero(row.away_goals), 0);
    }

    if (cardId === 'game_goalhanger') {
      const { data, error } = await supabase
        .from('player_gameweek_stats')
        .select('goals')
        .eq('season_id', state.season.id)
        .eq('gameweek_id', gameweekId)
        .gte('goals', 2)
        .range(0, 10000);

      if (error) {
        return null;
      }

      return (data || []).length;
    }

    if (cardId !== 'game_war') {
      return null;
    }

    const { data, error } = await supabase
      .from('player_gameweek_stats')
      .select('yellow_cards')
      .eq('season_id', state.season.id)
      .eq('gameweek_id', gameweekId)
      .range(0, 10000);

    if (error) {
      return null;
    }

    return (data || []).reduce((total, row) => total + numberOrZero(row.yellow_cards), 0);
  }

  async function loadValue() {
    const { data } = await supabase
      .from('game_card_actual_results')
      .select('actual_value')
      .eq('season_id', state.season.id)
      .eq('gameweek_id', gameweekSelect.value)
      .eq('card_id', cardSelect.value)
      .maybeSingle();
    const autoValue = await calculatedValue(cardSelect.value, gameweekSelect.value);
    valueInput.value = data?.actual_value ?? autoValue ?? '';
  }

  gameweekSelect.onchange = loadValue;
  cardSelect.onchange = loadValue;
  document.querySelectorAll('[data-save-game-card-result]').forEach((button) => {
    button.onclick = saveGameCardResult;
  });
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

  setMessage(message, error ? error.message : 'Gameweek result saved.', error ? 'error' : 'success');
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
