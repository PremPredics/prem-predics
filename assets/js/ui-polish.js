const TEAM_LAYOUT_STYLE_ID = 'prem-predics-ui-polish-style';
const STAR_CLEAR_DIALOG_STYLE_ID = 'prem-predics-star-clear-style';
let hedgeSaveInProgress = false;

function currentPageName() {
  const path = window.location.pathname;
  return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
}

function getSupabase() {
  return window.premPredicsSupabase || window.supabase;
}

function injectSharedPolishStyles() {
  if (document.getElementById(TEAM_LAYOUT_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TEAM_LAYOUT_STYLE_ID;
  style.textContent = `
    .fixture-main,
    .summary-fixture-main {
      min-width: 0 !important;
    }

    .fixture-team {
      min-width: 0 !important;
      max-width: 100% !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      hyphens: none !important;
      line-height: 1.08 !important;
    }

    .fixture-team.home,
    .fixture-team.away {
      text-align: center !important;
    }

    .hedge-save-button,
    [data-save-hedge] {
      display: none !important;
    }

    @media (max-width: 720px) {
      .fixture-row,
      .summary-fixture-row {
        grid-template-columns: 32px minmax(0, 1fr) 58px !important;
        gap: 3px !important;
      }

      .hedge-fixture-row {
        grid-template-columns: 58px minmax(0, 1fr) 44px !important;
      }

      .fixture-main {
        grid-template-columns: minmax(54px, 1fr) 32px 8px 32px minmax(54px, 1fr) !important;
        gap: 3px !important;
      }

      .summary-fixture-main {
        grid-template-columns: minmax(72px, 1fr) 42px minmax(72px, 1fr) !important;
        gap: 4px !important;
      }

      html.capacitor-android .fixture-main {
        grid-template-columns: minmax(58px, 1fr) 32px 8px 32px minmax(58px, 1fr) !important;
      }

      html.capacitor-android .summary-fixture-main {
        grid-template-columns: minmax(74px, 1fr) 42px minmax(74px, 1fr) !important;
      }

      .fixture-team {
        font-size: clamp(9.6px, 2.65vw, 12.2px) !important;
        line-height: 1.08 !important;
      }

      .fixture-lock {
        width: auto !important;
        max-width: 58px !important;
        font-size: 10px !important;
      }

      .fixture-gameweek {
        font-size: 10px !important;
        padding: 3px 3px !important;
      }

      .score-input {
        width: 32px !important;
        height: 27px !important;
        font-size: 13px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function setPredictionMessage(text, type = 'info') {
  const message = document.querySelector('[data-prediction-message]');
  if (!message) {
    return;
  }
  message.textContent = text;
  message.dataset.type = type;
}

function scoreState(input) {
  const raw = input?.value?.trim?.() || '';
  if (raw === '') {
    return { filled: false, valid: true, value: null };
  }
  const value = Number(raw);
  return {
    filled: true,
    valid: Number.isInteger(value) && value >= 0 && value <= 100,
    value,
  };
}

function hedgeSlotForIndex(index) {
  return index === 0 ? 'hedge' : `hedge_${index + 1}`;
}

async function saveHedgeRowsBeforeAllPredictions() {
  const supabase = getSupabase();
  if (!supabase) {
    return 0;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return 0;
  }

  const hedgeRows = [...document.querySelectorAll('[data-hedge-effect-id]')];
  if (!hedgeRows.length) {
    return 0;
  }

  let savedCount = 0;

  for (const [index, row] of hedgeRows.entries()) {
    const effectId = row.dataset.hedgeEffectId;
    const fixtureId = row.querySelector('[data-hedge-fixture]')?.value || row.dataset.hedgeSourceFixture || '';
    const homeInput = row.querySelector('[data-hedge-home]');
    const awayInput = row.querySelector('[data-hedge-away]');
    const home = scoreState(homeInput);
    const away = scoreState(awayInput);
    const hasAnyScore = home.filled || away.filled;

    if (!effectId || !homeInput || !awayInput) {
      continue;
    }

    if (!fixtureId && !hasAnyScore) {
      continue;
    }

    if (!fixtureId || home.filled !== away.filled) {
      throw new Error('Choose a match and enter both Hedge scores, or leave both Hedge scores blank.');
    }

    if (!home.valid || !away.valid) {
      throw new Error('Hedge predictions must be blank or whole numbers from 0 to 100.');
    }

    const { data: effect, error: effectLoadError } = await supabase
      .from('active_card_effects')
      .select('id, competition_id, season_id, played_by_user_id, fixture_id')
      .eq('id', effectId)
      .maybeSingle();

    if (effectLoadError || !effect) {
      throw new Error(effectLoadError?.message || 'Could not load Hedge card.');
    }

    if (String(effect.played_by_user_id) !== String(user.id)) {
      throw new Error('You can only save your own Hedge prediction.');
    }

    const { data: conflictRows, error: conflictError } = await supabase
      .from('active_card_effects')
      .select('id, card_definitions!inner(effect_key)')
      .eq('competition_id', effect.competition_id)
      .eq('season_id', effect.season_id)
      .eq('target_user_id', user.id)
      .eq('fixture_id', fixtureId)
      .eq('status', 'active')
      .eq('card_definitions.effect_key', 'curse_deleted_match')
      .limit(1);

    if (conflictError) {
      throw new Error(conflictError.message || 'Could not check Hedge fixture.');
    }

    if ((conflictRows || []).length) {
      throw new Error('Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.');
    }

    if (!effect.fixture_id || effect.fixture_id !== fixtureId) {
      const { error: updateError } = await supabase
        .from('active_card_effects')
        .update({ fixture_id: fixtureId })
        .eq('id', effect.id)
        .eq('played_by_user_id', user.id);

      if (updateError) {
        throw new Error(updateError.message || 'Could not choose Hedge match.');
      }
    }

    if (!hasAnyScore) {
      const { error: deleteError } = await supabase
        .from('predictions')
        .delete()
        .eq('competition_id', effect.competition_id)
        .eq('season_id', effect.season_id)
        .eq('user_id', user.id)
        .eq('prediction_slot', hedgeSlotForIndex(index));

      if (deleteError) {
        throw new Error(deleteError.message || 'Could not clear Hedge prediction.');
      }

      savedCount += 1;
      continue;
    }

    const { error: saveError } = await supabase.from('predictions').upsert({
      competition_id: effect.competition_id,
      season_id: effect.season_id,
      fixture_id: fixtureId,
      user_id: user.id,
      prediction_slot: hedgeSlotForIndex(index),
      home_goals: home.value,
      away_goals: away.value,
      source_card_effect_id: effect.id,
      submitted_at: new Date().toISOString(),
    }, {
      onConflict: 'competition_id,fixture_id,user_id,prediction_slot',
    });

    if (saveError) {
      throw new Error(saveError.message || 'Could not save Hedge prediction.');
    }

    savedCount += 1;
  }

  return savedCount;
}

function waitForPredictionSummaryThenRefresh(savedHedges) {
  if (!savedHedges) {
    return;
  }

  sessionStorage.setItem('premPredicsReturnToPredictionSummary', 'true');
  const startedAt = Date.now();
  const observer = new MutationObserver(() => {
    const editButton = document.querySelector('[data-edit-predictions]');
    const message = document.querySelector('[data-prediction-message]');
    const isSummary = editButton && !editButton.hidden;
    const saysSaved = (message?.textContent || '').toLowerCase().includes('saved');

    if (isSummary || saysSaved) {
      observer.disconnect();
      window.setTimeout(() => window.location.reload(), 350);
    } else if (Date.now() - startedAt > 7000) {
      observer.disconnect();
      window.setTimeout(() => window.location.reload(), 200);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  window.setTimeout(() => observer.disconnect(), 7500);
}

function installPredictionSummaryReturn() {
  if (currentPageName() !== 'predictions.html') {
    return;
  }

  if (sessionStorage.getItem('premPredicsReturnToPredictionSummary') !== 'true') {
    return;
  }

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    const editButton = document.querySelector('[data-edit-predictions]');
    if (editButton && !editButton.hidden) {
      sessionStorage.removeItem('premPredicsReturnToPredictionSummary');
      window.clearInterval(timer);
      return;
    }

    const saveButton = document.querySelector('[data-save-all]');
    if (saveButton && !saveButton.hidden && !saveButton.disabled && Date.now() - startedAt > 600) {
      sessionStorage.removeItem('premPredicsReturnToPredictionSummary');
      saveButton.dataset.hedgeSaveBypass = 'true';
      saveButton.click();
      window.clearInterval(timer);
      return;
    }

    if (Date.now() - startedAt > 9000) {
      sessionStorage.removeItem('premPredicsReturnToPredictionSummary');
      window.clearInterval(timer);
    }
  }, 300);
}

function installSaveAllHedgeHandler() {
  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-save-all]');
    if (!button || currentPageName() !== 'predictions.html') {
      return;
    }

    if (button.dataset.hedgeSaveBypass === 'true') {
      delete button.dataset.hedgeSaveBypass;
      return;
    }

    if (hedgeSaveInProgress || !document.querySelector('[data-hedge-effect-id]')) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    hedgeSaveInProgress = true;
    const wasDisabled = button.disabled;
    button.disabled = true;

    try {
      setPredictionMessage('Saving predictions and Hedge...', 'info');
      const savedHedges = await saveHedgeRowsBeforeAllPredictions();
      button.dataset.hedgeSaveBypass = 'true';
      button.disabled = false;
      waitForPredictionSummaryThenRefresh(savedHedges);
      button.click();
      window.setTimeout(() => {
        button.disabled = wasDisabled;
      }, 1000);
    } catch (error) {
      setPredictionMessage(error.message || 'Could not save Hedge prediction.', 'error');
      button.disabled = wasDisabled;
    } finally {
      hedgeSaveInProgress = false;
    }
  }, true);
}

function injectStarClearStyles() {
  if (document.getElementById(STAR_CLEAR_DIALOG_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STAR_CLEAR_DIALOG_STYLE_ID;
  style.textContent = `
    [data-save-star-man] {
      display: none !important;
    }

    [data-pick-slot] {
      gap: 7px !important;
      padding-block: 10px !important;
    }

    .star-clear-wrap {
      width: min(100%, 520px) !important;
      margin-inline: auto !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 7px !important;
      align-items: center !important;
      justify-items: stretch !important;
    }

    .star-clear-wrap.star-clear-visible {
      grid-template-columns: minmax(0, 1fr) 32px !important;
    }

    .star-clear-wrap > input {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 34px !important;
      padding-block: 6px !important;
      text-align: center !important;
    }

    .star-clear-button {
      width: 30px !important;
      min-width: 30px !important;
      height: 30px !important;
      min-height: 30px !important;
      display: inline-grid !important;
      place-items: center !important;
      border: 2px solid rgba(254, 202, 202, 0.9) !important;
      border-radius: 999px !important;
      padding: 0 !important;
      background: linear-gradient(135deg, #ff3b30, #dc2626 58%, #991b1b) !important;
      color: #fff !important;
      font-size: 17px !important;
      font-weight: 950 !important;
      line-height: 1 !important;
      box-shadow: 0 0 14px rgba(248, 113, 113, 0.56) !important;
      text-shadow: -1px -1px 0 rgba(0,0,0,0.88), 1px -1px 0 rgba(0,0,0,0.88), -1px 1px 0 rgba(0,0,0,0.88), 1px 1px 0 rgba(0,0,0,0.88) !important;
      cursor: pointer !important;
      justify-self: center !important;
    }

    .star-clear-button[hidden] {
      display: none !important;
    }

    [data-search-results] {
      min-height: 0 !important;
      margin-block: 2px !important;
      text-align: center !important;
    }

    [data-search-results] .state-text,
    [data-message] {
      min-height: 0 !important;
      margin: 2px 0 !important;
      padding: 0 !important;
      font-size: 0.78rem !important;
      line-height: 1.12 !important;
      text-align: center !important;
    }

    [data-message]:empty,
    [data-search-results]:empty {
      display: none !important;
    }

    .selected-player-heading {
      margin-bottom: 5px !important;
      font-size: clamp(0.95rem, 3vw, 1.18rem) !important;
      line-height: 1.08 !important;
      color: #fff7ad !important;
      text-transform: uppercase !important;
      letter-spacing: 0.02em !important;
      text-shadow:
        -1px -1px 0 rgba(0,0,0,0.92),
        1px -1px 0 rgba(0,0,0,0.92),
        -1px 1px 0 rgba(0,0,0,0.92),
        1px 1px 0 rgba(0,0,0,0.92),
        0 0 12px rgba(250,204,21,0.95),
        0 0 24px rgba(250,204,21,0.62) !important;
    }

    .star-clear-dialog {
      position: fixed;
      inset: 0;
      z-index: 7000;
      display: none;
      place-items: center;
      padding: 18px;
      background: rgba(8, 3, 20, 0.62);
      backdrop-filter: blur(8px);
    }

    .star-clear-dialog.show {
      display: grid;
    }

    .star-clear-panel {
      width: min(430px, 100%);
      display: grid;
      gap: 16px;
      padding: 22px;
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(46,16,102,0.98), rgba(17,7,38,0.96));
      border: 2px solid rgba(216,180,254,0.42);
      box-shadow: 0 22px 64px rgba(0,0,0,0.58);
      text-align: center;
    }

    .star-clear-panel h2 {
      margin: 0;
      color: #fff;
      font-size: clamp(1.05rem, 4.4vw, 1.45rem);
      line-height: 1.18;
    }

    .star-clear-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .star-clear-actions button {
      min-height: 42px;
      border-radius: 10px;
      color: #fff;
      font-weight: 950;
      cursor: pointer;
    }

    .star-clear-back {
      background: linear-gradient(135deg, #5b21b6, #8b5cf6);
      border: 2px solid rgba(216, 180, 254, 0.72);
    }

    .star-clear-confirm {
      background: linear-gradient(135deg, #ff3b30, #ef4444 42%, #b91c1c);
      border: 2px solid rgba(254, 202, 202, 0.88);
    }

    @media (max-width: 720px) {
      [data-pick-slot] {
        gap: 5px !important;
        padding-block: 8px !important;
      }

      .star-clear-wrap {
        width: min(100%, 360px) !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 6px !important;
      }

      .star-clear-wrap.star-clear-visible {
        grid-template-columns: minmax(0, 1fr) 30px !important;
      }

      [data-search-results] .state-text,
      [data-message] {
        font-size: 0.7rem !important;
        line-height: 1.05 !important;
        margin: 1px 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureStarClearDialog() {
  let dialog = document.querySelector('[data-star-clear-dialog]');
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement('div');
  dialog.className = 'star-clear-dialog';
  dialog.dataset.starClearDialog = 'true';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <section class="star-clear-panel" role="dialog" aria-modal="true" aria-labelledby="starClearTitle">
      <h2 id="starClearTitle">Are you sure you would like to clear your Star Man selection?</h2>
      <div class="star-clear-actions">
        <button class="star-clear-back" type="button" data-star-clear-back>Back</button>
        <button class="star-clear-confirm" type="button" data-star-clear-confirm>Clear</button>
      </div>
    </section>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

function confirmStarClear() {
  const dialog = ensureStarClearDialog();
  const backButton = dialog.querySelector('[data-star-clear-back]');
  const confirmButton = dialog.querySelector('[data-star-clear-confirm]');

  return new Promise((resolve) => {
    function finish(value) {
      dialog.classList.remove('show');
      dialog.setAttribute('aria-hidden', 'true');
      backButton.removeEventListener('click', back);
      confirmButton.removeEventListener('click', confirm);
      dialog.removeEventListener('click', dialogClick);
      document.removeEventListener('keydown', keydown);
      resolve(value);
    }
    function back() { finish(false); }
    function confirm() { finish(true); }
    function dialogClick(event) {
      if (event.target === dialog) finish(false);
    }
    function keydown(event) {
      if (event.key === 'Escape') finish(false);
    }
    backButton.addEventListener('click', back);
    confirmButton.addEventListener('click', confirm);
    dialog.addEventListener('click', dialogClick);
    document.addEventListener('keydown', keydown);
    dialog.classList.add('show');
    dialog.setAttribute('aria-hidden', 'false');
  });
}

function compactStarText(value) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (lower.includes('save blank to remove') || lower === 'type at least 2 letters.' || lower === '2+ letters') {
    return 'Enter 2+ Letters For Player Dropdown';
  }
  if (lower.includes('star man cleared') || lower.includes('super duo cleared') || lower === 'cleared') {
    return 'Cleared';
  }
  if (lower.includes('star man saved') || lower.includes('super duo saved')) {
    return 'Saved';
  }
  return text;
}

function hideClearedMessageSoon(node) {
  if (node.dataset.clearMessageTimer === 'true') {
    return;
  }
  node.dataset.clearMessageTimer = 'true';
  window.setTimeout(() => {
    if ((node.textContent || '').trim() === 'Cleared') {
      node.textContent = '';
      node.dataset.type = 'info';
    }
    delete node.dataset.clearMessageTimer;
  }, 5000);
}

function cleanupStarBlankHelpText() {
  if (currentPageName() !== 'star-man.html') {
    return;
  }

  document.querySelectorAll('.state-text, [data-search-results] p, [data-message]').forEach((node) => {
    const compact = compactStarText(node.textContent);
    if (compact !== node.textContent) {
      node.textContent = compact;
    }
    if (compact === 'Cleared') {
      hideClearedMessageSoon(node);
    }
  });
}

function refreshStarClearButtons() {
  if (currentPageName() !== 'star-man.html') {
    return;
  }

  injectStarClearStyles();
  cleanupStarBlankHelpText();

  document.querySelectorAll('[data-player-search]').forEach((input) => {
    const slot = input.dataset.playerSearch;
    if (!slot) {
      return;
    }

    let wrapper = input.closest('.star-clear-wrap');
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.className = 'star-clear-wrap';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    let button = wrapper.querySelector(`[data-clear-star-man="${slot}"]`);
    if (!button) {
      button = document.createElement('button');
      button.className = 'star-clear-button';
      button.type = 'button';
      button.dataset.clearStarMan = slot;
      button.setAttribute('aria-label', slot === 'super_duo' ? 'Clear Super Duo selection' : 'Clear Star Man selection');
      button.textContent = '×';
      wrapper.appendChild(button);
      button.addEventListener('click', async () => {
        const confirmed = await confirmStarClear();
        if (!confirmed) {
          return;
        }
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        window.setTimeout(() => {
          document.querySelector(`[data-save-star-man="${slot}"]`)?.click();
        }, 0);
      });
    }

    const superStarActive = slot === 'primary' && Boolean(document.querySelector('.selected-player-heading.super-star-heading'));
    const showClear = Boolean(input.value.trim()) && !superStarActive;
    button.hidden = !showClear;
    wrapper.classList.toggle('star-clear-visible', showClear);
  });
}

function installStarManClearControls() {
  if (currentPageName() !== 'star-man.html') {
    return;
  }

  const observer = new MutationObserver(() => refreshStarClearButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-player-search]')) {
      window.requestAnimationFrame(refreshStarClearButtons);
    }
  });
  window.setInterval(refreshStarClearButtons, 900);
  refreshStarClearButtons();
}

injectSharedPolishStyles();
installSaveAllHedgeHandler();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installPredictionSummaryReturn();
    installStarManClearControls();
  }, { once: true });
} else {
  installPredictionSummaryReturn();
  installStarManClearControls();
}
