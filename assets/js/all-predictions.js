import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';
import { loadActiveGameweek } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const title = document.querySelector('[data-view-title]');
const subtitle = document.querySelector('[data-view-subtitle]');
const currentGameweek = document.querySelector('[data-current-gameweek]');
const previousButton = document.querySelector('[data-previous-gameweek]');
const nextButton = document.querySelector('[data-next-gameweek]');
const playerPills = document.querySelector('[data-player-pills]');
const predictionList = document.querySelector('[data-prediction-list]');
const leagueBackLink = document.querySelector('[data-league-back]');
const predictionsBackLink = document.querySelector('[data-predictions-back]');
const curseModal = document.querySelector('[data-curse-modal]');
const curseModalBody = document.querySelector('[data-curse-modal-body]');
const closeCurseButton = document.querySelector('[data-close-curse]');

const predictionCurseKeys = new Set([
  'curse_deleted_match',
  'curse_glasses',
  'curse_even_number',
  'curse_odd_number',
  'curse_hated',
  'curse_gambler',
]);

const effectNameOverrides = {
  curse_gambler: 'Curse of the Random',
};

const effectDescriptionOverrides = {
  curse_deleted_match: "Valid for 1 Gameweek. Choose one opponent prediction. The opponent cannot earn points from this game. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_glasses: "Valid for 1 Gameweek. Any 0-0 prediction that the opponent makes scores nothing. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_even_number: "Valid for 1 Gameweek. Opponent can only predict an even number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_odd_number: "Valid for 1 Gameweek. Opponent can only predict an odd number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_hated: "Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this Gameweek. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_gambler: "Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek's first KO time.",
};

const state = {
  user: null,
  league: null,
  teams: new Map(),
  gameweeks: [],
  fixturesByGameweek: new Map(),
  members: [],
  effectProfiles: new Map(),
  visibleEffectsByFixture: new Map(),
  selectedGameweekIndex: 0,
  selectedUserId: null,
};

function isPast(value) {
  return value ? Date.now() >= new Date(value).getTime() : false;
}

function teamName(teamId) {
  return shortTeamName(state.teams.get(teamId) || 'Team');
}

function memberName(userId) {
  return state.members.find((member) => member.user_id === userId)?.display_name || 'Player';
}

function effectDefinition(effect) {
  return normaliseNested(effect?.card_definitions) || {};
}

function effectKey(effect) {
  return effectDefinition(effect).effect_key;
}

function effectName(effect) {
  const key = effectKey(effect);
  return effectNameOverrides[key] || effectDefinition(effect).name || 'Curse Card';
}

function effectDescription(effect) {
  const key = effectKey(effect);
  return effectDescriptionOverrides[key] || effectDefinition(effect).description || 'This curse affects this prediction.';
}

function playedByName(effect) {
  return state.effectProfiles.get(effect.played_by_user_id)?.display_name || 'An opponent';
}

