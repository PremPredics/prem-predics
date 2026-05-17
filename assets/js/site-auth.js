import { supabase } from './supabase-client.js';

const loginPage = 'login.html';

function currentPageName() {
  const path = window.location.pathname;
  return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
}

function currentPageTarget() {
  return `${currentPageName()}${window.location.search || ''}`;
}

function redirectToLogin() {
  const target = currentPageTarget();
  window.location.href = `${loginPage}?redirect=${encodeURIComponent(target)}`;
}

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
          <button data-logout type="button" style="padding: 12px 18px; border: 1px solid rgba(255,255,255,0.28); border-radius: 8px; background: transparent; color: #fff; font-weight: 700; cursor: pointer;">Log Out</button>
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
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    redirectToLogin();
  });
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
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

  panel.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    redirectToLogin();
  });
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

  if (requiresLeague) {
    const competitionId = getCompetitionIdFromUrl();
    if (!competitionId) {
      blockedLeaguePage(user, 'Choose a private league from your Leagues page first.');
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
