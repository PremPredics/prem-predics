import { supabase } from './supabase-client.js';
import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';

const earnedCount = document.querySelector('[data-earned-count]');
const medalList = document.querySelector('[data-medal-list]');
const leagueLink = document.querySelector('[data-league-link]');

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

async function loadMedals() {
  const context = await loadLeagueContext();
  if (context.error) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(context.error)}</p>`;
    return;
  }

  leagueLink.href = leagueUrl('league.html', context.league.id);

  const { error: syncError } = await supabase.rpc('sync_my_card_draw_tokens', {
    target_competition_id: context.league.id,
  });

  if (syncError) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(syncError.message)}</p>`;
    return;
  }

  const { data: tokens, error: tokenError } = await supabase
    .from('card_draw_tokens')
    .select('id, token_type, source_type, source_key, source_game_card_round_id, status, created_at, redeemed_at')
    .eq('competition_id', context.league.id)
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false });

  if (tokenError) {
    medalList.innerHTML = `<p class="empty">${escapeHtml(tokenError.message)}</p>`;
    return;
  }

  const earnedTokens = (tokens || []).filter((token) => token.status !== 'void');
  earnedCount.textContent = earnedTokens.length;

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
