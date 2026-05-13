import { supabase } from './supabase-client.js';
import { getMatchingCountry, populateCountryOptions } from './countries.js';

const form = document.querySelector('[data-auth-form]');
const modeButtons = document.querySelectorAll('[data-auth-mode]');
const title = document.querySelector('[data-auth-title]');
const submitButton = document.querySelector('[data-auth-submit]');
const message = document.querySelector('[data-auth-message]');
const signupFields = document.querySelector('[data-signup-fields]');
const signupOnlyInputs = document.querySelectorAll('[data-signup-only]');
const favoriteTeamSelect = document.querySelector('[data-favorite-team]');
const nationalityOptions = document.querySelector('[data-nationality-options]');

let mode = 'signin';

const fallbackPremierLeagueTeams = [
  'AFC Bournemouth',
  'Arsenal',
  'Aston Villa',
  'Brentford',
  'Brighton & Hove Albion',
  'Burnley',
  'Chelsea',
  'Crystal Palace',
  'Everton',
  'Fulham',
  'Leeds United',
  'Liverpool',
  'Manchester City',
  'Manchester United',
  'Newcastle United',
  'Nottingham Forest',
  'Sunderland',
  'Tottenham Hotspur',
  'West Ham United',
  'Wolverhampton Wanderers',
];

function redirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || 'index.html';
}

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.dataset.type = type;
}

function setMode(nextMode) {
  mode = nextMode;
  const isSignup = mode === 'signup';

  title.textContent = isSignup ? 'Create Account' : 'Log In';
  submitButton.textContent = isSignup ? 'Create Account' : 'Log In';
  signupFields.hidden = !isSignup;

  signupOnlyInputs.forEach((input) => {
    input.disabled = !isSignup;
  });

  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.authMode === mode);
  });

  setMessage('', 'info');
}

function setTeamOptions(teams, source) {
  favoriteTeamSelect.innerHTML = '<option value="">Choose later</option>';

  teams.forEach((team) => {
    const option = document.createElement('option');
    option.textContent = team.name;

    if (source === 'database') {
      option.value = team.id;
      option.dataset.teamId = team.id;
    } else {
      option.value = team.name;
      option.dataset.teamName = team.name;
    }

    favoriteTeamSelect.append(option);
  });
}

async function loadFavoriteTeams() {
  if (!favoriteTeamSelect) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true });

    if (error || !data?.length) {
      throw error || new Error('No teams returned.');
    }

    setTeamOptions(data, 'database');
  } catch {
    setTeamOptions(
      fallbackPremierLeagueTeams.map((name) => ({ name })),
      'fallback'
    );
  }
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.authMode));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Working...', 'info');
  submitButton.disabled = true;

  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const displayName = String(formData.get('displayName') || '').trim();
  const firstName = String(formData.get('firstName') || '').trim();
  const lastName = String(formData.get('lastName') || '').trim();
  const nationality = String(formData.get('nationality') || '').trim();
  const favoriteColor = String(formData.get('favoriteColor') || '#ffffff');
  const favoriteTeamOption = favoriteTeamSelect?.selectedOptions?.[0];
  const favoriteTeamId = favoriteTeamOption?.dataset.teamId || null;
  const favoriteTeamName = favoriteTeamOption?.value
    ? favoriteTeamOption.dataset.teamName || favoriteTeamOption.textContent?.trim() || null
    : null;

  try {
    if (mode === 'signup') {
      if (displayName.length < 2) {
        setMessage('Username must be at least 2 characters.', 'error');
        return;
      }

      if (!firstName) {
        setMessage('First name is required.', 'error');
        return;
      }

      if (nationality && !getMatchingCountry(nationality)) {
        setMessage('Choose nationality from the list.', 'error');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            first_name: firstName,
            last_name: lastName || null,
            nationality: getMatchingCountry(nationality),
            favorite_team_id: favoriteTeamId,
            favorite_team_name: favoriteTeamId ? null : favoriteTeamName,
            favorite_color: favoriteColor,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        window.location.href = redirectTarget();
        return;
      }

      setMessage('Account created. Check your email if Supabase asks you to confirm it, then log in.', 'success');
      setMode('signin');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }

    window.location.href = redirectTarget();
  } catch (error) {
    setMessage(error.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

const { data } = await supabase.auth.getUser();
if (data.user) {
  window.location.href = redirectTarget();
}

await loadFavoriteTeams();
populateCountryOptions(nationalityOptions);
setMode('signin');
