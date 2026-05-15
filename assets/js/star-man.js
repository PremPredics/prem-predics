import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  formatDateTime,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';

const leagueTitle = document.querySelector('[data-league-title]');
const gameweekSummary = document.querySelector('[data-gameweek-summary]');
const restrictionSummary = document.querySelector('[data-restriction-summary]');
const leagueBackLink = document.querySelector('[data-league-back]');
const historyList = document.querySelector('[data-star-man-history]');

const state = {
  user: null,
  league: null,
  activeGameweek: null,
  fixtures: [],
  teams: new Map(),
  players: [],
  existingPicks: new Map(),
  seasonPicks: [],
  gameweeks: [],
  usedStarManIds: new Set(),
  activeEffects: [],
  targetEffectIds: new Set(),
  previousBenchedIds: new Set(),
  drought3Ids: new Set(),
  drought5Ids: new Set(),
  top10TeamIds: new Set(),
  selected: {
    primary: null,
    super_duo: null,
  },
};

const CURSE_ACTIVATION_MS = 24 * 60 * 60 * 1000;
const effectNameOverrides = {
  curse_random_roulette: 'Curse Of The Microstate',
};
const microstateNationalities = new Set([
  'andorra',
  'antigua and barbuda',
  'antigua and deps',
  'bahamas',
  'barbados',
  'belize',
  'bhutan',
  'brunei',
  'cabo verde',
  'cape verde',
  'comoros',
  'dominica',
  'fiji',
  'grenada',
  'guyana',
  'iceland',
  'kiribati',
  'liechtenstein',
  'luxembourg',
  'maldives',
  'marshall islands',
  'micronesia',
  'monaco',
  'montenegro',
  'nauru',
  'palau',
  'saint kitts and nevis',
  'st kitts and nevis',
  'st kitts nevis',
  'saint lucia',
  'st lucia',
  'saint vincent and the grenadines',
  'saint vincent the grenadines',
  'st vincent and the grenadines',
  'samoa',
  'san marino',
  'sao tome and principe',
  'sao tome principe',
  'seychelles',
  'solomon islands',
  'suriname',
  'tonga',
  'tuvalu',
  'vanuatu',
  'vatican city',
]);

function slotElements(slot) {
  return {
    section: document.querySelector(`[data-pick-slot="${slot}"]`),
    input: document.querySelector(`[data-player-search="${slot}"]`),
    selected: document.querySelector(`[data-selected-player="${slot}"]`),
    results: document.querySelector(`[data-search-results="${slot}"]`),
    button: document.querySelector(`[data-save-star-man="${slot}"]`),
    message: document.querySelector(`[data-message="${slot}"]`),
  };
}

function hasSelectionChanged(slot) {
  const selectedId = state.selected[slot]?.id;
  const existingId = state.existingPicks.get(slot);
  return Boolean(selectedId) && String(selectedId) !== String(existingId || '');
}

function updateSaveButton(slot) {
  const { button } = slotElements(slot);
  button.disabled = !hasSelectionChanged(slot);
}

function setMessage(slot, text, type = 'info') {
  const { message } = slotElements(slot);
  message.textContent = text;
  message.dataset.type = type;
}

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function normaliseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[{}']/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function curseActivationAt() {
  const firstKickoff = state.activeGameweek?.first_fixture_kickoff_at || state.fixtures[0]?.kickoff_at;
  if (!firstKickoff) {
    return null;
  }
  return new Date(new Date(firstKickoff).getTime() - CURSE_ACTIVATION_MS).toISOString();
}

function curseActiveNow() {
  const activationAt = curseActivationAt();
  return activationAt ? isPast(activationAt) : false;
}

function teamName(teamId) {
  return shortTeamName(state.teams.get(teamId) || 'Team');
}

function playerLabel(player) {
  return `${player.display_name} (${teamName(player.team_id)})`;
}

function playerSearchTokens(player) {
  return [
    player.display_name,
    player.first_name,
    player.last_name,
    player.surname,
    player.nationality,
    teamName(player.team_id),
  ]
    .filter(Boolean)
    .flatMap((value) => normaliseText(value).split(' ').filter(Boolean));
}

