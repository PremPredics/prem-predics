import {
  escapeHtml,
  leagueUrl,
  loadLeagueContext,
} from './league-context.js';
import { isGameweekStarted, loadActiveGameweek, startCountdown } from './gameweek-context.js';
import { currentLiveCurseEffects } from './live-curses-model.js?v=20260831-cache-hotfix';
import {
  nextMedalProgress,
  STAR_MAN_GOAL_MEDAL_THRESHOLDS,
  UC_POINT_MEDAL_THRESHOLDS,
} from './medal-progress.js';
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
const liveCurseAlert = document.querySelector('[data-live-curse-alert]');
const medalProgressPanel = document.querySelector('[data-medal-progress]');
const choiceOverlay = document.querySelector('[data-hub-choice-overlay]');
const choiceDialog = document.querySelector('[data-hub-choice-dialog]');
const choiceTitle = document.querySelector('[data-hub-choice-title]');
const choiceCopy = document.querySelector('[data-hub-choice-copy]');
const choiceOptions = document.querySelector('[data-hub-choice-options]');
const leaguePageLoader = document.querySelector('[data-league-page-loader]');
const leaguePageLoaderFill = document.querySelector('[data-league-page-loader-fill]');
const leaguePageLoaderPercent = document.querySelector('[data-league-page-loader-percent]');
const leaguePageProgress = document.querySelector('[data-league-page-progress]');
let deadlineTimer = null;
let liveCurseChannel = null;
let liveCursePollTimer = null;
let choiceMenus = new Map();
let lastChoiceTrigger = null;
let leaguePageLoadValue = 4;
let leaguePageLoadTimer = null;

function setLeaguePageLoadProgress(value) {
  const nextValue = Math.max(leaguePageLoadValue, Math.min(100, Math.round(Number(value) || 0)));
  leaguePageLoadValue = nextValue;
  if (leaguePageLoaderFill) leaguePageLoaderFill.style.width = `${nextValue}%`;
  if (leaguePageLoaderPercent) leaguePageLoaderPercent.textContent = `${nextValue}%`;
  if (leaguePageProgress) leaguePageProgress.setAttribute('aria-valuenow', String(nextValue));
  if (leaguePageLoader) leaguePageLoader.setAttribute('aria-label', `Loading League Hub Page, ${nextValue}%`);
}

function startLeaguePageLoading() {
  setLeaguePageLoadProgress(8);
  window.clearInterval(leaguePageLoadTimer);
  leaguePageLoadTimer = window.setInterval(() => {
    if (leaguePageLoadValue < 88) setLeaguePageLoadProgress(leaguePageLoadValue + 1);
  }, 180);
}

function finishLeaguePageLoading() {
  window.clearInterval(leaguePageLoadTimer);
  setLeaguePageLoadProgress(100);
  window.setTimeout(() => {
    document.body.classList.remove('league-page-loading');
    leaguePageLoader?.classList.add('is-complete');
  }, 220);
  window.setTimeout(() => {
    if (leaguePageLoader) leaguePageLoader.hidden = true;
  }, 560);
}

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

