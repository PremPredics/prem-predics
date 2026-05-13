import { supabase } from './supabase-client.js';
import { getMatchingCountry, populateCountryOptions } from './countries.js';

const form = document.querySelector('[data-profile-form]');
const passwordForm = document.querySelector('[data-password-form]');
const displayNameInput = document.querySelector('[name="displayName"]');
const firstNameInput = document.querySelector('[name="firstName"]');
const lastNameInput = document.querySelector('[name="lastName"]');
const nationalityInput = document.querySelector('[name="nationality"]');
const favoriteTeamSelect = document.querySelector('[data-favorite-team]');
const favoriteColorInput = document.querySelector('[data-favorite-color]');
const nationalityOptions = document.querySelector('[data-nationality-options]');
const profileImageInput = document.querySelector('[data-profile-image]');
const profileImagePreview = document.querySelector('[data-profile-photo-preview]');
const removeProfileImageButton = document.querySelector('[data-remove-profile-image]');
const emailOutput = document.querySelector('[data-email]');
const message = document.querySelector('[data-profile-message]');
const passwordMessage = document.querySelector('[data-password-message]');
const leagueHubBack = document.querySelector('[data-league-hub-back]');

let originalDisplayName = '';
let profileImageUrl = null;
let currentEmail = '';

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.dataset.type = type;
}

function setPasswordMessage(text, type = 'info') {
  passwordMessage.textContent = text;
  passwordMessage.dataset.type = type;
}

function getInitial(displayName) {
  return (displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
}

function setProfileImagePreview(imageUrl, displayName) {
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    profileImagePreview.replaceChildren(image);
    return;
  }

  profileImagePreview.replaceChildren(document.createTextNode(getInitial(displayName)));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not read that image.')));
    image.src = src;
  });
}

async function createProfileImageUrl(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Profile picture must be smaller than 5MB.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const size = Math.min(image.width, image.height);
  const outputSize = 256;
  const context = canvas.getContext('2d');

  canvas.width = outputSize;
  canvas.height = outputSize;
  context.drawImage(
    image,
    (image.width - size) / 2,
    (image.height - size) / 2,
    size,
    size,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL('image/jpeg', 0.86);
}

async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    setMessage(error.message, 'error');
    return;
  }

  favoriteTeamSelect.innerHTML = '<option value="">Choose later</option>';
  data.forEach((team) => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = team.name;
    favoriteTeamSelect.append(option);
  });
}

async function loadProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    window.location.href = 'login.html?redirect=profile.html';
    return;
  }

  currentEmail = userData.user.email;
  emailOutput.textContent = currentEmail;

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, first_name, last_name, nationality, favorite_team_id, profile_image_url, favorite_color')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) {
    setMessage(error.message, 'error');
    return;
  }

  originalDisplayName = data?.display_name || '';
  displayNameInput.value = originalDisplayName;
  firstNameInput.value = data?.first_name || '';
  lastNameInput.value = data?.last_name || '';
  nationalityInput.value = data?.nationality || '';
  favoriteTeamSelect.value = data?.favorite_team_id || '';
  favoriteColorInput.value = data?.favorite_color || '#ffffff';
  profileImageUrl = data?.profile_image_url?.startsWith('data:image/')
    ? data.profile_image_url
    : null;
  setProfileImagePreview(profileImageUrl, originalDisplayName);
}

profileImageInput.addEventListener('change', async () => {
  const file = profileImageInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    profileImageUrl = await createProfileImageUrl(file);
    setProfileImagePreview(profileImageUrl, displayNameInput.value || originalDisplayName);
    setMessage('Profile picture ready to save.', 'success');
  } catch (error) {
    profileImageInput.value = '';
    setMessage(error.message || 'Could not use that image.', 'error');
  }
});

removeProfileImageButton.addEventListener('click', () => {
  profileImageUrl = null;
  profileImageInput.value = '';
  setProfileImagePreview(null, displayNameInput.value || originalDisplayName);
  setMessage('Profile picture will be removed when you save.', 'info');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Saving profile...', 'info');

  const displayName = displayNameInput.value.trim();
  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const nationality = nationalityInput.value.trim();
  const favoriteTeamId = favoriteTeamSelect.value || null;
  const favoriteColor = favoriteColorInput.value || '#ffffff';

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

  if (displayName !== originalDisplayName) {
    const confirmed = window.confirm(
      'Are you sure you want to change your username? You can only change it once per season.'
    );

    if (!confirmed) {
      setMessage('Username change cancelled. No profile changes were saved.', 'info');
      return;
    }
  }

  const { data, error } = await supabase.rpc('update_my_profile', {
    target_display_name: displayName,
    target_first_name: firstName,
    target_last_name: lastName || null,
    target_nationality: getMatchingCountry(nationality),
    target_favorite_team_id: favoriteTeamId,
    target_profile_image_url: profileImageUrl,
    target_favorite_color: favoriteColor,
  });

  if (error) {
    if (error.code === '23505') {
      setMessage('That username is already taken.', 'error');
      return;
    }

    setMessage(error.message, 'error');
    return;
  }

  originalDisplayName = data?.display_name || displayName;
  displayNameInput.value = originalDisplayName;
  profileImageUrl = data?.profile_image_url?.startsWith('data:image/')
    ? data.profile_image_url
    : null;
  setProfileImagePreview(profileImageUrl, originalDisplayName);
  setMessage('Profile saved.', 'success');
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setPasswordMessage('Checking current password...', 'info');

  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    setPasswordMessage('Fill in all password fields.', 'error');
    return;
  }

  if (newPassword.length < 6) {
    setPasswordMessage('New password must be at least 6 characters.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordMessage('New passwords do not match.', 'error');
    return;
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: currentPassword,
  });

  if (signInError) {
    setPasswordMessage('Current password is incorrect.', 'error');
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    setPasswordMessage(updateError.message, 'error');
    return;
  }

  passwordForm.reset();
  setPasswordMessage('Password updated.', 'success');
});

await loadTeams();
populateCountryOptions(nationalityOptions);
const profileCompetitionId = new URLSearchParams(window.location.search).get('competition_id')
  || localStorage.getItem('premPredicsLastCompetitionId');
if (profileCompetitionId) {
  leagueHubBack.href = `league.html?competition_id=${encodeURIComponent(profileCompetitionId)}`;
  leagueHubBack.classList.add('show');
}
loadProfile();
