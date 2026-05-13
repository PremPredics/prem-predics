import { supabase } from './supabase-client.js';

const leagueList = document.querySelector('[data-league-list]');
const createForm = document.querySelector('[data-create-league]');
const joinForm = document.querySelector('[data-join-league]');
const message = document.querySelector('[data-league-message]');

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.dataset.type = type;
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

function leagueUrl(page, competitionId) {
  return `${page}?competition_id=${encodeURIComponent(competitionId)}`;
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1400);
  } catch {
    button.textContent = value;
  }
}

function slugify(value) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return `${base || 'league'}-${Math.random().toString(36).slice(2, 7)}`;
}

async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    window.location.href = 'login.html?redirect=leagues.html';
    return null;
  }
  return data.user;
}

async function getStartGameweek() {
  const { data, error } = await supabase
    .from('gameweek_deadlines')
    .select('gameweek_id, season_id, gameweek_number, first_fixture_kickoff_at')
    .not('first_fixture_kickoff_at', 'is', null)
    .order('first_fixture_kickoff_at', { ascending: true });

  if (error) {
    throw error;
  }

  const now = Date.now();
  const future = data.find((row) => new Date(row.first_fixture_kickoff_at).getTime() > now);
  return future || data[data.length - 1];
}

async function leaveLeague(competitionId) {
  const { error } = await supabase.rpc('leave_competition_before_start', {
    target_competition_id: competitionId,
  });

  if (error) {
    setMessage(error.message, 'error');
    return;
  }

  setMessage('League left.', 'success');
  await loadLeagues();
}

async function loadLeagues() {
  const user = await getUser();
  if (!user) {
    return;
  }

  const { data, error } = await supabase
    .from('competition_members')
    .select('role, joined_at, competitions(id, name, slug, join_code, starts_at, member_lock_at, started_at, locked_member_count, locked_deck_variant_id)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  if (error) {
    leagueList.innerHTML = `<p class="state-text">Could not load leagues: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    leagueList.innerHTML = '<p class="state-text">You are not a part of any Private Leagues</p>';
    return;
  }

  leagueList.innerHTML = data.map((membership) => {
    const league = membership.competitions;
    const hasStarted = Boolean(league.started_at) || new Date(league.member_lock_at).getTime() <= Date.now();
    const leaveButton = hasStarted
      ? ''
      : `<button type="button" class="secondary-action" data-leave-league="${league.id}">Leave League</button>`;

    return `
      <article class="league-row">
        <div>
          <h3>${escapeHtml(league.name)}</h3>
        </div>
        <div class="league-actions">
          <a class="play-action" href="${leagueUrl('league.html', league.id)}">Play</a>
          <div class="join-code">
            <span>Join code</span>
            <strong>${escapeHtml(league.join_code)}</strong>
            <button class="copy-code-btn" type="button" data-copy-code="${escapeHtml(league.join_code)}">Copy</button>
          </div>
          ${leaveButton}
        </div>
      </article>
    `;
  }).join('');

  leagueList.querySelectorAll('[data-leave-league]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Are you sure you want to leave this league?')) {
        return;
      }

      await leaveLeague(button.dataset.leaveLeague);
    });
  });

  leagueList.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', () => copyText(button.dataset.copyCode, button));
  });
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const user = await getUser();
  if (!user) {
    return;
  }

  const formData = new FormData(createForm);
  const name = String(formData.get('name') || '').trim();

  if (!window.confirm(`Are you sure you want to create "${name}"?`)) {
    setMessage('', 'info');
    return;
  }

  setMessage('Creating league...', 'info');

  try {
    const startGameweek = await getStartGameweek();
    if (!startGameweek) {
      throw new Error('No gameweek data found.');
    }

    const firstKickoffAt = new Date(startGameweek.first_fixture_kickoff_at).toISOString();
    const startsAt = new Date(new Date(firstKickoffAt).getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('competitions').insert({
      season_id: startGameweek.season_id,
      owner_id: user.id,
      name,
      slug: slugify(name),
      max_members: 10,
      deck_variant_id: 'players_7_10',
      starts_gameweek_id: startGameweek.gameweek_id,
      starts_at: startsAt,
      member_lock_at: firstKickoffAt,
    });

    if (error) {
      throw error;
    }

    createForm.reset();
    setMessage('League created.', 'success');
    await loadLeagues();
  } catch (error) {
    if (error.code === '23505') {
      setMessage('That league name already exists.', 'error');
      return;
    }

    setMessage(error.message || 'Could not create league.', 'error');
  }
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(joinForm);
  const inviteCode = String(formData.get('joinCode') || '').trim();

  if (!window.confirm('Are you sure you want to join this league?')) {
    setMessage('', 'info');
    return;
  }

  setMessage('Joining league...', 'info');

  try {
    const { error } = await supabase.rpc('join_competition_by_code', {
      invite_code: inviteCode,
    });

    if (error) {
      throw error;
    }

    joinForm.reset();
    setMessage('League joined.', 'success');
    await loadLeagues();
  } catch (error) {
    setMessage(error.message || 'Could not join league.', 'error');
  }
});

loadLeagues();
