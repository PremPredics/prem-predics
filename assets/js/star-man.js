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
const starBackLink = document.querySelector('[data-star-back]');
const historyList = document.querySelector('[data-star-man-history]');
const starCurseModal = document.querySelector('[data-star-curse-modal]');
const starCurseTitle = document.querySelector('[data-star-curse-title]');
const starCurseDescription = document.querySelector('[data-star-curse-description]');
const starCursePlayer = document.querySelector('[data-star-curse-player]');
const closeStarCurseButton = document.querySelector('[data-close-star-curse]');
const playerPreviewModal = document.querySelector('[data-player-preview-modal]');
const playerPreviewCard = document.querySelector('[data-player-preview-card]');
const closePlayerPreviewButton = document.querySelector('[data-close-player-preview]');
const confirmPlayerPreviewButton = document.querySelector('[data-confirm-player-preview]');

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
  effectProfiles: new Map(),
  drought3Ids: new Set(),
  drought5Ids: new Set(),
  top10TeamIds: new Set(),
  selected: {
    primary: null,
    super_duo: null,
  },
  pendingPlayerPreview: null,
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
  if (!button) {
    return;
  }
  button.disabled = !hasSelectionChanged(slot);
}

function isExistingPick(slot, player) {
  return Boolean(player) && String(state.existingPicks.get(slot) || '') === String(player.id);
}

function canSearchSlot(slot) {
  const gameweekLocked = isPast(state.activeGameweek?.star_man_locks_at);
  if (!gameweekLocked) {
    return true;
  }

  if (slot === 'super_duo') {
    return false;
  }

  const hasExistingPick = Boolean(state.existingPicks.get(slot));
  if (hasExistingPick) {
    return Boolean(ownEffect('super_sub'));
  }

  return Boolean(ownEffect('power_late_scout'));
}