function isPredictionCurse(effect) {
  return predictionCurseKeys.has(effectKey(effect));
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function avatar(member) {
  const imageUrl = member.profile_image_url?.startsWith('data:image/')
    ? member.profile_image_url
    : null;

  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="">`;
  }

  return escapeHtml((member.display_name || 'P').trim().charAt(0).toUpperCase() || 'P');
}

function selectedGameweek() {
  return state.gameweeks[state.selectedGameweekIndex] || null;
}

function fixturesForGameweek(gameweekId) {
  return state.fixturesByGameweek.get(String(gameweekId)) || [];
}

function gameweekHasLockedPredictions(gameweek) {
  const fixtures = fixturesForGameweek(gameweek.gameweek_id).filter((fixture) => fixture.status !== 'postponed');
  return fixtures.some((fixture) => isPast(fixture.prediction_locks_at));
}

function mostRecentPublicIndex(activeGameweek) {
  const publicIndexes = state.gameweeks
    .map((gameweek, index) => ({ gameweek, index }))
    .filter(({ gameweek }) => gameweekHasLockedPredictions(gameweek));

  if (publicIndexes.length) {
    return publicIndexes[publicIndexes.length - 1].index;
  }

  return Math.max(0, state.gameweeks.findIndex((gameweek) => gameweek.gameweek_id === activeGameweek?.gameweek_id));
}

function renderPlayers() {
  playerPills.innerHTML = state.members.map((member) => `
    <button class="player-pill ${member.user_id === state.selectedUserId ? 'active' : ''}" type="button" data-user-id="${member.user_id}" title="${escapeHtml(member.display_name)}">
      ${avatar(member)}
    </button>
  `).join('');

  playerPills.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedUserId = button.dataset.userId;
      render();
    });
  });
}

async function loadPredictions(gameweek, fixtures) {
  if (!fixtures.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('fixture_id, home_goals, away_goals, prediction_slot')
    .eq('competition_id', state.league.id)
    .eq('user_id', state.selectedUserId)
    .eq('prediction_slot', 'primary')
    .in('fixture_id', fixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  return new Map((data || []).map((prediction) => [prediction.fixture_id, prediction]));
}

async function loadResults(fixtures) {
  if (!fixtures.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('match_results')
    .select('fixture_id, home_goals, away_goals')
    .in('fixture_id', fixtures.map((fixture) => fixture.id));

  if (error) {
    throw error;
  }

  return new Map((data || []).map((result) => [result.fixture_id, result]));
}

async function loadCurseOverrides(gameweek, fixtures) {
  if (!fixtures.length) {
    return new Map();
  }

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const [hatedResult, randomResult] = await Promise.all([
    supabase
      .from('curse_hated_forced_predictions')
      .select('fixture_id, home_goals, away_goals, card_effect_id')
      .eq('competition_id', state.league.id)
      .eq('gameweek_id', gameweek.gameweek_id)
      .eq('target_user_id', state.selectedUserId)
      .in('fixture_id', fixtureIds),
    supabase
      .from('curse_gambler_rolls')
      .select('fixture_id, home_goals, away_goals, card_effect_id')
      .eq('competition_id', state.league.id)
      .eq('gameweek_id', gameweek.gameweek_id)
      .eq('target_user_id', state.selectedUserId)
      .in('fixture_id', fixtureIds),
  ]);

  if (hatedResult.error) {
    throw hatedResult.error;
  }
  if (randomResult.error) {
    throw randomResult.error;
  }

  return new Map([...(hatedResult.data || []), ...(randomResult.data || [])].map((row) => [
    row.fixture_id,
    {
      fixture_id: row.fixture_id,
      home_goals: row.home_goals,
      away_goals: row.away_goals,
      prediction_slot: 'curse_override',
      source_card_effect_id: row.card_effect_id,
    },
  ]));
}

function isEffectForGameweek(effect, gameweek) {
  const gameweekId = Number(gameweek.gameweek_id);
  const directGameweek = !effect.gameweek_id || Number(effect.gameweek_id) === gameweekId;
  const startsOk = !effect.start_gameweek_id || Number(effect.start_gameweek_id) <= gameweekId;
  const endsOk = !effect.end_gameweek_id || Number(effect.end_gameweek_id) >= gameweekId;
  return directGameweek && startsOk && endsOk;
}

async function loadPredictionEffects(gameweek) {
  const { data, error } = await supabase
    .from('active_card_effects')
    .select('id, fixture_id, gameweek_id, start_gameweek_id, end_gameweek_id, played_by_user_id, target_user_id, status, payload, card_definitions(effect_key, name, description, category)')
    .eq('competition_id', state.league.id)
    .eq('season_id', state.league.season_id)
    .eq('target_user_id', state.selectedUserId)
    .in('status', ['active', 'resolved']);

  if (error) {
    throw error;
  }

  const effects = (data || [])
    .filter((effect) => isEffectForGameweek(effect, gameweek))
    .filter(isPredictionCurse);

  const playedByUserIds = [...new Set(effects.map((effect) => effect.played_by_user_id).filter(Boolean))];
  state.effectProfiles = new Map();
  if (playedByUserIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', playedByUserIds);

    if (profilesError) {
      throw profilesError;
    }

    state.effectProfiles = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  return effects;
}

function curseAppliesToFixture(effect, fixture, prediction, override) {
  const key = effectKey(effect);
  if (sameId(override?.source_card_effect_id, effect.id)) {
    return true;
  }

  if (key === 'curse_deleted_match' || key === 'curse_hated') {
    return sameId(effect.fixture_id, fixture.id);
  }

  if (key === 'curse_gambler') {
    const ids = effect.payload?.gambler_fixture_ids || [];
    return ids.some((id) => sameId(id, fixture.id));
  }

  if (key === 'curse_glasses') {
    return prediction && Number(prediction.home_goals) === 0 && Number(prediction.away_goals) === 0;
  }

  return true;
}

function predictionCursesForFixture(fixture, effects, prediction, override) {
  return effects.filter((effect) => curseAppliesToFixture(effect, fixture, prediction, override));
}

function renderCurseMarker(fixture, curses) {
  if (!curses.length) {
    return '';
  }

  const hasRandomCurse = curses.some((effect) => effectKey(effect) === 'curse_gambler');
  const label = curses.length === 1 ? 'View active curse' : `View ${curses.length} active curses`;
  const markerClass = hasRandomCurse ? 'curse-marker dice-curse-marker' : 'curse-marker';
  const markerSymbol = hasRandomCurse ? '&#9856;' : '&#9760;';
  return `<button class="${markerClass}" type="button" data-curse-fixture="${fixture.id}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span>${markerSymbol}</span></button>`;
}

function predictionClass(prediction, result, locked) {
  if (!locked || !prediction || !result) {
    return '';
  }

  const predictedHome = Number(prediction.home_goals);
  const predictedAway = Number(prediction.away_goals);
  const actualHome = Number(result.home_goals);
  const actualAway = Number(result.away_goals);

  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 'correct-score';
  }

  if (Math.sign(predictedHome - predictedAway) === Math.sign(actualHome - actualAway)) {
    return 'correct-result';
  }

  return 'incorrect';
}

