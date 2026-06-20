import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import { isGameweekStarted, loadActiveGameweek, startCountdown } from './gameweek-context.js';
import { supabase } from './supabase-client.js';

const leagueName = document.querySelector('[data-league-name]');
const memberCount = document.querySelector('[data-member-count]');
const joinCode = document.querySelector('[data-join-code]');
const copyJoinCodeButton = document.querySelector('[data-copy-join-code]');
const gameweekLabel = document.querySelector('[data-gameweek-label]');
const gameweekCountdown = document.querySelector('[data-gameweek-countdown]');
const gameweekCard = document.querySelector('[data-gameweek-card]');
const deadlineStrip = document.querySelector('[data-deadline-strip]');
const playGrid = document.querySelector('[data-play-grid]');
const profileLink = document.querySelector('[data-profile-link]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
let deadlineTimer = null;

function renderError(error) {
  leagueName.textContent = 'Private league unavailable';
  gameweekLabel.textContent = error;
  gameweekCountdown.textContent = '--d --h --m --s';
  gameweekCard?.classList.remove('is-active', 'is-countdown');
  joinCode.textContent = '-';
  if (memberCount) {
    memberCount.textContent = '';
  }
  playGrid.innerHTML = '';
  if (deadlineStrip) {
    deadlineStrip.innerHTML = '';
  }
}

function renderProfileAvatar(profile, user) {
  if (!profileAvatar) {
    return;
  }

  const imageUrl = profile?.profile_image_url || '';
  if (imageUrl) {
    profileAvatar.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="">`;
    return;
  }

  const fallback = profile?.display_name || user?.email || 'P';
  profileAvatar.textContent = fallback.trim().charAt(0).toUpperCase() || 'P';
}

async function loadOwnProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, profile_image_url')
    .eq('id', user.id)
    .maybeSingle();

  if (!error) {
    renderProfileAvatar(data, user);
  } else {
    renderProfileAvatar(null, user);
  }
}

function earliestTime(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0] || null;
}

function isoFromMs(value) {
  return value ? new Date(value).toISOString() : null;
}

function compactCountdownText(value) {
  if (!value) {
    return 'Not Set';
  }

  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Locked';
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}hr ${minutes}m` : `${minutes}m`;
}

function deadlineDisplay(value, options = {}) {
  if (options.message) {
    return {
      className: options.messageClassName || 'bad locked message',
      action: options.message,
      countdown: '',
      isMessage: true,
    };
  }

  if (options.enabled === false) {
    return {
      className: 'disabled',
      action: 'Disabled',
      countdown: '',
    };
  }

  if (!value) {
    return {
      className: 'disabled',
      action: 'Not Set',
      countdown: '',
    };
  }

  const locked = Date.now() >= new Date(value).getTime();
  const countdown = compactCountdownText(value);

  if (options.windowOnly) {
    return {
      className: locked ? 'bad locked' : 'good',
      action: locked ? 'Locked' : '',
      countdown: locked ? '' : countdown,
    };
  }

  if (locked) {
    return {
      className: 'bad locked',
      action: 'Locked',
      countdown: '',
    };
  }

  if (!options.completed) {
    return {
      className: 'action',
      action: 'Action Required',
      countdown,
    };
  }

  return {
    className: 'good',
    action: '',
    countdown,
  };
}

function renderDeadlineCard(label, value, options = {}) {
  const display = deadlineDisplay(value, options);
  const messageClass = display.isMessage ? ' deadline-message' : '';

  return `
    <div class="deadline-card ${escapeHtml(display.className)}">
      <span class="deadline-title">${escapeHtml(label)}</span>
      <div class="deadline-body">
        <span class="deadline-action${messageClass}">${escapeHtml(display.action || '')}</span>
        <strong class="deadline-countdown">${escapeHtml(display.countdown)}</strong>
        <span class="deadline-light" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

async function loadPredictionCompletion(league, user, fixtures) {
  const activeFixtures = fixtures.filter((fixture) => fixture.status !== 'postponed');
  if (!activeFixtures.length) {
    return false;
  }

  const fixtureIds = activeFixtures.map((fixture) => fixture.id);
  const currentGameweekId = activeFixtures[0]?.gameweek_id;

  const [primaryResult, hatedResult, randomResult, deletedMatchResult, hedgeEffectResult] = await Promise.all([
    supabase
      .from('predictions')
      .select('fixture_id, home_goals, away_goals')
      .eq('competition_id', league.id)
      .eq('season_id', league.season_id)
      .eq('user_id', user.id)
      .eq('prediction_slot', 'primary')
      .in('fixture_id', fixtureIds),
    supabase
      .from('curse_hated_forced_predictions')
      .select('fixture_id, home_goals, away_goals')
      .eq('competition_id', league.id)
      .eq('target_user_id', user.id)
      .in('fixture_id', fixtureIds),
    supabase
      .from('curse_gambler_rolls')
      .select('fixture_id, home_goals, away_goals')
      .eq('competition_id', league.id)
      .eq('target_user_id', user.id)
      .in('fixture_id', fixtureIds),
    supabase
      .from('active_card_effects')
      .select('fixture_id, card_definitions!inner(effect_key)')
      .eq('competition_id', league.id)
      .eq('season_id', league.season_id)
      .eq('target_user_id', user.id)
      .eq('status', 'active')
      .eq('card_definitions.effect_key', 'curse_deleted_match')
      .in('fixture_id', fixtureIds),
    supabase
      .from('active_card_effects')
      .select('id, gameweek_id, start_gameweek_id, end_gameweek_id, card_definitions!inner(effect_key)')
      .eq('competition_id', league.id)
      .eq('season_id', league.season_id)
      .eq('played_by_user_id', user.id)
      .eq('status', 'active')
      .eq('card_definitions.effect_key', 'power_hedge'),
  ]);

  if (primaryResult.error || hatedResult.error || randomResult.error || deletedMatchResult.error || hedgeEffectResult.error) {
    return false;
  }

  const completeRows = [
    ...(primaryResult.data || []),
    ...(hatedResult.data || []),
    ...(randomResult.data || []),
  ];

  const completedFixtureIds = new Set(completeRows
    .filter((prediction) => Number.isFinite(Number(prediction.home_goals)) && Number.isFinite(Number(prediction.away_goals)))
    .map((prediction) => prediction.fixture_id));

  (deletedMatchResult.data || [])
    .map((effect) => effect.fixture_id)
    .filter(Boolean)
    .forEach((fixtureId) => completedFixtureIds.add(fixtureId));

  if (!activeFixtures.every((fixture) => completedFixtureIds.has(fixture.id))) {
    return false;
  }

  const hedgeEffects = (hedgeEffectResult.data || []).filter((effect) => {
    const ids = [effect.gameweek_id, effect.start_gameweek_id, effect.end_gameweek_id]
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value));
    return !ids.length || ids.includes(String(currentGameweekId));
  });

  if (!hedgeEffects.length) {
    return true;
  }

  const hedgeEffectIds = hedgeEffects.map((effect) => effect.id);
  const { data: hedgePredictions, error: hedgePredictionError } = await supabase
    .from('predictions')
    .select('source_card_effect_id, home_goals, away_goals, prediction_slot')
    .eq('competition_id', league.id)
    .eq('season_id', league.season_id)
    .eq('user_id', user.id)
    .in('source_card_effect_id', hedgeEffectIds);

  if (hedgePredictionError) {
    return false;
  }

  const completedHedgeEffectIds = new Set((hedgePredictions || [])
    .filter((prediction) => String(prediction.prediction_slot || '').startsWith('hedge'))
    .filter((prediction) => Number.isFinite(Number(prediction.home_goals)) && Number.isFinite(Number(prediction.away_goals)))
    .map((prediction) => prediction.source_card_effect_id));

  return hedgeEffectIds.every((effectId) => completedHedgeEffectIds.has(effectId));
}

async function loadStarManCompletion(league, user, activeGameweek) {
  if (!activeGameweek) {
    return false;
  }

  const { data, error } = await supabase
    .from('star_man_picks')
    .select('id, player_id')
    .eq('competition_id', league.id)
    .eq('season_id', league.season_id)
    .eq('gameweek_id', activeGameweek.gameweek_id)
    .eq('user_id', user.id)
    .eq('pick_slot', 'primary')
    .maybeSingle();

  if (error) {
    return false;
  }

  if (!data?.id) {
    return false;
  }

  return loadSavedStarManStillValid(league, user, activeGameweek, data.player_id);
}

const SCRABBLE_SCORES = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

const MICROSTATE_NATIONALITIES = new Set([
  'albania', 'andorra', 'antigua and barbuda', 'armenia', 'austria', 'bahamas', 'bahrain', 'barbados',
  'belarus', 'belize', 'bhutan', 'bosnia and herzegovina', 'botswana', 'brunei', 'bulgaria',
  'cabo verde', 'central african republic', 'congo republic', 'congo republic of the', 'costa rica',
  'croatia', 'cyprus', 'denmark', 'djibouti', 'dominica', 'el salvador', 'equatorial guinea',
  'eritrea', 'eswatini', 'estonia', 'fiji', 'finland', 'gabon', 'gambia', 'georgia', 'grenada',
  'guinea bissau', 'guyana', 'hungary', 'iceland', 'ireland', 'israel', 'kiribati', 'kuwait',
  'kyrgyzstan', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein',
  'lithuania', 'luxembourg', 'maldives', 'marshall islands', 'mauritania', 'mauritius', 'micronesia',
  'monaco', 'montenegro', 'mongolia', 'namibia', 'nauru', 'new zealand', 'nicaragua', 'north macedonia',
  'norway', 'oman', 'palau', 'panama', 'palestine', 'palestine west bank and gaza', 'paraguay',
  'qatar', 'republic of congo', 'republic of ireland', 'republic of the congo', 'saint kitts and nevis',
  'saint lucia', 'saint vincent and the grenadines', 'samoa', 'san marino', 'sao tome and principe',
  'serbia', 'seychelles', 'sierra leone', 'singapore', 'slovakia', 'slovenia', 'solomon islands',
  'suriname', 'switzerland', 'timor leste', 'togo', 'tonga', 'trinidad and tobago', 'turkmenistan',
  'tuvalu', 'uruguay', 'vanuatu', 'vatican city', 'west bank and gaza',
]);

function normaliseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Øø]/g, 'o')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Œœ]/g, 'oe')
    .replace(/[Đđ]/g, 'd')
    .replace(/[Þþ]/g, 'th')
    .replace(/[Łł]/g, 'l')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function surnameForScrabble(name) {
  const words = normaliseText(name).split(' ').filter(Boolean);
  const vanIndex = words.findIndex((word) => word === 'van');
  if (vanIndex >= 0 && vanIndex < words.length - 1) {
    return words.slice(vanIndex).join('');
  }
  return words.at(-1) || '';
}

function scrabbleScore(value) {
  return surnameForScrabble(value)
    .split('')
    .reduce((total, letter) => total + (SCRABBLE_SCORES[letter] || 0), 0);
}

function activeEffectForGameweek(effect, activeGameweek) {
  const number = Number(activeGameweek.gameweek_number || 0);
  const direct = !effect.gameweek_id || String(effect.gameweek_id) === String(activeGameweek.gameweek_id);
  const startOk = !effect.start_gameweek_id || Number(effect.start_gameweek_id) <= number;
  const endOk = !effect.end_gameweek_id || Number(effect.end_gameweek_id) >= number;
  return direct && startOk && endOk;
}

function effectKeyFromRow(effect) {
  const definition = Array.isArray(effect.card_definitions)
    ? effect.card_definitions[0]
    : effect.card_definitions;
  return definition?.effect_key || '';
}

async function loadSavedStarManStillValid(league, user, activeGameweek, playerId) {
  const [{ data: player }, { data: effects, error: effectsError }] = await Promise.all([
    supabase
      .from('players')
      .select('id, display_name, nationality, team_id')
      .eq('id', playerId)
      .maybeSingle(),
    supabase
      .from('active_card_effects')
      .select('id, gameweek_id, start_gameweek_id, end_gameweek_id, card_definitions(effect_key)')
      .eq('competition_id', league.id)
      .eq('season_id', league.season_id)
      .eq('target_user_id', user.id)
      .eq('status', 'active'),
  ]);

  if (!player || effectsError) {
    return false;
  }

  const restrictionKeys = (effects || [])
    .filter((effect) => activeEffectForGameweek(effect, activeGameweek))
    .map(effectKeyFromRow)
    .filter(Boolean);

  if (!restrictionKeys.length) {
    return true;
  }

  const surnameScore = scrabbleScore(player.display_name);
  if (restrictionKeys.includes('curse_alphabet_15') && surnameScore < 15) return false;
  if (restrictionKeys.includes('curse_alphabet_20') && surnameScore < 20) return false;
  if (restrictionKeys.includes('curse_random_roulette') && !MICROSTATE_NATIONALITIES.has(normaliseText(player.nationality))) return false;

  if (restrictionKeys.includes('curse_tiny_club')) {
    const { data: previousGameweeks } = await supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, gameweek_number')
      .eq('season_id', league.season_id)
      .lt('gameweek_number', activeGameweek.gameweek_number)
      .order('gameweek_number', { ascending: false })
      .limit(1);
    const previousGameweekId = previousGameweeks?.[0]?.gameweek_id;
    if (previousGameweekId) {
      const { data: topTenRows } = await supabase
        .from('team_gameweek_computed_standings')
        .select('team_id')
        .eq('season_id', league.season_id)
        .eq('gameweek_id', previousGameweekId)
        .lte('league_position', 10);
      if ((topTenRows || []).some((row) => String(row.team_id) === String(player.team_id))) {
        return false;
      }
    }
  }

  const droughtWindow = restrictionKeys.includes('curse_scoring_drought_5')
    ? 5
    : restrictionKeys.includes('curse_scoring_drought_3')
      ? 3
      : 0;
  if (droughtWindow) {
    const { data: previousGameweeks } = await supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, gameweek_number')
      .eq('season_id', league.season_id)
      .lt('gameweek_number', activeGameweek.gameweek_number)
      .order('gameweek_number', { ascending: false })
      .limit(droughtWindow);
    const previousIds = (previousGameweeks || []).map((gameweek) => gameweek.gameweek_id);
    if (previousIds.length) {
      const { data: goalRows } = await supabase
        .from('player_gameweek_stats')
        .select('goals')
        .eq('season_id', league.season_id)
        .eq('player_id', playerId)
        .in('gameweek_id', previousIds);
      if ((goalRows || []).some((row) => Number(row.goals || 0) > 0)) {
        return false;
      }
    }
  }

  return true;
}

async function loadGameCardCompletion(league, user, activeGameweek) {
  if (!activeGameweek) {
    return { enabled: false, completed: false };
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
      return { enabled: false, completed: false };
    }

    const numberById = new Map((gameweeks || []).map((gameweek) => [String(gameweek.id), Number(gameweek.number)]));
    const activeNumber = Number(activeGameweek.gameweek_number || 0);
    const activeRound = (rounds || []).find((round) => {
      const startNumber = numberById.get(String(round.start_gameweek_id));
      const endNumber = numberById.get(String(round.end_gameweek_id));
      return activeNumber >= startNumber && activeNumber <= endNumber;
    });

    if (!activeRound) {
      return { enabled: false, completed: false };
    }

    const { data, error } = await supabase
      .from('game_card_predictions')
      .select('id, predicted_value')
      .eq('round_id', activeRound.id)
      .eq('gameweek_id', activeGameweek.gameweek_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return { enabled: true, completed: false };
    }

    return {
      enabled: true,
      completed: data?.predicted_value !== null && data?.predicted_value !== undefined && String(data.predicted_value) !== '',
    };
  } catch {
    return { enabled: false, completed: false };
  }
}

async function renderDeadlineStrip(activeGameweek, fixtures, league, user) {
  if (!deadlineStrip) {
    return;
  }

  if (deadlineTimer) {
    window.clearInterval(deadlineTimer);
    deadlineTimer = null;
  }

  const firstKickoffMs = earliestTime(fixtures.map((fixture) => fixture.kickoff_at));
  const predictionDeadlineMs = firstKickoffMs ? firstKickoffMs - (90 * 60 * 1000) : earliestTime(fixtures.map((fixture) => fixture.prediction_locks_at));
  const curseDeadlineMs = firstKickoffMs ? firstKickoffMs - (24 * 60 * 60 * 1000) : null;
  const starDeadline = activeGameweek?.star_man_locks_at || isoFromMs(predictionDeadlineMs);
  const gameweekLabelText = `GW${activeGameweek?.gameweek_number || 'X'}`;
  const cardsBeginAfterGameweekOne = Number(activeGameweek?.gameweek_number || 0) <= 1;
  const cardDeadlineOptions = cardsBeginAfterGameweekOne
    ? {
        windowOnly: true,
        message: 'Cards Begin When Gameweek 1 Ends',
        messageClassName: 'bad locked message',
      }
    : { windowOnly: true };
  const [predictionsCompleted, starManCompleted, gameCardCompletion] = await Promise.all([
    loadPredictionCompletion(league, user, fixtures),
    loadStarManCompletion(league, user, activeGameweek),
    loadGameCardCompletion(league, user, activeGameweek),
  ]);

  function update() {
    deadlineStrip.innerHTML = [
      renderDeadlineCard(`${gameweekLabelText} Predictions Deadline`, isoFromMs(predictionDeadlineMs), { completed: predictionsCompleted }),
      renderDeadlineCard(`${gameweekLabelText} Star Man Deadline`, starDeadline, { completed: starManCompleted }),
      renderDeadlineCard(`${gameweekLabelText} Game Card Deadline`, starDeadline, { completed: gameCardCompletion.completed, enabled: gameCardCompletion.enabled }),
      renderDeadlineCard('Play Power Card Deadline', isoFromMs(predictionDeadlineMs), cardDeadlineOptions),
      renderDeadlineCard('Play Curse Card Deadline', isoFromMs(curseDeadlineMs), cardDeadlineOptions),
    ].join('');
  }

  update();
  deadlineTimer = window.setInterval(update, 1000);
}

async function copyJoinCode() {
  const code = joinCode.textContent.trim();
  if (!code || code === '-' || code === '...') {
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    copyJoinCodeButton.textContent = 'Copied';
    setTimeout(() => {
      copyJoinCodeButton.textContent = 'Copy';
    }, 1400);
  } catch {
    copyJoinCodeButton.textContent = code;
  }
}

async function renderLeague(league, user) {
  const { activeGameweek, fixturesByGameweek } = await loadActiveGameweek(league);
  const gameweekNumber = activeGameweek?.gameweek_number || 'X';
  const pages = [
    {
      page: 'prediction-hub.html',
      title: 'Predictions',
      detail: `Submit your Score Predictions for Gameweek ${gameweekNumber}.`,
      accent: '#00e5ff',
      tier: 'primary',
    },
    {
      page: 'star-man-hub.html',
      title: 'Star Man',
      detail: `Submit your Star Man for Gameweek ${gameweekNumber}.`,
      accent: '#facc15',
      tier: 'primary',
    },
    {
      page: 'power-cards.html',
      title: 'Power Cards',
      detail: 'Play/View/Draw Cards against Opponents.',
      accent: '#fb7185',
      tier: 'game',
    },
    {
      page: 'game-card.html',
      title: 'Game Cards',
      detail: 'View active Game Card.',
      accent: '#34d399',
      tier: 'game',
    },
    {
      page: 'medals.html',
      title: 'Medals',
      detail: 'View medals earned this season.',
      accent: '#f59e0b',
      tier: 'game',
    },
    {
      page: 'leaderboard.html',
      title: 'Leaderboard',
      detail: 'View Leaderboard.',
      accent: '#a78bfa',
      tier: 'reference',
    },
    {
      page: 'statistics.html',
      title: 'Statistics',
      detail: 'View Statistics.',
      accent: '#22d3ee',
      tier: 'reference',
    },
    {
      page: 'correct-scores.html',
      title: 'Correct Scores',
      detail: 'View all Correct Scores.',
      accent: '#f472b6',
      tier: 'reference',
    },
  ];

  leagueName.textContent = league.name;
  joinCode.textContent = league.join_code;
  if (memberCount) {
    const { count, error } = await supabase
      .from('competition_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('competition_id', league.id);

    memberCount.textContent = error ? '' : `(${count || 0} Active Players)`;
  }
  if (profileLink) {
    profileLink.href = leagueUrl('profile.html', league.id);
  }
  await loadOwnProfile(user);

  if (activeGameweek) {
    const activeFixtures = fixturesByGameweek.get(String(activeGameweek.gameweek_id)) || [];
    await renderDeadlineStrip(activeGameweek, activeFixtures.filter((fixture) => fixture.status !== 'postponed'), league, user);
    gameweekCountdown.classList.remove('active-gameweek');
    if (isGameweekStarted(activeGameweek)) {
      gameweekLabel.textContent = 'Current Gameweek:';
      gameweekCountdown.textContent = `Gameweek ${activeGameweek.gameweek_number} Is Active`;
      gameweekCountdown.classList.add('active-gameweek');
      gameweekCard?.classList.add('is-active');
      gameweekCard?.classList.remove('is-countdown');
    } else {
      gameweekLabel.textContent = `Next Gameweek ${activeGameweek.gameweek_number}`;
      gameweekCard?.classList.add('is-countdown');
      gameweekCard?.classList.remove('is-active');
      startCountdown(gameweekCountdown, activeGameweek);
    }
  } else {
    gameweekCountdown.classList.remove('active-gameweek');
    gameweekCard?.classList.remove('is-active', 'is-countdown');
    gameweekLabel.textContent = 'No active gameweek found';
    gameweekCountdown.textContent = '--d --h --m --s';
    if (deadlineStrip) {
      deadlineStrip.innerHTML = '';
    }
  }

  const groupedPages = ['primary', 'game', 'reference'].map((tier) => pages.filter((item) => item.tier === tier));
  playGrid.innerHTML = groupedPages.map((group) => `
    <div class="play-group ${escapeHtml(group[0]?.tier || '')}">
      ${group.map((item) => `
        <a class="play-card" href="${leagueUrl(item.page, league.id)}" style="--accent: ${item.accent}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail)}</span>
        </a>
      `).join('')}
    </div>
  `).join('');
}

const context = await loadLeagueContext();
if (context.error) {
  renderError(context.error);
} else {
  try {
    await renderLeague(context.league, context.user);
  } catch (error) {
    renderError(error.message || 'Could not load this private league.');
  }
}

copyJoinCodeButton?.addEventListener('click', copyJoinCode);
