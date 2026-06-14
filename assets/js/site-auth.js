import { supabase } from './supabase-client.js';

const loginPage = 'login.html';
let signOutInProgress = false;

function currentPageName() {
  const path = window.location.pathname;
  return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
}

function currentPageTarget() {
  return `${currentPageName()}${window.location.search || ''}`;
}

function redirectToLogin() {
  if (!navigator.onLine) {
    window.location.href = 'offline.html';
    return;
  }

  const target = currentPageTarget();
  window.location.href = `${loginPage}?redirect=${encodeURIComponent(target)}`;
}

function ensureSignOutDialog() {
  let dialog = document.querySelector('[data-sign-out-dialog]');
  if (dialog) {
    return dialog;
  }

  if (!document.querySelector('[data-sign-out-dialog-style]')) {
    const style = document.createElement('style');
    style.dataset.signOutDialogStyle = 'true';
    style.textContent = `
      .sign-out-dialog {
        position: fixed;
        inset: 0;
        z-index: 5000;
        display: none;
        place-items: center;
        padding: 18px;
        background: rgba(8, 3, 20, 0.58);
        backdrop-filter: blur(8px);
      }

      .sign-out-dialog.show {
        display: grid;
      }

      .sign-out-panel {
        width: min(430px, 100%);
        display: grid;
        gap: 18px;
        padding: 24px;
        border-radius: 14px;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.14), transparent 34%),
          linear-gradient(135deg, rgba(46, 16, 102, 0.98), rgba(17, 7, 38, 0.96));
        border: 2px solid rgba(216, 180, 254, 0.42);
        box-shadow: 0 22px 64px rgba(0,0,0,0.58);
        text-align: center;
      }

      .sign-out-panel h2 {
        margin: 0;
        color: #fff;
        font-size: clamp(1.25rem, 4.8vw, 1.75rem);
        line-height: 1.14;
        text-shadow:
          -1px -1px 0 rgba(0,0,0,0.92),
          1px -1px 0 rgba(0,0,0,0.92),
          -1px 1px 0 rgba(0,0,0,0.92),
          1px 1px 0 rgba(0,0,0,0.92),
          0 0 14px rgba(216, 180, 254, 0.7);
      }

      .sign-out-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .sign-out-actions button {
        min-height: 46px;
        border: 0;
        border-radius: 10px;
        color: #fff;
        font-weight: 950;
        cursor: pointer;
        text-shadow:
          -1px -1px 0 rgba(0,0,0,0.82),
          1px -1px 0 rgba(0,0,0,0.82),
          -1px 1px 0 rgba(0,0,0,0.82),
          1px 1px 0 rgba(0,0,0,0.82);
        transition: transform 0.18s ease, filter 0.18s ease;
      }

      .sign-out-actions button:hover {
        transform: translateY(-2px);
        filter: brightness(1.08) saturate(1.12);
      }

      .sign-out-back {
        background: linear-gradient(135deg, #5b21b6, #8b5cf6);
        border: 2px solid rgba(216, 180, 254, 0.72) !important;
        box-shadow: 0 0 18px rgba(139, 92, 246, 0.45);
      }

      .sign-out-confirm {
        background:
          radial-gradient(circle at 26% 16%, rgba(255,255,255,0.85), transparent 20%),
          linear-gradient(135deg, #ff3b30, #ef4444 42%, #b91c1c);
        border: 2px solid rgba(254, 202, 202, 0.88) !important;
        box-shadow:
          0 0 20px rgba(248, 113, 113, 0.78),
          0 0 34px rgba(220, 38, 38, 0.48),
          inset 0 2px 0 rgba(255,255,255,0.34);
      }
    `;
    document.head.appendChild(style);
  }

  dialog = document.createElement('div');
  dialog.className = 'sign-out-dialog';
  dialog.dataset.signOutDialog = 'true';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <section class="sign-out-panel" role="dialog" aria-modal="true" aria-labelledby="signOutTitle">
      <h2 id="signOutTitle">Are you sure you'd like to Log out?</h2>
      <div class="sign-out-actions">
        <button class="sign-out-back" type="button" data-sign-out-back>Back</button>
        <button class="sign-out-confirm" type="button" data-sign-out-confirm>Log Out</button>
      </div>
    </section>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

function confirmSignOut() {
  const dialog = ensureSignOutDialog();
  const backButton = dialog.querySelector('[data-sign-out-back]');
  const confirmButton = dialog.querySelector('[data-sign-out-confirm]');

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

    function back() {
      finish(false);
    }

    function confirm() {
      finish(true);
    }

    function dialogClick(event) {
      if (event.target === dialog) {
        finish(false);
      }
    }

    function keydown(event) {
      if (event.key === 'Escape') {
        finish(false);
      }
    }

    backButton.addEventListener('click', back);
    confirmButton.addEventListener('click', confirm);
    dialog.addEventListener('click', dialogClick);
    document.addEventListener('keydown', keydown);
    dialog.classList.add('show');
    dialog.setAttribute('aria-hidden', 'false');
  });
}