function playerMatchesQuery(player, query) {
  const terms = normaliseText(query).split(' ').filter(Boolean);
  if (!terms.length) {
    return false;
  }
  const haystack = normaliseText([
    player.display_name,
    player.first_name,
    player.last_name,
    player.surname,
    player.nationality,
    teamName(player.team_id),
  ].filter(Boolean).join(' '));
  const tokens = playerSearchTokens(player);
  return terms.every((term) => (
    haystack.includes(term)
    || tokens.some((token) => token.startsWith(term))
  ));
}

function effectKey(effect) {
  return normaliseNested(effect.card_definitions)?.effect_key;
}

function effectName(effect) {
  const key = effectKey(effect);
  return effectNameOverrides[key] || normaliseNested(effect.card_definitions)?.name || effect.card_id;
}

function isEffectForCurrentGameweek(effect) {
  const gameweekId = Number(state.activeGameweek.gameweek_id);
  const directGameweek = !effect.gameweek_id || Number(effect.gameweek_id) === gameweekId;
  const startsOk = !effect.start_gameweek_id || Number(effect.start_gameweek_id) <= gameweekId;
  const endsOk = !effect.end_gameweek_id || Number(effect.end_gameweek_id) >= gameweekId;
  return directGameweek && startsOk && endsOk;
}

function effectsTargetingUser() {
  return state.activeEffects.filter((effect) => (
    effect.target_user_id === state.user.id || state.targetEffectIds.has(effect.id)
  ));
}

function ownEffect(key) {
  return state.activeEffects.find((effect) => (
    effect.played_by_user_id === state.user.id && effectKey(effect) === key
  ));
}

function restrictions() {
  return effectsTargetingUser().filter((effect) => [
    'curse_alphabet_15',
    'curse_alphabet_20',
    'curse_bench_warmer',
    'curse_scoring_drought_3',
    'curse_scoring_drought_5',
    'curse_tiny_club',
    'curse_random_roulette',
  ].includes(effectKey(effect)) && curseActiveNow());
}

function activeRestrictionSourceEffectId() {
  return restrictions()[0]?.id || null;
}

function hasMicrostateNationality(player) {
  const normalised = normaliseText(player.nationality);
  return microstateNationalities.has(normalised);
}

function playerFixture(player) {
  return state.fixtures.find((fixture) => (
    fixture.home_team_id === player.team_id || fixture.away_team_id === player.team_id
  ));
}

function deadlineCheck(player, slot) {
  const globalLocked = isPast(state.activeGameweek.star_man_locks_at);

  if (slot === 'super_duo') {
    const superDuo = ownEffect('super_duo');
    if (!superDuo) {
      return { allowed: false, reason: 'Super Duo is not active.', sourceCardEffectId: null };
    }

    if (globalLocked) {
      return { allowed: false, reason: 'Super Duo must be picked before the gameweek lock.', sourceCardEffectId: superDuo.id };
    }

    return { allowed: true, reason: '', sourceCardEffectId: superDuo.id };
  }

  if (!globalLocked) {
    return { allowed: true, reason: '', sourceCardEffectId: null };
  }

  const lateScout = ownEffect('power_late_scout');
  const fixture = playerFixture(player);
  if (lateScout && fixture && !isPast(fixture.kickoff_at)) {
    return { allowed: true, reason: '', sourceCardEffectId: lateScout.id };
  }

  const superSub = ownEffect('super_sub');
  if (superSub && fixture && !isPast(fixture.kickoff_at)) {
    return { allowed: true, reason: '', sourceCardEffectId: superSub.id };
  }

  return { allowed: false, reason: 'Star Man deadline has passed.', sourceCardEffectId: null };
}

function restrictionReasons(player) {
  const reasons = [];

  restrictions().forEach((effect) => {
    const key = effectKey(effect);
    if (key === 'curse_alphabet_15' && Number(player.surname_scrabble_score || 0) < 15) {
      reasons.push('surname Scrabble score must be 15+');
    }
    if (key === 'curse_alphabet_20' && Number(player.surname_scrabble_score || 0) < 20) {
      reasons.push('surname Scrabble score must be 20+');
    }
    if (key === 'curse_bench_warmer' && !state.previousBenchedIds.has(player.id)) {
      reasons.push('must have been benched last gameweek');
    }
    if (key === 'curse_scoring_drought_3' && !state.drought3Ids.has(player.id)) {
      reasons.push('must have 0 goals in last 3 gameweeks');
    }
    if (key === 'curse_scoring_drought_5' && !state.drought5Ids.has(player.id)) {
      reasons.push('must have 0 goals in last 5 gameweeks');
    }
    if (key === 'curse_tiny_club') {
      if (!state.top10TeamIds.size) {
        reasons.push('top-10 standings are not entered yet');
      } else if (state.top10TeamIds.has(player.team_id)) {
        reasons.push('cannot play for a top-10 club');
      }
    }
    if (key === 'curse_random_roulette' && !hasMicrostateNationality(player)) {
      reasons.push('nationality must be from a country with fewer than 1 million people');
    }
  });

  return reasons;
}