function predictionPoints(resultClass) {
  if (resultClass === 'correct-score') {
    return 3;
  }

  if (resultClass === 'correct-result') {
    return 1;
  }

  return 0;
}

function curseCardDetailMarkup(effect) {
  return `
    <div class="curse-card-wrap">
      <div class="curse-card-played-by">Played by ${escapeHtml(playedByName(effect))}</div>
      <article class="curse-detail-card">
        <strong>${escapeHtml(effectName(effect))}</strong>
        <p>${escapeHtml(effectDescription(effect))}</p>
      </article>
    </div>
  `;
}

function openCurseModal(fixtureId) {
  const effects = state.visibleEffectsByFixture.get(String(fixtureId)) || [];
  if (!curseModal || !curseModalBody || !effects.length) {
    return;
  }

  curseModalBody.innerHTML = effects.map(curseCardDetailMarkup).join('');
  curseModal.classList.add('show');
  curseModal.setAttribute('aria-hidden', 'false');
}

function closeCurseModal() {
  if (!curseModal) {
    return;
  }

  curseModal.classList.remove('show');
  curseModal.setAttribute('aria-hidden', 'true');
}

function wireCurseMarkers() {
  predictionList.querySelectorAll('[data-curse-fixture]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openCurseModal(button.dataset.curseFixture);
    });
  });
}

function wireResultRows() {
  predictionList.querySelectorAll('[data-result-toggle]').forEach((row) => {
    const toggle = () => {
      const expanded = row.classList.toggle('expanded');
      row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      row.querySelector('.actual-result-row')?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    };

    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  });
}

async function renderPredictionRows(gameweek) {
  const fixtures = fixturesForGameweek(gameweek.gameweek_id)
    .filter((fixture) => fixture.status !== 'postponed')
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));

  if (!fixtures.length) {
    predictionList.innerHTML = '<p class="state-text">No fixtures found for this gameweek.</p>';
    return;
  }

  const [predictions, results, curseOverrides, predictionEffects] = await Promise.all([
    loadPredictions(gameweek, fixtures),
    loadResults(fixtures),
    loadCurseOverrides(gameweek, fixtures),
    loadPredictionEffects(gameweek),
  ]);
  state.visibleEffectsByFixture = new Map();
  const visibleEffectIds = new Set(predictionEffects.map((effect) => String(effect.id)));
  predictionList.innerHTML = fixtures.map((fixture) => {
    const locked = isPast(fixture.prediction_locks_at);
    const rawOverride = locked ? curseOverrides.get(fixture.id) : null;
    const override = rawOverride && visibleEffectIds.has(String(rawOverride.source_card_effect_id))
      ? rawOverride
      : null;
    const prediction = locked ? (override || predictions.get(fixture.id)) : null;
    const result = results.get(fixture.id);
    const resultClass = predictionClass(prediction, result, locked);
    const points = predictionPoints(resultClass);
    const curses = locked
      ? predictionCursesForFixture(fixture, predictionEffects, prediction, override)
      : [];
    state.visibleEffectsByFixture.set(String(fixture.id), curses);
    const score = !locked
      ? '-'
      : prediction
        ? `${prediction.home_goals}-${prediction.away_goals}`
        : 'X-X';
    const actualScore = result
      ? `${result.home_goals}-${result.away_goals}`
      : '-';
    return `
      <div class="prediction-row ${locked ? 'locked' : 'unlocked'} ${locked && !prediction ? 'missed' : ''} ${resultClass}" data-result-toggle role="button" tabindex="0" aria-expanded="false">
        <span class="gw-badge">GW${escapeHtml(gameweek.gameweek_number)}</span>
        <span>${escapeHtml(teamName(fixture.home_team_id))}</span>
        <strong>${escapeHtml(score)}</strong>
        <span>${escapeHtml(teamName(fixture.away_team_id))}</span>
        <span class="row-actions">
          ${renderCurseMarker(fixture, curses)}
          ${points ? `<span class="uc-point-badge" aria-label="${points} UC points">${points}</span>` : ''}
        </span>
        <span class="actual-result-row" aria-hidden="true">
          <span class="actual-result-label">FT</span>
          <span class="actual-result-home">${escapeHtml(teamName(fixture.home_team_id))}</span>
          <strong class="actual-result-score">${escapeHtml(actualScore)}</strong>
          <span class="actual-result-away">${escapeHtml(teamName(fixture.away_team_id))}</span>
          <span aria-hidden="true"></span>
        </span>
      </div>
    `;
  }).join('');
  wireCurseMarkers();
  wireResultRows();
}