async function renderMedalProgress(league, user) {
  if (!medalProgressPanel) return;
  medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Loading medal progress...</span>';
  const { error: syncError } = await supabase.rpc('sync_my_card_draw_tokens', { target_competition_id: league.id });
  if (syncError) console.warn('Could not sync medal progress', syncError);

  const [leaderboardResponse, tokensResponse] = await Promise.all([
    supabase.from('leaderboard').select('ultimate_champion_points, star_man_goals')
      .eq('competition_id', league.id).eq('user_id', user.id).maybeSingle(),
    supabase.from('card_draw_tokens').select('source_key, status')
      .eq('competition_id', league.id).eq('user_id', user.id)
      .eq('source_type', 'accolade').neq('status', 'void'),
  ]);

  if (leaderboardResponse.error || tokensResponse.error) {
    medalProgressPanel.innerHTML = '<span class="medal-progress-loading">Medal progress is temporarily unavailable.</span>';
    return;
  }

  const ranking = leaderboardResponse.data || {};
  const sourceKeys = (tokensResponse.data || []).map((token) => token.source_key).filter(Boolean);
  const ucProgress = nextMedalProgress(ranking.ultimate_champion_points, UC_POINT_MEDAL_THRESHOLDS, sourceKeys, 'uc_points_');
  const goalsProgress = nextMedalProgress(ranking.star_man_goals, STAR_MAN_GOAL_MEDAL_THRESHOLDS, sourceKeys, 'star_man_goals_');
  medalProgressPanel.innerHTML = `
    <div class="medal-progress-heading"><strong>Next Medal Progress</strong><a href="${leagueUrl('medals.html', league.id)}">View Medals</a></div>
    <div class="medal-progress-grid">
      ${medalProgressCardMarkup({ label: 'UC Points', icon: '&#9733;', unit: 'UC pts', progress: ucProgress, className: 'uc-progress' })}
      ${medalProgressCardMarkup({ label: 'Star Man Goals', icon: '&#9917;', unit: 'goals', progress: goalsProgress, className: 'goal-progress' })}
    </div>`;
}

async function loadOwnLiveCurseCount(league, user, activeGameweek) {
  if (!activeGameweek || !user?.id) return 0;
  const [{ data: effects, error: effectError }, { data: gameweeks, error: gameweekError }] = await Promise.all([
    supabase
      .from('active_card_effects')
      .select('gameweek_id, start_gameweek_id, end_gameweek_id, target_user_id, status, payload, card_definitions!inner(category, effect_key)')
      .eq('competition_id', league.id)
      .eq('season_id', league.season_id)
      .eq('target_user_id', user.id)
      .in('status', ['active', 'resolved'])
      .eq('card_definitions.category', 'curse'),
    supabase
      .from('gameweek_deadlines')
      .select('gameweek_id, gameweek_number')
      .eq('season_id', league.season_id),
  ]);
  if (effectError || gameweekError) throw effectError || gameweekError;
  const gameweekNumbers = new Map((gameweeks || []).map((gameweek) => [
    String(gameweek.gameweek_id),
    Number(gameweek.gameweek_number),
  ]));
  return currentLiveCurseEffects(effects, activeGameweek, gameweekNumbers)
    .filter((effect) => {
      const definition = Array.isArray(effect?.card_definitions)
        ? effect.card_definitions[0]
        : effect?.card_definitions;
      const effectKey = effect?.payload?.effect_key || definition?.effect_key || '';
      return !(String(effect?.status || '').toLowerCase() === 'resolved' && effectKey === 'curse_thief');
    })
    .length;
}

async function renderOwnLiveCurseAlert(league, user, activeGameweek) {
  if (!liveCurseAlert) return;
  try {
    const count = await loadOwnLiveCurseCount(league, user, activeGameweek);
    liveCurseAlert.classList.toggle('show', count > 0);
    liveCurseAlert.innerHTML = count > 0
      ? `<a href="${leagueUrl('live-curses.html', league.id)}">
          <span class="live-curse-alert-icon" aria-hidden="true">&#9760;</span>
          <span class="live-curse-alert-copy">
            <strong>Live Curse Alert</strong>
            <small>You have ${count} Live Curse${count === 1 ? '' : 's'} affecting you</small>
          </span>
          <span class="live-curse-alert-action">View <span aria-hidden="true">&#8594;</span></span>
        </a>`
      : '';
  } catch (error) {
    console.warn('Could not load live curse alert', error);
    liveCurseAlert.classList.remove('show');
    liveCurseAlert.innerHTML = '';
  }
}