function evaluatePlayer(player, slot, options = {}) {
  const reasons = [];

  if (state.usedStarManIds.has(player.id)) {
    reasons.push('already used this season');
  }

  if (slot === 'super_duo' && state.selected.primary?.id === player.id) {
    reasons.push('already selected as Star Man');
  }

  reasons.push(...restrictionReasons(player));

  const deadline = options.ignoreDeadline
    ? { allowed: true, reason: '', sourceCardEffectId: null }
    : deadlineCheck(player, slot);
  if (!deadline.allowed) {
    reasons.push(deadline.reason);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    sourceCardEffectId: deadline.sourceCardEffectId || (options.ignoreDeadline ? activeRestrictionSourceEffectId() : null),
  };
}

async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  state.teams = new Map((data || []).map((team) => [team.id, team.name]));
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('id, display_name, first_name, last_name, surname, nationality, team_id, surname_scrabble_score, squad_number')
    .eq('is_active', true)
    .not('team_id', 'is', null)
    .order('display_name', { ascending: true })
    .range(0, 1999);

  if (error) {
    throw error;
  }

  state.players = data || [];
}

async function loadFixtures() {
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, kickoff_at, prediction_locks_at, status')
    .eq('season_id', state.league.season_id)
    .eq('gameweek_id', state.activeGameweek.gameweek_id)
    .order('kickoff_at', { ascending: true });

  if (error) {
    throw error;
  }

  state.fixtures = data || [];
}

async function loadPicks() {
  const [
    { data: currentPicks, error: currentError },
    { data: seasonPicks, error: seasonError },
    { data: gameweeks, error: gameweekError },
  ] = await Promise.all([
    supabase
      .from('star_man_picks')
      .select('player_id, pick_slot')
      .eq('competition_id', state.league.id)
      .eq('user_id', state.user.id)
      .eq('gameweek_id', state.activeGameweek.gameweek_id),
    supabase
      .from('star_man_picks')
      .select('player_id, gameweek_id, pick_slot')
      .eq('competition_id', state.league.id)
      .eq('user_id', state.user.id)
      .eq('season_id', state.league.season_id),
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, gameweek_number, star_man_locks_at')
      .eq('season_id', state.league.season_id)
      .order('gameweek_number', { ascending: true }),
  ]);

  if (currentError) {
    throw currentError;
  }
  if (seasonError) {
    throw seasonError;
  }
  if (gameweekError) {
    throw gameweekError;
  }

  state.existingPicks = new Map((currentPicks || []).map((pick) => [pick.pick_slot, pick.player_id]));
  state.seasonPicks = seasonPicks || [];
  state.gameweeks = gameweeks || [];
  state.usedStarManIds = new Set(
    (seasonPicks || [])
      .filter((pick) => String(pick.gameweek_id) !== String(state.activeGameweek.gameweek_id))
      .map((pick) => pick.player_id)
  );
}

async function loadEffects() {
  const { data: effects, error: effectsError } = await supabase
    .from('active_card_effects')
    .select('id, card_id, season_id, gameweek_id, start_gameweek_id, end_gameweek_id, fixture_id, played_by_user_id, target_user_id, payload, card_definitions(effect_key, name)')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .eq('status', 'active');

  if (effectsError) {
    throw effectsError;
  }

  const activeEffects = (effects || []).filter(isEffectForCurrentGameweek);
  const { data: targets, error: targetsError } = await supabase
    .from('card_effect_targets')
    .select('card_effect_id, target_user_id')
    .eq('target_user_id', state.user.id);

  if (targetsError) {
    throw targetsError;
  }

  state.activeEffects = activeEffects;
  state.targetEffectIds = new Set((targets || []).map((target) => target.card_effect_id));
}