async function render() {
  const gameweek = selectedGameweek();
  if (!gameweek) {
    title.textContent = 'No predictions found';
    subtitle.textContent = 'No gameweeks are available for this league.';
    predictionList.innerHTML = '';
    return;
  }

  const selectedName = memberName(state.selectedUserId);
  title.textContent = `${selectedName}'s Predictions`;
  subtitle.textContent = `Gameweek ${gameweek.gameweek_number}`;
  currentGameweek.textContent = `GW${gameweek.gameweek_number}`;
  previousButton.disabled = state.selectedGameweekIndex <= 0;
  nextButton.disabled = state.selectedGameweekIndex >= state.gameweeks.length - 1;
  renderPlayers();

  try {
    await renderPredictionRows(gameweek);
  } catch (error) {
    predictionList.innerHTML = `<p class="state-text">${escapeHtml(error.message || 'Could not load predictions.')}</p>`;
  }
}

async function loadData(activeGameweek) {
  const [teamsResponse, deadlinesResponse, fixturesResponse, membersResponse] = await Promise.all([
    supabase.from('teams').select('id, name').order('name', { ascending: true }),
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at, star_man_locks_at')
      .eq('season_id', state.league.season_id)
      .order('gameweek_number', { ascending: true }),
    supabase
      .from('fixtures')
      .select('id, season_id, gameweek_id, home_team_id, away_team_id, kickoff_at, prediction_locks_at, status, sort_order')
      .eq('season_id', state.league.season_id)
      .order('kickoff_at', { ascending: true }),
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(display_name, profile_image_url)')
      .eq('competition_id', state.league.id)
      .order('joined_at', { ascending: true }),
  ]);

  for (const response of [teamsResponse, deadlinesResponse, fixturesResponse, membersResponse]) {
    if (response.error) {
      throw response.error;
    }
  }

  state.teams = new Map((teamsResponse.data || []).map((team) => [team.id, team.name]));
  state.gameweeks = (deadlinesResponse.data || [])
    .filter((gameweek) => Number(gameweek.gameweek_id) >= Number(state.league.starts_gameweek_id));
  state.fixturesByGameweek = new Map();
  (fixturesResponse.data || []).forEach((fixture) => {
    const key = String(fixture.gameweek_id);
    const group = state.fixturesByGameweek.get(key) || [];
    group.push(fixture);
    state.fixturesByGameweek.set(key, group);
  });
  state.members = (membersResponse.data || []).map((member) => {
    const profile = normaliseNested(member.profiles);
    return {
      user_id: member.user_id,
      display_name: profile?.display_name || 'Player',
      profile_image_url: profile?.profile_image_url || null,
    };
  });

  state.selectedUserId = state.user.id;
  state.selectedGameweekIndex = mostRecentPublicIndex(activeGameweek);
}

previousButton.addEventListener('click', () => {
  state.selectedGameweekIndex = Math.max(0, state.selectedGameweekIndex - 1);
  render();
});

nextButton.addEventListener('click', () => {
  state.selectedGameweekIndex = Math.min(state.gameweeks.length - 1, state.selectedGameweekIndex + 1);
  render();
});

closeCurseButton?.addEventListener('click', closeCurseModal);
curseModal?.addEventListener('click', (event) => {
  if (event.target === curseModal) {
    closeCurseModal();
  }
});

const context = await loadLeagueContext();
if (context.error) {
  title.textContent = 'Predictions unavailable';
  subtitle.textContent = context.error;
  predictionList.innerHTML = '';
} else {
  state.user = context.user;
  state.league = context.league;
  leagueBackLink.href = leagueUrl('league.html', state.league.id);
  predictionsBackLink.href = leagueUrl('prediction-hub.html', state.league.id);
  leagueBackLink.removeAttribute('aria-disabled');
  predictionsBackLink.removeAttribute('aria-disabled');

  try {
    const { activeGameweek } = await loadActiveGameweek(state.league);
    await loadData(activeGameweek);
    await render();
  } catch (error) {
    title.textContent = 'Predictions unavailable';
    subtitle.textContent = error.message || 'Could not load predictions.';
    predictionList.innerHTML = '';
  }
}