async function handleSignOutClick(event) {
  event?.preventDefault();
  event?.stopPropagation();
  if (signOutInProgress) {
    return;
  }

  signOutInProgress = true;
  try {
    const confirmed = await confirmSignOut();
    if (!confirmed) {
      return;
    }
    await supabase.auth.signOut();
    redirectToLogin();
  } finally {
    signOutInProgress = false;
  }
}

function bindSignOutButtons(root = document) {
  root.querySelectorAll('[data-logout], [data-sign-out]').forEach((button) => {
    button.dataset.signOutBound = 'true';
    if (button.tagName === 'BUTTON' && !button.getAttribute('type')) {
      button.setAttribute('type', 'button');
    }
  });
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-logout], [data-sign-out]');
  if (!button) {
    return;
  }
  handleSignOutClick(event);
}, true);

function getCompetitionIdFromUrl() {
  return new URLSearchParams(window.location.search).get('competition_id');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function profileHref() {
  const competitionId = getCompetitionIdFromUrl();
  return competitionId
    ? `profile.html?competition_id=${encodeURIComponent(competitionId)}`
    : 'profile.html';
}

function profileAvatar(profile, displayName) {
  const imageUrl = profile?.profile_image_url?.startsWith('data:image/')
    ? profile.profile_image_url
    : null;

  if (imageUrl) {
    return `<a class="account-avatar" href="${profileHref()}" aria-label="Edit profile picture"><img src="${escapeHtml(imageUrl)}" alt=""></a>`;
  }

  const initial = (displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
  return `<a class="account-avatar" href="${profileHref()}" aria-label="Edit profile picture">${escapeHtml(initial)}</a>`;
}

function blockedLeaguePage(user, message = 'You need to choose a private league first.') {
  document.body.innerHTML = `
    <main style="
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: #f3f4f6;
      background: linear-gradient(135deg, #6f45bd 0%, #b579ee 48%, #e7b0ff 100%);
      font-family: 'Segoe UI', Arial, sans-serif;
      text-align: center;
    ">
      <section style="
        max-width: 520px;
        width: 100%;
        background: rgba(46, 16, 102, 0.78);
        border: 2px solid rgba(196, 132, 252, 0.35);
        border-radius: 12px;
        padding: 28px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      ">
        <h1 style="margin: 0 0 14px; font-size: clamp(2rem, 7vw, 3rem);">Prem Predics</h1>
        <p style="font-size: 18px; line-height: 1.55; margin: 0 0 22px;">
          ${escapeHtml(message)}
        </p>
        <p style="color: #ddd6fe; line-height: 1.5; margin: 0 0 24px;">
          These pages are specific to one private league.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <button data-home type="button" style="padding: 12px 18px; border: 0; border-radius: 8px; background: #7c3aed; color: #fff; font-weight: 700; cursor: pointer;">Home</button>
          <button data-leagues type="button" style="padding: 12px 18px; border: 0; border-radius: 8px; background: #f3e8ff; color: #2e1065; font-weight: 800; cursor: pointer;">Leagues</button>
          <button data-how type="button" style="padding: 12px 18px; border: 0; border-radius: 8px; background: #a78bfa; color: #1f1147; font-weight: 800; cursor: pointer;">How To Play</button>
          <button data-logout type="button" style="padding: 12px 18px; border: 1px solid rgba(254,202,202,0.72); border-radius: 8px; background: linear-gradient(135deg, #ef4444, #991b1b); color: #fff; font-weight: 800; cursor: pointer;">Log Out</button>
        </div>
      </section>
    </main>
  `;

  document.querySelector('[data-home]')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  document.querySelector('[data-leagues]')?.addEventListener('click', () => {
    window.location.href = 'leagues.html';
  });
  document.querySelector('[data-how]')?.addEventListener('click', () => {
    window.location.href = 'how-to-play.html';
  });
  bindSignOutButtons(document);
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (data?.user) {
    return data.user;
  }

  if (error && !navigator.onLine) {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData?.session?.user || null;
  }

  return null;
}

async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, profile_image_url')
    .eq('id', userId)
    .maybeSingle();

  return data;
}

async function getLeagueMembership(userId, competitionId) {
  const { data, error } = await supabase
    .from('competition_members')
    .select('competition_id, role, competitions(id, name, slug, join_code)')
    .eq('user_id', userId)
    .eq('competition_id', competitionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

function updateLeagueBackButtons(competitionId) {
  const hubUrl = `league.html?competition_id=${encodeURIComponent(competitionId)}`;
  document.querySelectorAll('.back-home-btn, .back-btn').forEach((button) => {
    button.textContent = 'Back To League Hub';
    button.onclick = null;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = hubUrl;
    });
  });
}

async function updateAccountPanel(user) {
  const panel = document.querySelector('[data-auth-panel]');
  if (!panel || !user) {
    return;
  }

  const profile = await getProfile(user.id);

  const displayName = profile?.display_name || user.email;
  const safeDisplayName = escapeHtml(displayName);

  panel.innerHTML = `
    <div class="account-panel-content">
      <div class="account-identity">
        ${profileAvatar(profile, displayName)}
        <div class="account-copy">
          <span class="account-label">Signed in as</span>
          <strong class="account-name">${safeDisplayName}</strong>
        </div>
      </div>
      <div class="account-actions">
        <a class="account-action" href="${profileHref()}">
          <span class="account-action-title">Edit Profile</span>
          <span class="account-action-detail">${safeDisplayName}</span>
        </a>
        <button class="account-action logout" type="button" data-logout>
          <span class="account-action-title">Log Out</span>
        </button>
      </div>
    </div>
  `;

  bindSignOutButtons(panel);
}

async function boot() {
  const user = await getCurrentUser();
  const requiresAuth = document.body.dataset.requireAuth === 'true';
  const requiresLeague = document.body.dataset.requireLeague === 'true';

  if (requiresAuth && !user) {
    redirectToLogin();
    return;
  }

  if (!user) {
    return;
  }

  await updateAccountPanel(user);
  bindSignOutButtons(document);

  if (requiresLeague) {
    const competitionId = getCompetitionIdFromUrl();
    if (!competitionId) {
      const lastCompetitionId = localStorage.getItem('premPredicsLastCompetitionId');
      if (lastCompetitionId) {
        window.location.replace(`${currentPageName()}?competition_id=${encodeURIComponent(lastCompetitionId)}`);
        return;
      }
      blockedLeaguePage(user, 'Choose a private league from your Leagues page first.');
      return;
    }

    if (!navigator.onLine) {
      localStorage.setItem('premPredicsLastCompetitionId', competitionId);
      updateLeagueBackButtons(competitionId);
      return;
    }

    const membership = await getLeagueMembership(user.id, competitionId);
    if (!membership) {
      blockedLeaguePage(user, 'You do not have access to this private league.');
      return;
    }

    localStorage.setItem('premPredicsLastCompetitionId', competitionId);
    updateLeagueBackButtons(competitionId);
  }
}

boot();
