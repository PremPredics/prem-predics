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
let isSubmitting = false;
let isRedirecting = false;

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

function setFormBusy(isBusy) {
  submitButton.disabled = isBusy;
  modeButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function safeRedirect(target = redirectTarget()) {
  if (isRedirecting) {
    return;
  }

  isRedirecting = true;
  setFormBusy(true);
  window.location.replace(target);
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
  button.addEventListener('click', () => {
    if (!isSubmitting && !isRedirecting) {
      setMode(button.dataset.authMode);
    }
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting || isRedirecting) {
    return;
  }

  isSubmitting = true;
  setMessage('Working...', 'info');
  setFormBusy(true);

  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const displayName = String(formData.get('displayName') || '').trim();
  const firstName = String(formData.get('firstName') || '').trim();
  const lastName = String(formData.get('lastName') || '').trim();
  const nationality = String(formData.get('nationality') || '').trim();
  const favoriteColor = String(formData.get('favoriteColor') || '#ffffff');
  const ageConfirmed = formData.get('ageConfirm') === 'yes';
  const legalAccepted = formData.get('legalAccept') === 'yes';
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

      if (!ageConfirmed) {
        setMessage('You must confirm that you are 18 or over to create an account.', 'error');
        return;
      }

      if (!legalAccepted) {
        setMessage('You must accept the Terms of Use and Privacy Policy to create an account.', 'error');
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
            age_confirmed_18_plus: true,
            legal_terms_accepted: true,
            legal_terms_version: '2026-06-04',
            legal_terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        safeRedirect();
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

    safeRedirect();
  } catch (error) {
    setMessage(error.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    if (!isRedirecting) {
      isSubmitting = false;
      setFormBusy(false);
    }
  }
});

const { data, error } = await supabase.auth.getUser();
let existingUser = data?.user || null;

if (!existingUser && error && !navigator.onLine) {
  const { data: sessionData } = await supabase.auth.getSession();
  existingUser = sessionData?.session?.user || null;
}

if (existingUser) {
  safeRedirect();
}

if (!navigator.onLine) {
  window.location.replace('offline.html');
} else {
  await loadFavoriteTeams();
  populateCountryOptions(nationalityOptions);
  setMode('signin');
}