async function loadRestrictionData() {
  const activeRestrictions = restrictions();
  const keys = new Set(activeRestrictions.map(effectKey));
  const activeNumber = Number(state.activeGameweek.gameweek_number);
  const { data: relevantGameweeks } = await supabase
    .from('gameweek_deadlines')
    .select('gameweek_id, gameweek_number')
    .eq('season_id', state.league.season_id)
    .gte('gameweek_number', Math.max(1, activeNumber - 5))
    .lte('gameweek_number', activeNumber - 1);
  const gameweeksByNumber = new Map((relevantGameweeks || []).map((gameweek) => [
    Number(gameweek.gameweek_number),
    gameweek.gameweek_id,
  ]));
  const previousGameweekId = gameweeksByNumber.get(activeNumber - 1);

  if (keys.has('curse_bench_warmer') && previousGameweekId) {
    const { data } = await supabase
      .from('player_fixture_stats')
      .select('player_id, was_benched')
      .eq('season_id', state.league.season_id)
      .eq('gameweek_id', previousGameweekId)
      .eq('was_benched', true)
      .range(0, 1999);
    state.previousBenchedIds = new Set((data || []).map((row) => row.player_id));
  }

  if ((keys.has('curse_scoring_drought_3') || keys.has('curse_scoring_drought_5')) && previousGameweekId) {
    const recentGameweekIds = (relevantGameweeks || [])
      .map((gameweek) => gameweek.gameweek_id)
      .filter(Boolean);
    const { data } = await supabase
      .from('player_gameweek_stats')
      .select('player_id, gameweek_id, goals')
      .eq('season_id', state.league.season_id)
      .in('gameweek_id', recentGameweekIds)
      .range(0, 10000);

    const goalsByPlayer = new Map();
    (data || []).forEach((row) => {
      const group = goalsByPlayer.get(row.player_id) || [];
      group.push(row);
      goalsByPlayer.set(row.player_id, group);
    });

    state.drought3Ids = new Set();
    state.drought5Ids = new Set();
    goalsByPlayer.forEach((rows, playerId) => {
      const sorted = rows.sort((a, b) => Number(b.gameweek_id) - Number(a.gameweek_id));
      const last3 = sorted.slice(0, 3);
      const last5 = sorted.slice(0, 5);
      if (last3.length >= 3 && last3.every((row) => Number(row.goals) === 0)) {
        state.drought3Ids.add(playerId);
      }
      if (last5.length >= 5 && last5.every((row) => Number(row.goals) === 0)) {
        state.drought5Ids.add(playerId);
      }
    });
  }

  if (keys.has('curse_tiny_club') && previousGameweekId) {
    let { data, error } = await supabase
      .from('team_gameweek_computed_standings')
      .select('team_id, league_position')
      .eq('season_id', state.league.season_id)
      .eq('gameweek_id', previousGameweekId)
      .lte('league_position', 10);

    if (error) {
      const fallback = await supabase
        .from('team_gameweek_standings')
        .select('team_id, league_position')
        .eq('season_id', state.league.season_id)
        .eq('gameweek_id', previousGameweekId)
        .lte('league_position', 10);
      data = fallback.data;
    }

    state.top10TeamIds = new Set((data || []).map((row) => row.team_id));
  }
}

function renderRestrictionSummary() {
  const activeRestrictions = restrictions();
  const helpful = [
    ownEffect('power_late_scout') ? 'Power of the Late Scout available after the normal lock.' : '',
    ownEffect('super_sub') ? 'Super Sub lets you swap Star Man until the new player fixture kicks off.' : '',
    ownEffect('super_duo') ? 'Super Duo allows a second Star Man before the gameweek lock.' : '',
  ].filter(Boolean);

  const boundaryText = activeRestrictions.map(effectName);
  const lines = [...boundaryText, ...helpful];
  restrictionSummary.textContent = lines.length ? lines.join(' ') : 'No active Star Man restrictions.';
}