function applySlotSearchState(slot) {
  const { input, results, button } = slotElements(slot);
  const canSearch = canSearchSlot(slot);

  if (input) {
    input.disabled = !canSearch;
    input.readOnly = !canSearch;
    input.placeholder = canSearch ? 'Search player' : 'Star Man locked';
  }

  if (!canSearch && results) {
    results.classList.remove('player-card-results');
    results.innerHTML = '';
  }

  if (!canSearch && button) {
    button.disabled = true;
  }

  return canSearch;
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

function playerInitials(player) {
  const parts = String(player.display_name || '')
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] || 'P';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${second}`.toUpperCase();
}

const nationalityFlagCodes = {
  albania: 'AL',
  algeria: 'DZ',
  argentina: 'AR',
  austria: 'AT',
  belgium: 'BE',
  brazil: 'BR',
  bulgaria: 'BG',
  'burkina faso': 'BF',
  cameroon: 'CM',
  colombia: 'CO',
  croatia: 'HR',
  'czech republic': 'CZ',
  denmark: 'DK',
  'dr congo': 'CD',
  ecuador: 'EC',
  egypt: 'EG',
  france: 'FR',
  gambia: 'GM',
  georgia: 'GE',
  germany: 'DE',
  ghana: 'GH',
  greece: 'GR',
  hungary: 'HU',
  iceland: 'IS',
  ireland: 'IE',
  italy: 'IT',
  'ivory coast': 'CI',
  jamaica: 'JM',
  japan: 'JP',
  mali: 'ML',
  mexico: 'MX',
  morocco: 'MA',
  mozambique: 'MZ',
  netherlands: 'NL',
  'new zealand': 'NZ',
  nigeria: 'NG',
  norway: 'NO',
  paraguay: 'PY',
  peru: 'PE',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  'republic of ireland': 'IE',
  scotland: 'GB-SCT',
  senegal: 'SN',
  serbia: 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  'south africa': 'ZA',
  'south korea': 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  trinidad: 'TT',
  'trinidad and tobago': 'TT',
  tunisia: 'TN',
  turkey: 'TR',
  ukraine: 'UA',
  uruguay: 'UY',
  'united states': 'US',
  uzbekistan: 'UZ',
  venezuela: 'VE',
  wales: 'GB-WLS',
  zimbabwe: 'ZW',
};

function regionalFlag(code) {
  return code
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}

function nationalityCode(nationality) {
  const key = normaliseText(nationality);
  if (key === 'england') {
    return 'ENG';
  }
  if (key === 'scotland') {
    return 'SCO';
  }
  if (key === 'wales') {
    return 'WAL';
  }
  if (key === 'northern ireland') {
    return 'NIR';
  }

  return nationalityFlagCodes[key] || 'INT';
}

function nationalityFlag(nationality) {
  const key = normaliseText(nationality);
  if (key === 'england') {
    return '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  }
  if (key === 'scotland') {
    return '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  }
  if (key === 'wales') {
    return '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}';
  }
  if (key === 'northern ireland') {
    return regionalFlag('GB');
  }

  const code = nationalityFlagCodes[key];
  return code ? regionalFlag(code) : '★';
}

function playerVisualMarkup(player) {
  const nationality = player.nationality || 'Nationality';
  const code = nationalityCode(nationality);

  return `
    <span class="player-card-photo-frame flag-card-visual" aria-label="${escapeHtml(nationality)}">
      <span class="player-card-flag" data-country-code="${escapeHtml(code)}" aria-hidden="true"></span>
      <span class="player-card-country">${escapeHtml(nationality)}</span>
    </span>
  `;
}

function playerCardMarkup(player, options = {}) {
  const mode = options.mode || 'search';
  const allowed = options.allowed !== false;
  const status = options.status || 'Available';
  const meta = [
    player.height_cm ? `${player.height_cm}cm` : '',
  ].filter(Boolean).join(' | ');

  return `
    <span class="player-card-name">${escapeHtml(player.display_name)}</span>
    ${playerVisualMarkup(player)}
    <span class="player-card-footer">
      <span class="player-card-team">${escapeHtml(teamName(player.team_id))}</span>
      ${mode === 'preview' || mode === 'selected' ? `<span class="player-card-meta">${escapeHtml(meta || 'Star Man Pick')}</span>` : `<span class="player-card-status">${escapeHtml(status)}</span>`}
    </span>
  `;
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

function effectDescription(effect) {
  return normaliseNested(effect.card_definitions)?.description || 'This curse affects your Star Man pick this Gameweek.';
}

function playedByName(effect) {
  return state.effectProfiles.get(effect.played_by_user_id)?.display_name || 'An opponent';
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
    'curse_scoring_drought_3',
    'curse_scoring_drought_5',
    'curse_tiny_club',
    'curse_random_roulette',
  ].includes(effectKey(effect)) && curseActiveNow());
}

function starManScoringCurses() {
  return effectsTargetingUser().filter((effect) => [
    'curse_furious',
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
  const baseFields = 'id, display_name, first_name, last_name, surname, nationality, team_id, height_cm, surname_scrabble_score';
  const { data, error } = await supabase
    .from('players')
    .select(baseFields)
    .eq('is_active', true)
    .not('team_id', 'is', null)
    .order('display_name', { ascending: true })
    .range(0, 4999);

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
    .select('id, card_id, season_id, gameweek_id, start_gameweek_id, end_gameweek_id, fixture_id, played_by_user_id, target_user_id, payload, card_definitions(effect_key, name, description, category)')
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

  const targetEffects = effectsTargetingUser();
  const playedByUserIds = [...new Set(targetEffects.map((effect) => effect.played_by_user_id).filter(Boolean))];
  state.effectProfiles = new Map();
  if (playedByUserIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', playedByUserIds);
    state.effectProfiles = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }
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
  const scoringCurses = starManScoringCurses();
  const helpful = [
    ownEffect('power_late_scout') ? 'Power of the Late Scout available after the normal lock.' : '',
    ownEffect('super_sub') ? 'Super Sub lets you swap Star Man until the new player fixture kicks off.' : '',
    ownEffect('super_duo') ? 'Super Duo allows a second Star Man before the gameweek lock.' : '',
  ].filter(Boolean);

  const curseEffects = [...activeRestrictions, ...scoringCurses];
  const boundaryText = activeRestrictions.map(effectName);
  const scoringText = scoringCurses.map((effect) => (
    `${effectName(effect)} active: yellow-card and red-card deductions are doubled this Gameweek.`
  ));
  const lines = [...boundaryText, ...scoringText, ...helpful];

  restrictionSummary.innerHTML = `
    <p class="state-text">${escapeHtml(lines.length ? lines.join(' ') : 'No active Star Man restrictions.')}</p>
    ${curseEffects.length ? `
      <div class="restriction-cards" aria-label="Active Star Man curse cards">
        ${curseEffects.map((effect) => `
          <button class="restriction-card-button" type="button" data-star-curse-effect="${escapeHtml(effect.id)}">
            ${escapeHtml(effectName(effect))}
          </button>
        `).join('')}
      </div>
    ` : ''}
  `;
  wireRestrictionCards();
}

function openStarCurseModal(effectId) {
  const effect = state.activeEffects.find((item) => String(item.id) === String(effectId));
  if (!effect || !starCurseModal || !starCurseTitle || !starCurseDescription || !starCursePlayer) {
    return;
  }

  starCurseTitle.textContent = effectName(effect);
  starCurseDescription.textContent = effectDescription(effect);
  starCursePlayer.textContent = `Played by ${playedByName(effect)}`;
  starCurseModal.classList.add('show');
  starCurseModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('card-modal-open');
}

function closeStarCurseModal() {
  if (!starCurseModal) {
    return;
  }

  starCurseModal.classList.remove('show');
  starCurseModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('card-modal-open');
}

function wireRestrictionCards() {
  restrictionSummary.querySelectorAll('[data-star-curse-effect]').forEach((button) => {
    button.addEventListener('click', () => openStarCurseModal(button.dataset.starCurseEffect));
  });
}

function renderExistingSelections() {
  ['primary', 'super_duo'].forEach((slot) => {
    const playerId = state.existingPicks.get(slot);
    const player = state.players.find((item) => item.id === playerId);
    if (!player) {
      return;
    }

    state.selected[slot] = player;
    const { input, button } = slotElements(slot);
    input.value = playerLabel(player);
    renderSelectedPlayer(slot, player, { saved: true });
    button.disabled = true;
    applySlotSearchState(slot);
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

function setResultsMessage(results, message) {
  results.classList.remove('player-card-results');
  results.innerHTML = `<p class="state-text">${escapeHtml(message)}</p>`;
}

function renderSelectedPlayer(slot, player, options = {}) {
  const { selected } = slotElements(slot);
  if (!selected) {
    return;
  }

  if (!player) {
    selected.classList.remove('has-card');
    selected.innerHTML = '';
    return;
  }

  const isSaved = options.saved === true;
  const heading = isSaved
    ? (slot === 'super_duo' ? 'Submitted Super Duo' : 'Submitted Star Man')
    : (slot === 'super_duo' ? 'Selected Super Duo' : 'Selected Star Man');

  selected.classList.add('has-card');
  selected.innerHTML = `
    <span class="selected-player-heading">${escapeHtml(heading)}</span>
    <span class="selected-player-card${isSaved ? ' saved' : ''}" aria-label="${escapeHtml(playerLabel(player))}">
      ${playerCardMarkup(player, { mode: 'selected' })}
    </span>
  `;
}

function selectPlayer(slot, player) {
  const { input, results } = slotElements(slot);
  state.selected[slot] = player;
  input.value = playerLabel(player);
  renderSelectedPlayer(slot, player);
  results.classList.remove('player-card-results');
  results.innerHTML = '';
  updateSaveButton(slot);

  if (slot === 'primary') {
    renderSearch('super_duo');
  }
}

function closePlayerPreview() {
  if (!playerPreviewModal) {
    return;
  }

  playerPreviewModal.classList.remove('show');
  playerPreviewModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('card-modal-open');
  state.pendingPlayerPreview = null;
}

function openPlayerPreview(slot, playerId) {
  const player = state.players.find((item) => String(item.id) === String(playerId));
  if (!player || !playerPreviewModal || !playerPreviewCard) {
    return;
  }

  state.pendingPlayerPreview = { slot, playerId: player.id };
  playerPreviewCard.innerHTML = `
    <div class="player-preview-card">
      ${playerCardMarkup(player, { mode: 'preview' })}
    </div>
  `;
  playerPreviewModal.classList.add('show');
  playerPreviewModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('card-modal-open');
}

function confirmPlayerPreview() {
  const preview = state.pendingPlayerPreview;
  if (!preview) {
    closePlayerPreview();
    return;
  }

  const player = state.players.find((item) => String(item.id) === String(preview.playerId));
  if (player) {
    selectPlayer(preview.slot, player);
  }
  closePlayerPreview();
}

function wirePlayerPreviewModal() {
  if (!playerPreviewModal) {
    return;
  }

  closePlayerPreviewButton?.addEventListener('click', closePlayerPreview);
  confirmPlayerPreviewButton?.addEventListener('click', confirmPlayerPreview);
  playerPreviewModal.addEventListener('click', (event) => {
    if (event.target === playerPreviewModal) {
      closePlayerPreview();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && playerPreviewModal.classList.contains('show')) {
      closePlayerPreview();
    }
  });
}

function renderSearch(slot) {
  const { input, results } = slotElements(slot);
  const query = input.value.trim();
  const selectedPlayer = state.selected[slot];
  const canSearch = applySlotSearchState(slot);

  renderSelectedPlayer(slot, selectedPlayer, { saved: isExistingPick(slot, selectedPlayer) });
  updateSaveButton(slot);

  if (!canSearch) {
    return;
  }

  const selectedSearchTerms = selectedPlayer ? [
    selectedPlayer.display_name,
    playerLabel(selectedPlayer),
    `${selectedPlayer.display_name} ${teamName(selectedPlayer.team_id)}`,
  ].map(normaliseText) : [];

  if (selectedPlayer && selectedSearchTerms.includes(normaliseText(query))) {
    results.classList.remove('player-card-results');
    results.innerHTML = '';
    return;
  }

  if (query.length < 2) {
    setResultsMessage(results, 'Type at least 2 letters.');
    return;
  }

  const matches = state.players
    .filter((player) => playerMatchesQuery(player, query))
    .filter((player) => String(player.id) !== String(selectedPlayer?.id || ''))
    .slice(0, 10);

  if (!matches.length) {
    setResultsMessage(results, 'No players found.');
    return;
  }

  results.classList.add('player-card-results');
  results.innerHTML = matches.map((player) => {
    const check = evaluatePlayer(player, slot);
    const reason = check.allowed ? 'Available' : 'Unavailable';
    const title = check.allowed ? `Choose ${playerLabel(player)}` : check.reasons.join(', ');
    return `
      <button class="player-result-card${check.allowed ? '' : ' unavailable'}" type="button" data-preview-player="${escapeHtml(player.id)}" data-preview-slot="${escapeHtml(slot)}" title="${escapeHtml(title)}" ${check.allowed ? '' : 'disabled'}>
        ${playerCardMarkup(player, { allowed: check.allowed, status: reason })}
      </button>
    `;
  }).join('');

  results.querySelectorAll('[data-preview-player]').forEach((resultButton) => {
    resultButton.addEventListener('click', () => {
      openPlayerPreview(resultButton.dataset.previewSlot, resultButton.dataset.previewPlayer);
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
  renderSelectedPlayer(slot, player, { saved: true });
  renderStarManHistory();
  setMessage(slot, slot === 'super_duo' ? 'Super Duo saved.' : 'Star Man saved.', 'success');
}

function wireSlots() {
  ['primary', 'super_duo'].forEach((slot) => {
    const { input, button } = slotElements(slot);
    input.addEventListener('input', () => {
      if (!canSearchSlot(slot)) {
        renderSearch(slot);
        return;
      }
      state.selected[slot] = null;
      renderSearch(slot);
    });
    button.addEventListener('click', () => savePick(slot));
  });
}

async function boot() {
  wireSlots();
  wirePlayerPreviewModal();

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
  if (starBackLink) {
    starBackLink.href = leagueUrl('star-man-hub.html', state.league.id);
  }
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

closeStarCurseButton?.addEventListener('click', closeStarCurseModal);
starCurseModal?.addEventListener('click', (event) => {
  if (event.target === starCurseModal) {
    closeStarCurseModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeStarCurseModal();
  }
});

boot();
