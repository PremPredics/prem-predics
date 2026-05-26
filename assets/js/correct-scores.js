import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
  normaliseNested,
  shortTeamName,
} from './league-context.js';

const container = document.querySelector('[data-correct-scores]');
const leagueLink = document.querySelector('[data-league-link]');
const playerPills = document.querySelector('[data-player-pills]');
const title = document.querySelector('[data-correct-score-title]');

const state = {
  user: null,
  league: null,
  members: [],
  scoresByUser: new Map(),
  gameweekNumbers: new Map(),
  sourceEffectsByScore: new Map(),
  activeEffects: [],
  effectProfiles: new Map(),
  effectById: new Map(),
  selectedUserId: null,
};

const predictionCurseKeys = new Set([
  'curse_deleted_match',
  'curse_glasses',
  'curse_even_number',
  'curse_odd_number',
  'curse_hated',
  'curse_gambler',
]);

const predictionPowerKeys = new Set([
  'power_laundrette',
  'power_pessimist',
  'power_hedge',
  'power_of_god',
  'power_snow',
  'super_golden_gameweek',
]);

const effectNameOverrides = {
  curse_gambler: 'Curse of the Random',
};

const effectDescriptionOverrides = {
  curse_deleted_match: "Valid for 1 Gameweek. Choose one opponent prediction. The opponent cannot earn points from this game. Must be played at least 24 hours before the gameweek's first KO time. Cannot be played on a fixture while Power of the Hedge is active.",
  curse_glasses: "Valid for 1 Gameweek. Any 0-0 prediction that the opponent makes scores nothing. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_even_number: "Valid for 1 Gameweek. Opponent can only predict an even number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_odd_number: "Valid for 1 Gameweek. Opponent can only predict an odd number of goals for all teams. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_hated: "Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this Gameweek. Must be played at least 24 hours before the gameweek's first KO time.",
  curse_gambler: "Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek's first KO time.",
};

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

function effectDefinition(effect) {
  return normaliseNested(effect?.card_definitions) || {};
}

function effectKey(effect) {
  return effectDefinition(effect).effect_key || effect.payload?.effect_key || '';
}

function effectCategory(effect) {
  const category = effectDefinition(effect).category;
  if (category) {
    return category === 'super' ? 'power' : category;
  }

  return effectKey(effect).startsWith('curse_') ? 'curse' : 'power';
}

function effectName(effect) {
  const key = effectKey(effect);
  return effectNameOverrides[key] || effectDefinition(effect).name || key.replaceAll('_', ' ');
}

function effectDescription(effect) {
  const key = effectKey(effect);
  return effectDescriptionOverrides[key] || effectDefinition(effect).description || 'This card affected this fixture.';
}

function playedByName(effect) {
  if (String(effect.played_by_user_id || '') === String(state.user?.id || '')) {
    return 'You';
  }

  return state.effectProfiles.get(effect.played_by_user_id)?.display_name || 'another player';
}

function scoreKey(score) {
  return `${score.user_id}:${score.fixture_id}`;
}

function isEffectForScoreGameweek(effect, score) {
  const gameweekId = score.gameweek_id;
  const gameweekNumber = Number(score.gameweek_number);
  const directGameweek = !effect.gameweek_id || sameId(effect.gameweek_id, gameweekId);
  const startNumber = effect.start_gameweek_id
    ? Number(state.gameweekNumbers.get(String(effect.start_gameweek_id)))
    : null;
  const endNumber = effect.end_gameweek_id
    ? Number(state.gameweekNumbers.get(String(effect.end_gameweek_id)))
    : null;
  const startsOk = !startNumber || startNumber <= gameweekNumber;
  const endsOk = !endNumber || endNumber >= gameweekNumber;
  return directGameweek && startsOk && endsOk;
}

function curseAppliesToScore(effect, score, sourceIds) {
  const key = effectKey(effect);
  if (sourceIds.has(String(effect.id))) {
    return true;
  }

  if (!predictionCurseKeys.has(key) || !sameId(effect.target_user_id, score.user_id)) {
    return false;
  }

  if (key === 'curse_deleted_match' || key === 'curse_hated') {
    return sameId(effect.fixture_id, score.fixture_id);
  }

  if (key === 'curse_gambler') {
    const ids = effect.payload?.gambler_fixture_ids || [];
    return ids.some((id) => sameId(id, score.fixture_id));
  }

  if (key === 'curse_glasses') {
    return Number(score.predicted_home_goals) === 0 && Number(score.predicted_away_goals) === 0;
  }

  return true;
}