function renderExistingSelections() {
  ['primary', 'super_duo'].forEach((slot) => {
    const playerId = state.existingPicks.get(slot);
    const player = state.players.find((item) => item.id === playerId);
    if (!player) {
      return;
    }

    state.selected[slot] = player;
    const { input, selected, button } = slotElements(slot);
    input.value = playerLabel(player);
    selected.textContent = `Selected: ${playerLabel(player)}`;
    button.disabled = true;
  });
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function autoReplaceInvalidPrimaryPick() {
  const existingPlayerId = state.existingPicks.get('primary');
  if (!existingPlayerId) {
    return;
  }

  const existingPlayer = state.players.find((item) => item.id === existingPlayerId);
  if (!existingPlayer) {
    return;
  }

  const activeRestrictionReasons = restrictionReasons(existingPlayer);
  if (!activeRestrictionReasons.length) {
    return;
  }

  const candidates = state.players.filter((player) => evaluatePlayer(player, 'primary', { ignoreDeadline: true }).allowed);
  if (!candidates.length) {
    return;
  }

  const replacement = randomItem(candidates);
  const replacementCheck = evaluatePlayer(replacement, 'primary', { ignoreDeadline: true });

  const { error } = await supabase.from('star_man_picks').upsert({
    competition_id: state.league.id,
    season_id: state.league.season_id,
    gameweek_id: state.activeGameweek.gameweek_id,
    user_id: state.user.id,
    player_id: replacement.id,
    pick_slot: 'primary',
    source_card_effect_id: replacementCheck.sourceCardEffectId,
  }, {
    onConflict: 'competition_id,gameweek_id,user_id,pick_slot',
  });

  if (error) {
    return;
  }

  state.existingPicks.set('primary', replacement.id);
  state.selected.primary = replacement;
  const savedPick = {
    player_id: replacement.id,
    gameweek_id: state.activeGameweek.gameweek_id,
    pick_slot: 'primary',
  };
  const existingIndex = state.seasonPicks.findIndex((pick) => (
    String(pick.gameweek_id) === String(savedPick.gameweek_id) && pick.pick_slot === 'primary'
  ));
  if (existingIndex >= 0) {
    state.seasonPicks[existingIndex] = savedPick;
  } else {
    state.seasonPicks.push(savedPick);
  }
}

function renderSearch(slot) {
  const { input, results, selected } = slotElements(slot);
  const query = input.value.trim();
  const selectedPlayer = state.selected[slot];

  selected.textContent = selectedPlayer ? `Selected: ${playerLabel(selectedPlayer)}` : '';
  updateSaveButton(slot);

  if (query.length < 2) {
    results.innerHTML = '<p class="state-text">Type at least 2 letters.</p>';
    return;
  }

  const matches = state.players
    .filter((player) => playerMatchesQuery(player, query))
    .slice(0, 10);

  if (!matches.length) {
    results.innerHTML = '<p class="state-text">No players found.</p>';
    return;
  }

  results.innerHTML = matches.map((player) => {
    const check = evaluatePlayer(player, slot);
    const reason = check.allowed ? 'Available' : check.reasons.join(', ');
    return `
      <button class="result-button" type="button" data-select-player="${player.id}" ${check.allowed ? '' : 'disabled'}>
        ${escapeHtml(player.display_name)}
        <span>${escapeHtml(teamName(player.team_id))} - ${escapeHtml(reason)}</span>
      </button>
    `;
  }).join('');

  results.querySelectorAll('[data-select-player]').forEach((resultButton) => {
    resultButton.addEventListener('click', () => {
      const player = state.players.find((item) => item.id === resultButton.dataset.selectPlayer);
      state.selected[slot] = player;
      input.value = playerLabel(player);
      results.innerHTML = '';
      renderSearch(slot);
      if (slot === 'primary') {
        renderSearch('super_duo');
      }
    });
  });
}

function renderStarManHistory() {
  if (!historyList) {
    return;
  }

  const gameweeksById = new Map(state.gameweeks.map((gameweek) => [String(gameweek.gameweek_id), gameweek]));
  const rows = state.seasonPicks
    .map((pick) => {
      const gameweek = gameweeksById.get(String(pick.gameweek_id));
      const player = state.players.find((item) => item.id === pick.player_id);
      return { pick, gameweek, player };
    })
    .filter(({ gameweek, player }) => {
      if (!gameweek || !player) {
        return false;
      }
      const isEarlierGameweek = Number(gameweek.gameweek_number) < Number(state.activeGameweek.gameweek_number);
      return isEarlierGameweek || isPast(gameweek.star_man_locks_at);
    })
    .sort((a, b) => (
      Number(a.gameweek.gameweek_number) - Number(b.gameweek.gameweek_number)
      || String(a.pick.pick_slot).localeCompare(String(b.pick.pick_slot))
    ));

  if (!rows.length) {
    historyList.innerHTML = '';
    return;
  }

  historyList.innerHTML = rows.map(({ pick, gameweek, player }) => `
    <div class="history-row">
      <strong>GW${escapeHtml(gameweek.gameweek_number)}</strong>
      <span>${escapeHtml(player.display_name)}</span>
      <small>${escapeHtml(teamName(player.team_id))}${pick.pick_slot === 'super_duo' ? ' - Super Duo' : ''}</small>
    </div>
  `).join('');
}

async function savePick(slot) {
  const player = state.selected[slot];
  if (!player) {
    setMessage(slot, 'Choose a player first.', 'error');
    return;
  }

  const check = evaluatePlayer(player, slot);
  if (!check.allowed) {
    setMessage(slot, check.reasons.join(', '), 'error');
    return;
  }

  setMessage(slot, 'Saving pick...', 'info');

  const { error } = await supabase.from('star_man_picks').upsert({
    competition_id: state.league.id,
    season_id: state.league.season_id,
    gameweek_id: state.activeGameweek.gameweek_id,
    user_id: state.user.id,
    player_id: player.id,
    pick_slot: slot,
    source_card_effect_id: check.sourceCardEffectId,
  }, {
    onConflict: 'competition_id,gameweek_id,user_id,pick_slot',
  });

  if (error) {
    if (error.code === '23505' || error.message.includes('star_man_picks_unique_player')) {
      setMessage(slot, 'You have already used that Star Man in this league this season.', 'error');
      return;
    }
    setMessage(slot, error.message || 'Could not save Star Man.', 'error');
    return;
  }

  state.existingPicks.set(slot, player.id);
  const savedPick = {
    player_id: player.id,
    gameweek_id: state.activeGameweek.gameweek_id,
    pick_slot: slot,
  };
  const existingIndex = state.seasonPicks.findIndex((pick) => (
    String(pick.gameweek_id) === String(savedPick.gameweek_id) && pick.pick_slot === slot
  ));
  if (existingIndex >= 0) {
    state.seasonPicks[existingIndex] = savedPick;
  } else {
    state.seasonPicks.push(savedPick);
  }
  updateSaveButton(slot);
  renderStarManHistory();
  setMessage(slot, slot === 'super_duo' ? 'Super Duo saved.' : 'Star Man saved.', 'success');
}

function wireSlots() {
  ['primary', 'super_duo'].forEach((slot) => {
    const { input, button } = slotElements(slot);
    input.addEventListener('input', () => {
      state.selected[slot] = null;
      renderSearch(slot);
    });
    button.addEventListener('click', () => savePick(slot));
  });
}

async function boot() {
  wireSlots();

  const context = await loadLeagueContext();
  if (context.error) {
    leagueTitle.textContent = 'Star Man unavailable';
    gameweekSummary.textContent = context.error;
    restrictionSummary.textContent = 'No league context.';
    return;
  }

  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);
  leagueTitle.textContent = 'Star Man Pick';

  try {
    const { activeGameweek } = await loadActiveGameweek(state.league);
    state.activeGameweek = activeGameweek;

    if (!state.activeGameweek) {
      gameweekSummary.textContent = 'No active gameweek found for this league.';
      restrictionSummary.textContent = 'No active gameweek.';
      return;
    }

    await Promise.all([loadTeams(), loadPlayers(), loadFixtures(), loadPicks(), loadEffects()]);
    await loadRestrictionData();
    await autoReplaceInvalidPrimaryPick();

    gameweekSummary.textContent = `Gameweek ${state.activeGameweek.gameweek_number} - Star Man Pick locks ${formatDateTime(state.activeGameweek.star_man_locks_at)}`;
    renderRestrictionSummary();

    const superDuoSection = slotElements('super_duo').section;
    superDuoSection.hidden = !ownEffect('super_duo');

    renderExistingSelections();
    renderStarManHistory();
    renderSearch('primary');
    renderSearch('super_duo');
  } catch (error) {
    leagueTitle.textContent = 'Star Man unavailable';
    gameweekSummary.textContent = error.message || 'Could not load Star Man page.';
    restrictionSummary.textContent = 'Could not check active card effects.';
  }
}

boot();
