import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import {
  nextMedalProgress,
  STAR_MAN_GOAL_MEDAL_THRESHOLDS,
  UC_POINT_MEDAL_THRESHOLDS,
} from './medal-progress.js';

const earnedCount = document.querySelector('[data-earned-count]');
const medalList = document.querySelector('[data-medal-list]');
const leagueLink = document.querySelector('[data-league-link]');
const superPenCount = document.querySelector('[data-super-pen-count]');
const medalProgressPanel = document.querySelector('[data-medal-progress]');

const possibleMedals = [
  ...[20, 40, 60, 80, 100, 125, 150, 175, 200, 225, 250, 275, 300].map((value) => ({
    key: `uc_points_${value}`,
    title: `Reach ${value} UC pts`,
    type: 'Regular',
  })),
  ...[1, 3, 5, 8, 12, 15, 20].map((value) => ({
    key: `star_man_goals_${value}`,
    title: `Reach ${value} Star Man ${value === 1 ? 'Goal' : 'Goals'}`,
    type: 'Regular',
  })),
  ...[
    'Game of Goals',
    'Game of Corners',
    'Game of The Underdog',
    'Game of The Goalhanger',
    'Game of War',
    'Game of The Early Worm',
    'Game of Time',
  ].map((name) => ({
    key: `game_card_${name}`,
    gameCardName: name,
    title: `Win '${name}' Game Card`,
    type: 'Super',
  })),
];

function medalProgressCardMarkup({ label, icon, unit, progress, className }) {
  const currentText = Number(progress.current).toLocaleString('en-GB');
  if (progress.complete) {
    return `
      <article class="medal-progress-card ${className} complete">
        <div class="medal-progress-top"><span><i aria-hidden="true">${icon}</i>${escapeHtml(label)}</span><strong>100%</strong></div>
        <div class="medal-progress-copy"><b>${currentText}</b><span>All milestone medals earned</span></div>
        <div class="medal-progress-track"><span style="width:100%"></span></div>
      </article>`;
  }

  return `
    <article class="medal-progress-card ${className}">
      <div class="medal-progress-top"><span><i aria-hidden="true">${icon}</i>${escapeHtml(label)}</span><strong>${progress.percentage}%</strong></div>
      <div class="medal-progress-copy"><b>${currentText}/${progress.nextThreshold}</b><span>Next medal at ${progress.nextThreshold} ${escapeHtml(unit)}</span></div>
      <div class="medal-progress-track" role="progressbar" aria-label="${escapeHtml(label)} medal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percentage}"><span style="width:${progress.percentage}%"></span></div>
    </article>`;
}

function renderMedalProgress(ranking, tokens) {
  if (!medalProgressPanel) return;
  const sourceKeys = (tokens || [])
    .filter((token) => token.status !== 'void' && token.source_type === 'accolade')
    .map((token) => token.source_key)
    .filter(Boolean);
  const ucProgress = nextMedalProgress(
    ranking?.ultimate_champion_points,
    UC_POINT_MEDAL_THRESHOLDS,
    sourceKeys,
    'uc_points_',
  );
  const goalsProgress = nextMedalProgress(
    ranking?.star_man_goals,
    STAR_MAN_GOAL_MEDAL_THRESHOLDS,
    sourceKeys,
    'star_man_goals_',
  );
  medalProgressPanel.innerHTML = `
    <div class="medal-progress-heading"><strong>Next Medal Progress</strong></div>
    <div class="medal-progress-grid">
      ${medalProgressCardMarkup({ label: 'UC Points', icon: '&#9733;', unit: 'UC pts', progress: ucProgress, className: 'uc-progress' })}
      ${medalProgressCardMarkup({ label: 'Star Man Goals', icon: '&#9917;', unit: 'goals', progress: goalsProgress, className: 'goal-progress' })}
    </div>`;
}

function renderTokens(tokens, wonGameCardNames = new Set()) {
  const earnedKeys = new Set(tokens.map((token) => token.source_key).filter(Boolean));

  medalList.innerHTML = possibleMedals.map((medal) => {
    const unlocked = medal.gameCardName
      ? wonGameCardNames.has(medal.gameCardName)
      : earnedKeys.has(medal.key);

    return `
    <div class="medal-accolade ${unlocked ? 'unlocked' : ''}">
      <strong>${escapeHtml(medal.title)}</strong>
      <span>${unlocked ? 'Earned' : 'Locked'} - ${escapeHtml(medal.type)}</span>
    </div>
  `;
  }).join('');
}

function isMissingRpcFunction(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202'
    || message.includes('could not find the function')
    || (message.includes('function') && message.includes('does not exist'));
}

async function loadMedals() {
  const context = await loadLeagueContext();
  if (context.error) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    if (medalProgressPanel) medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is unavailable.</span>';
    return;
  }

  leagueLink.href = leagueUrl('league.html', context.league.id);

  const { error: syncError } = await supabase.rpc('sync_my_card_draw_tokens', {
    target_competition_id: context.league.id,
  });

  if (syncError) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(syncError.message)}</p>`;
    if (medalProgressPanel) medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is temporarily unavailable.</span>';
    return;
  }

  const { error: superPenSyncError } = await supabase.rpc('sync_super_pen_card_draw_tokens', {
    target_competition_id: context.league.id,
  });

  if (superPenSyncError && !isMissingRpcFunction(superPenSyncError)) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(superPenSyncError.message)}</p>`;
    if (medalProgressPanel) medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is temporarily unavailable.</span>';
    return;
  }

  const [
    { data: tokens, error: tokenError },
    { data: ranking, error: rankingError },
  ] = await Promise.all([
    supabase
      .from('card_draw_tokens')
      .select('id, token_type, source_type, source_key, source_game_card_round_id, status, created_at, redeemed_at')
      .eq('competition_id', context.league.id)
      .eq('user_id', context.user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('leaderboard')
      .select('ultimate_champion_points, star_man_goals')
      .eq('competition_id', context.league.id)
      .eq('user_id', context.user.id)
      .maybeSingle(),
  ]);

  if (tokenError) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(tokenError.message)}</p>`;
    if (medalProgressPanel) medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is temporarily unavailable.</span>';
    return;
  }

  const earnedTokens = (tokens || []).filter((token) => token.status !== 'void');
  if (rankingError) {
    medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is temporarily unavailable.</span>';
  } else {
    renderMedalProgress(ranking || {}, earnedTokens);
  }
  earnedCount.textContent = earnedTokens.length;
  if (superPenCount) {
    superPenCount.textContent = earnedTokens
      .filter((token) => token.source_type === 'card_effect'
        && String(token.source_key || '').startsWith('super_pen_'))
      .length;
  }

  const gameCardRoundIds = earnedTokens
    .filter((token) => token.source_game_card_round_id)
    .map((token) => token.source_game_card_round_id);
  const wonGameCardNames = new Set();

  if (gameCardRoundIds.length) {
    const { data: rounds } = await supabase
      .from('game_card_rounds')
      .select('id, card_definitions(name)')
      .in('id', gameCardRoundIds);

    (rounds || []).forEach((round) => {
      const definition = Array.isArray(round.card_definitions)
        ? round.card_definitions[0]
        : round.card_definitions;
      if (definition?.name) {
        wonGameCardNames.add(definition.name);
      }
    });
  }

  renderTokens(tokens || [], wonGameCardNames);
}

loadMedals();