function powerAppliesToScore(effect, score, sourceIds) {
  const key = effectKey(effect);
  if (sourceIds.has(String(effect.id))) {
    return true;
  }

  if (!predictionPowerKeys.has(key) || !sameId(effect.played_by_user_id, score.user_id)) {
    return false;
  }

  if (key === 'power_hedge' || key === 'power_of_god') {
    return Boolean(effect.fixture_id) && sameId(effect.fixture_id, score.fixture_id);
  }

  return !effect.fixture_id || sameId(effect.fixture_id, score.fixture_id);
}

function effectsForScore(score) {
  const sourceIds = state.sourceEffectsByScore.get(scoreKey(score)) || new Set();
  const effects = state.activeEffects.filter((effect) => (
    isEffectForScoreGameweek(effect, score)
    && (
      effectCategory(effect) === 'curse'
        ? curseAppliesToScore(effect, score, sourceIds)
        : powerAppliesToScore(effect, score, sourceIds)
    )
  ));

  const unique = new Map();
  effects.forEach((effect) => unique.set(String(effect.id), effect));
  return [...unique.values()].sort((a, b) => new Date(a.played_at || 0) - new Date(b.played_at || 0));
}

function renderEffectButtons(score) {
  const effects = effectsForScore(score);
  if (!effects.length) {
    return '';
  }

  return `
    <span class="correct-effects">
      ${effects.map((effect) => {
        const category = effectCategory(effect);
        const symbol = category === 'curse' ? '&#9760;' : '&#9994;';
        return `<button class="effect-marker ${category}-marker" type="button" data-card-effect="${escapeHtml(effect.id)}" aria-label="View ${escapeHtml(effectName(effect))}" title="${escapeHtml(effectName(effect))}">${symbol}</button>`;
      }).join('')}
    </span>
  `;
}

function openEffectModal(effectId) {
  const effect = state.effectById.get(String(effectId));
  const modal = document.querySelector('[data-card-effect-modal]');
  const panel = document.querySelector('[data-card-effect-panel]');
  const titleElement = document.querySelector('[data-card-effect-title]');
  const descriptionElement = document.querySelector('[data-card-effect-description]');
  const playerElement = document.querySelector('[data-card-effect-player]');
  if (!effect || !modal || !panel || !titleElement || !descriptionElement || !playerElement) {
    return;
  }

  const category = effectCategory(effect);
  panel.classList.remove('power-card', 'curse-card');
  panel.classList.add(`${category}-card`);
  titleElement.textContent = effectName(effect);
  descriptionElement.textContent = effectDescription(effect);
  playerElement.textContent = `Played by ${playedByName(effect)}`;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('card-modal-open');
}

function closeEffectModal() {
  const modal = document.querySelector('[data-card-effect-modal]');
  if (!modal) {
    return;
  }

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('card-modal-open');
}

function wireEffectButtons() {
  container.querySelectorAll('[data-card-effect]').forEach((button) => {
    button.addEventListener('click', () => openEffectModal(button.dataset.cardEffect));
  });
}

function avatarMarkup(member) {
  const imageUrl = member.profile_image_url?.startsWith('data:image/')
    ? member.profile_image_url
    : null;

  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="">`;
  }

  return escapeHtml((member.display_name || 'P').trim().charAt(0).toUpperCase() || 'P');
}

function selectedMember() {
  return state.members.find((member) => member.user_id === state.selectedUserId) || state.members[0] || null;
}

function renderPlayerPills() {
  playerPills.innerHTML = state.members.map((member) => `
    <button class="player-pill ${member.user_id === state.selectedUserId ? 'active' : ''}" type="button" data-user-id="${member.user_id}" title="${escapeHtml(member.display_name)}">
      ${avatarMarkup(member)}
    </button>
  `).join('');

  playerPills.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedUserId = button.dataset.userId;
      render();
    });
  });
}

function render() {
  if (!state.members.length) {
    title.textContent = 'Correct Scores';
    container.innerHTML = '<p class="empty">No league members found.</p>';
    return;
  }

  const member = selectedMember();
  const scores = state.scoresByUser.get(member.user_id) || [];

  renderPlayerPills();
  title.textContent = `${member.display_name}'s Correct Scores`;

  if (!scores.length) {
    container.innerHTML = '<p class="empty">No Correct Scores</p>';
    return;
  }

  container.innerHTML = scores.map((score) => {
    const effectButtons = renderEffectButtons(score);
    return `
      <div class="correct-score-row${effectButtons ? ' has-effects' : ''}">
        <span class="correct-gw-pill">GW${escapeHtml(score.gameweek_number)}</span>
        <span class="correct-fixture">
          <span class="correct-team correct-home">${escapeHtml(shortTeamName(score.home_team))}</span>
          <strong class="correct-scoreline">${escapeHtml(score.actual_home_goals)}-${escapeHtml(score.actual_away_goals)}</strong>
          <span class="correct-team correct-away">${escapeHtml(shortTeamName(score.away_team))}</span>
        </span>
        ${effectButtons}
      </div>
    `;
  }).join('');
  wireEffectButtons();
}