function subscribeToOwnLiveCurses(league, user, activeGameweek) {
  if (liveCurseChannel) supabase.removeChannel(liveCurseChannel);
  window.clearInterval(liveCursePollTimer);
  liveCurseChannel = supabase
    .channel(`league-live-curses-${league.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'active_card_effects',
      filter: `competition_id=eq.${league.id}`,
    }, () => renderOwnLiveCurseAlert(league, user, activeGameweek))
    .subscribe();
  liveCursePollTimer = window.setInterval(() => {
    if (!document.hidden) renderOwnLiveCurseAlert(league, user, activeGameweek);
  }, 30000);
}

function fixturePredictionLockTime(fixture) {
  if (fixture?.prediction_locks_at) {
    const configuredLockTime = new Date(fixture.prediction_locks_at).getTime();
    if (Number.isFinite(configuredLockTime)) {
      return configuredLockTime;
    }
  }

  if (fixture?.kickoff_at) {
    const kickoffTime = new Date(fixture.kickoff_at).getTime();
    if (Number.isFinite(kickoffTime)) {
      return kickoffTime - (90 * 60 * 1000);
    }
  }

  return null;
}

function predictionLockProgress(fixtures, now = Date.now()) {
  const totalCount = fixtures.length;
  const lockedCount = fixtures.reduce((count, fixture) => {
    const lockTime = fixturePredictionLockTime(fixture);
    return count + (lockTime !== null && now >= lockTime ? 1 : 0);
  }, 0);

  return { lockedCount, totalCount };
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
    const { lockedCount, totalCount } = predictionLockProgress(fixtures);
    const predictionDeadlineOptions = lockedCount > 0
      ? {
          message: `${gameweekLabelText} ${lockedCount}/${totalCount} Predictions Locked`,
          messageClassName: 'bad locked message prediction-lock-progress',
        }
      : { completed: predictionsCompleted };

    deadlineStrip.innerHTML = [
      renderDeadlineCard(`${gameweekLabelText} Predictions Deadline`, isoFromMs(predictionDeadlineMs), predictionDeadlineOptions),
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

function closeHubChoicePanel() {
  if (!choiceOverlay || choiceOverlay.hidden) return;
  choiceOverlay.hidden = true;
  choiceOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('choice-panel-open');
  lastChoiceTrigger?.focus();
  lastChoiceTrigger = null;
}

function openHubChoicePanel(menuKey, trigger) {
  const menu = choiceMenus.get(menuKey);
  if (!menu || !choiceOverlay || !choiceDialog || !choiceTitle || !choiceCopy || !choiceOptions) return;
  lastChoiceTrigger = trigger || document.activeElement;
  choiceTitle.textContent = menu.title;
  choiceCopy.textContent = menu.copy;
  choiceDialog.style.setProperty('--choice-accent', menu.accent);
  choiceOptions.innerHTML = menu.options.map((option) => `
    <a class="hub-choice-option" href="${leagueUrl(option.page, menu.leagueId)}" style="--option-accent: ${option.accent}">
      <strong>${escapeHtml(option.title)}</strong>
      <span>${escapeHtml(option.detail)}</span>
    </a>
  `).join('');
  choiceOverlay.hidden = false;
  choiceOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('choice-panel-open');
  choiceDialog.focus();
}

async function renderLeague(league, user) {
  const { activeGameweek, fixturesByGameweek } = await loadActiveGameweek(league);
  setLeaguePageLoadProgress(38);
  const gameweekNumber = activeGameweek?.gameweek_number || 'X';
  const pages = [
    {
      menu: 'predictions',
      title: 'Predictions',
      detail: `Submit Predictions for GW${gameweekNumber}`,
      accent: '#00e5ff',
      tier: 'primary',
      copy: `Gameweek ${gameweekNumber} predictions`,
      options: [
        { page: 'predictions.html', title: 'Make Predictions', detail: `Submit or Edit your GW${gameweekNumber} Predictions`, accent: '#22d3ee' },
        { page: 'all-predictions.html', title: 'View All Player Predictions', detail: 'View history of all user predictions for all Gameweeks.', accent: '#facc15' },
      ],
    },
    {
      menu: 'star-man',
      title: 'Star Man',
      detail: `Submit your Star Man for Gameweek ${gameweekNumber}.`,
      accent: '#facc15',
      tier: 'primary',
      copy: `Gameweek ${gameweekNumber} Star Man`,
      options: [
        { page: 'star-man.html', title: 'Pick Star Man', detail: `Submit or Edit your GW${gameweekNumber} Star Man`, accent: '#22d3ee' },
        { page: 'all-star-men.html', title: 'View All Player Star Men', detail: 'View history of all user Star Man picks for all Gameweeks.', accent: '#facc15' },
      ],
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
      accent: '#ffffff',
      tier: 'reference',
    },
    {
      page: 'statistics.html',
      title: 'Statistics',
      detail: 'View Statistics.',
      accent: '#c4b5fd',
      tier: 'reference',
    },
    {
      page: 'correct-scores.html',
      title: 'Correct Scores',
      detail: 'View all Correct Scores.',
      accent: '#f472b6',
      tier: 'reference',
    },
    {
      page: 'live-curses.html',
      title: 'Live Curses',
      detail: `See every Curse affecting the league in Gameweek ${gameweekNumber}.`,
      accent: '#ef4444',
      tier: 'reference',
      className: 'live-curses-card',
    },
  ];

  choiceMenus = new Map(pages
    .filter((item) => item.menu)
    .map((item) => [item.menu, {
      title: item.title,
      copy: item.copy,
      accent: item.accent,
      options: item.options,
      leagueId: league.id,
    }]));

  leagueName.textContent = league.name;
  joinCode.textContent = league.join_code;
  if (profileLink) {
    profileLink.href = leagueUrl('profile.html', league.id);
  }
  const memberCountTask = memberCount ? supabase
    .from('competition_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('competition_id', league.id)
    .then(({ count, error }) => {
      memberCount.textContent = error ? '' : `(${count || 0} Active Players)`;
    }) : Promise.resolve();
  await Promise.all([memberCountTask, loadOwnProfile(user)]);
  setLeaguePageLoadProgress(58);
  void renderMedalProgress(league, user);

  if (activeGameweek) {
    const activeFixtures = fixturesByGameweek.get(String(activeGameweek.gameweek_id)) || [];
    await renderDeadlineStrip(activeGameweek, activeFixtures.filter((fixture) => fixture.status !== 'postponed'), league, user);
    setLeaguePageLoadProgress(82);
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
    renderOwnLiveCurseAlert(league, user, activeGameweek);
    subscribeToOwnLiveCurses(league, user, activeGameweek);
  } else {
    gameweekCountdown.classList.remove('active-gameweek');
    gameweekCard?.classList.remove('is-active', 'is-countdown');
    gameweekLabel.textContent = 'No active gameweek found';
    gameweekCountdown.textContent = '--d --h --m --s';
    if (deadlineStrip) {
      deadlineStrip.innerHTML = '';
    }
    if (liveCurseAlert) {
      liveCurseAlert.classList.remove('show');
      liveCurseAlert.innerHTML = '';
    }
  }

  playGrid.innerHTML = pages.map((item) => item.menu ? `
    <button class="play-card ${escapeHtml(item.className || '')}" type="button" data-choice-menu="${escapeHtml(item.menu)}" aria-haspopup="dialog" style="--accent: ${item.accent}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </button>
  ` : `
    <a class="play-card ${escapeHtml(item.className || '')}" href="${leagueUrl(item.page, league.id)}" style="--accent: ${item.accent}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </a>
  `).join('');
  setLeaguePageLoadProgress(96);
}

async function initializeLeaguePage() {
  startLeaguePageLoading();
  try {
    const context = await loadLeagueContext();
    setLeaguePageLoadProgress(22);
    if (context.error) {
      renderError(context.error);
      return;
    }
    await renderLeague(context.league, context.user);
  } catch (error) {
    renderError(error.message || 'Could not load this private league.');
  } finally {
    finishLeaguePageLoading();
  }
}

initializeLeaguePage();

copyJoinCodeButton?.addEventListener('click', copyJoinCode);
playGrid?.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-choice-menu]');
  if (trigger) openHubChoicePanel(trigger.dataset.choiceMenu, trigger);
});
choiceOverlay?.addEventListener('click', (event) => {
  if (event.target.closest('[data-hub-choice-dismiss]')) closeHubChoicePanel();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !choiceOverlay?.hidden) closeHubChoicePanel();
});
window.addEventListener('beforeunload', () => {
  if (liveCurseChannel) supabase.removeChannel(liveCurseChannel);
  window.clearInterval(liveCursePollTimer);
});