async function loadCorrectScores() {
  const context = await loadLeagueContext();
  if (context.error) {
    container.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    return;
  }

  state.user = context.user;
  state.league = context.league;
  leagueLink.href = leagueUrl('league.html', context.league.id);

  const [
    { data: members, error: memberError },
    { data: scores, error: scoreError },
    { data: scoreDetails, error: detailError },
    { data: activeEffects, error: effectError },
    { data: gameweeks, error: gameweekError },
  ] = await Promise.all([
    supabase
      .from('competition_members')
      .select('user_id, joined_at, profiles(id, display_name, profile_image_url, favorite_color)')
      .eq('competition_id', context.league.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('correct_scores')
      .select('competition_id, user_id, fixture_id, gameweek_id, gameweek_number, home_team, away_team, predicted_home_goals, predicted_away_goals, actual_home_goals, actual_away_goals')
      .eq('competition_id', context.league.id)
      .order('gameweek_number', { ascending: true }),
    supabase
      .from('prediction_score_details')
      .select('competition_id, user_id, fixture_id, source_card_effect_id, is_correct_score')
      .eq('competition_id', context.league.id)
      .eq('is_correct_score', true)
      .not('source_card_effect_id', 'is', null),
    supabase
      .from('active_card_effects')
      .select('id, fixture_id, gameweek_id, start_gameweek_id, end_gameweek_id, played_at, played_by_user_id, target_user_id, status, payload, card_definitions(effect_key, name, description, category)')
      .eq('competition_id', context.league.id)
      .eq('season_id', context.league.season_id)
      .in('status', ['active', 'resolved']),
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, gameweek_number')
      .eq('season_id', context.league.season_id),
  ]);

  if (memberError || scoreError || detailError || effectError || gameweekError) {
    container.innerHTML = `<p class="empty">${escapeHtml(memberError?.message || scoreError?.message || detailError?.message || effectError?.message || gameweekError?.message)}</p>`;
    return;
  }

  state.members = (members || [])
    .map((member) => {
      const profile = normaliseNested(member.profiles);
      return {
        user_id: member.user_id,
        joined_at: member.joined_at,
        display_name: profile?.display_name || 'Player',
        profile_image_url: profile?.profile_image_url || null,
      };
    })
    .sort((a, b) => {
      if (a.user_id === context.user.id) return -1;
      if (b.user_id === context.user.id) return 1;
      return String(a.display_name).localeCompare(String(b.display_name), 'en-GB');
    });

  state.scoresByUser = new Map();
  state.sourceEffectsByScore = new Map();
  state.gameweekNumbers = new Map((gameweeks || []).map((gameweek) => [
    String(gameweek.gameweek_id),
    Number(gameweek.gameweek_number),
  ]));

  (scoreDetails || []).forEach((detail) => {
    const key = `${detail.user_id}:${detail.fixture_id}`;
    const group = state.sourceEffectsByScore.get(key) || new Set();
    group.add(String(detail.source_card_effect_id));
    state.sourceEffectsByScore.set(key, group);
  });

  state.activeEffects = activeEffects || [];
  state.effectById = new Map(state.activeEffects.map((effect) => [String(effect.id), effect]));
  const playedByUserIds = [...new Set(state.activeEffects.map((effect) => effect.played_by_user_id).filter(Boolean))];
  state.effectProfiles = new Map();
  if (playedByUserIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', playedByUserIds);
    state.effectProfiles = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  const seen = new Set();
  (scores || []).forEach((score) => {
    const key = `${score.user_id}:${score.fixture_id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const group = state.scoresByUser.get(score.user_id) || [];
    group.push(score);
    state.scoresByUser.set(score.user_id, group);
  });

  state.selectedUserId = context.user.id;
  render();
}

loadCorrectScores();

document.querySelector('[data-close-card-effect]')?.addEventListener('click', closeEffectModal);
document.querySelector('[data-card-effect-modal]')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) {
    closeEffectModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeEffectModal();
  }
});
