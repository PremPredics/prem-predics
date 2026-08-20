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
const profileCropModal = document.querySelector('[data-profile-crop-modal]');
const profileCropDialog = document.querySelector('[data-profile-crop-dialog]');
const profileCropStage = document.querySelector('[data-profile-crop-stage]');
const profileCropCanvas = document.querySelector('[data-profile-crop-canvas]');
const profileCropZoomInput = document.querySelector('[data-profile-crop-zoom]');
const profileCropZoomOutput = document.querySelector('[data-profile-crop-zoom-output]');
const profileCropZoomOutButton = document.querySelector('[data-profile-crop-zoom-out]');
const profileCropZoomInButton = document.querySelector('[data-profile-crop-zoom-in]');
const profileCropCancelButton = document.querySelector('[data-profile-crop-cancel]');
const profileCropResetButton = document.querySelector('[data-profile-crop-reset]');
const profileCropUseButton = document.querySelector('[data-profile-crop-use]');
const profileCropMessage = document.querySelector('[data-profile-crop-message]');
const emailOutput = document.querySelector('[data-email]');
const message = document.querySelector('[data-profile-message]');
const passwordMessage = document.querySelector('[data-password-message]');
const leagueHubBack = document.querySelector('[data-league-hub-back]');

const PROFILE_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const PROFILE_IMAGE_MAX_DATA_URL_LENGTH = 700000;
const PROFILE_IMAGE_OUTPUT_SIZE = 256;
const PROFILE_CROP_MIN_ZOOM = 1;
const PROFILE_CROP_MAX_ZOOM = 3;
const PROFILE_CROP_ZOOM_STEP = 0.1;

let originalDisplayName = '';
let profileImageUrl = null;
let currentEmail = '';
let profileCropImage = null;
let profileCropObjectUrl = null;
let profileCropZoom = PROFILE_CROP_MIN_ZOOM;
let profileCropOffsetX = 0;
let profileCropOffsetY = 0;
let profileCropPointerId = null;
let profileCropLastPointerX = 0;
let profileCropLastPointerY = 0;
let profileCropReturnFocus = null;

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.dataset.type = type;
}

function setPasswordMessage(text, type = 'info') {
  passwordMessage.textContent = text;
  passwordMessage.dataset.type = type;
}

function setProfileCropMessage(text, type = 'info') {
  profileCropMessage.textContent = text;
  profileCropMessage.dataset.type = type;
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

function confirmAction(text, confirmText = 'Yes') {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(8,3,20,.58);backdrop-filter:blur(7px);';
    modal.innerHTML = `
      <section style="width:min(460px,100%);display:grid;gap:16px;text-align:center;padding:22px;border-radius:12px;background:linear-gradient(135deg,rgba(46,16,102,.98),rgba(17,7,38,.98));border:2px solid rgba(216,180,254,.36);box-shadow:0 20px 52px rgba(0,0,0,.5);">
        <h2 style="margin:0;color:#fff;">Are you sure?</h2>
        <p style="margin:0;color:#f5f3ff;line-height:1.45;font-weight:800;">${escapeHtml(text)}</p>
        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
          <button type="button" data-confirm style="min-width:120px;border:0;border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:950;cursor:pointer;">${escapeHtml(confirmText)}</button>
          <button type="button" data-cancel style="min-width:120px;border:0;border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#dc2626,#7f1d1d);color:#fff;font-weight:950;cursor:pointer;">Cancel</button>
        </div>
      </section>
    `;

    function finish(value) {
      modal.remove();
      resolve(value);
    }

    modal.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    modal.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) finish(false);
    });
    document.body.appendChild(modal);
  });
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not read that image.')));
    image.src = src;
  });
}

function validateProfileImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  if (file.size > PROFILE_IMAGE_MAX_FILE_SIZE) {
    throw new Error('Profile picture must be smaller than 5MB.');
  }
}

function profileCropIsOpen() {
  return !profileCropModal.hidden;
}

function getProfileCropScale() {
  if (!profileCropImage) {
    return 1;
  }

  return Math.max(
    profileCropCanvas.width / profileCropImage.naturalWidth,
    profileCropCanvas.height / profileCropImage.naturalHeight
  ) * profileCropZoom;
}

function clampProfileCropOffsets() {
  if (!profileCropImage) {
    profileCropOffsetX = 0;
    profileCropOffsetY = 0;
    return;
  }

  const scale = getProfileCropScale();
  const scaledWidth = profileCropImage.naturalWidth * scale;
  const scaledHeight = profileCropImage.naturalHeight * scale;
  const maxOffsetX = Math.max(0, (scaledWidth - profileCropCanvas.width) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - profileCropCanvas.height) / 2);

  profileCropOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, profileCropOffsetX));
  profileCropOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, profileCropOffsetY));
}

function renderProfileCrop() {
  const context = profileCropCanvas.getContext('2d');
  if (!context) {
    throw new Error('This device could not prepare the picture editor.');
  }

  context.fillStyle = '#2e1065';
  context.fillRect(0, 0, profileCropCanvas.width, profileCropCanvas.height);

  if (!profileCropImage) {
    return;
  }

  clampProfileCropOffsets();

  const scale = getProfileCropScale();
  const scaledWidth = profileCropImage.naturalWidth * scale;
  const scaledHeight = profileCropImage.naturalHeight * scale;
  const left = ((profileCropCanvas.width - scaledWidth) / 2) + profileCropOffsetX;
  const top = ((profileCropCanvas.height - scaledHeight) / 2) + profileCropOffsetY;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(profileCropImage, left, top, scaledWidth, scaledHeight);
}

function setProfileCropZoom(nextZoom) {
  profileCropZoom = Math.max(
    PROFILE_CROP_MIN_ZOOM,
    Math.min(PROFILE_CROP_MAX_ZOOM, Number(nextZoom) || PROFILE_CROP_MIN_ZOOM)
  );
  profileCropZoomInput.value = String(profileCropZoom);
  profileCropZoomOutput.value = `${Math.round(profileCropZoom * 100)}%`;
  clampProfileCropOffsets();
  renderProfileCrop();
}

function resetProfileCrop() {
  profileCropOffsetX = 0;
  profileCropOffsetY = 0;
  setProfileCropZoom(PROFILE_CROP_MIN_ZOOM);
  setProfileCropMessage('');
}

function revokeProfileCropObjectUrl() {
  if (profileCropObjectUrl) {
    URL.revokeObjectURL(profileCropObjectUrl);
    profileCropObjectUrl = null;
  }
}

function releaseProfileCropPointer() {
  if (profileCropPointerId !== null && profileCropStage.hasPointerCapture(profileCropPointerId)) {
    profileCropStage.releasePointerCapture(profileCropPointerId);
  }

  profileCropPointerId = null;
  profileCropStage.classList.remove('is-dragging');
}

function closeProfileCrop() {
  releaseProfileCropPointer();
  profileCropModal.hidden = true;
  document.body.classList.remove('profile-crop-open');
  profileImageInput.value = '';
  profileCropImage = null;
  revokeProfileCropObjectUrl();

  const context = profileCropCanvas.getContext('2d');
  context?.clearRect(0, 0, profileCropCanvas.width, profileCropCanvas.height);

  const returnFocus = profileCropReturnFocus;
  profileCropReturnFocus = null;
  if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
    returnFocus.focus({ preventScroll: true });
  }
}

function openProfileCrop(image, objectUrl) {
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Could not read that image.');
  }

  revokeProfileCropObjectUrl();
  profileCropObjectUrl = objectUrl;
  profileCropImage = image;
  profileCropOffsetX = 0;
  profileCropOffsetY = 0;
  profileCropZoom = PROFILE_CROP_MIN_ZOOM;
  profileCropZoomInput.value = String(profileCropZoom);
  profileCropZoomOutput.value = '100%';
  setProfileCropMessage('');
  try {
    renderProfileCrop();
  } catch (error) {
    profileCropImage = null;
    profileCropObjectUrl = null;
    throw error;
  }

  profileCropModal.hidden = false;
  document.body.classList.add('profile-crop-open');
  window.requestAnimationFrame(() => profileCropStage.focus({ preventScroll: true }));
}

function moveProfileCropByClientPixels(deltaX, deltaY) {
  if (!profileCropImage) {
    return;
  }

  const stageBounds = profileCropStage.getBoundingClientRect();
  if (!stageBounds.width || !stageBounds.height) {
    return;
  }

  profileCropOffsetX += deltaX * (profileCropCanvas.width / stageBounds.width);
  profileCropOffsetY += deltaY * (profileCropCanvas.height / stageBounds.height);
  clampProfileCropOffsets();
  renderProfileCrop();
}

function getProfileCropFocusableElements() {
  return [...profileCropDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden);
}

function useProfileCrop() {
  if (!profileCropImage) {
    setProfileCropMessage('Choose a picture first.', 'error');
    return;
  }

  try {
    const outputCanvas = document.createElement('canvas');
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) {
      throw new Error('This device could not finish cropping the picture.');
    }

    outputCanvas.width = PROFILE_IMAGE_OUTPUT_SIZE;
    outputCanvas.height = PROFILE_IMAGE_OUTPUT_SIZE;
    outputContext.fillStyle = '#2e1065';
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(
      profileCropCanvas,
      0,
      0,
      profileCropCanvas.width,
      profileCropCanvas.height,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    const croppedImageUrl = outputCanvas.toDataURL('image/jpeg', 0.86);
    if (!croppedImageUrl.startsWith('data:image/jpeg') || croppedImageUrl.length > PROFILE_IMAGE_MAX_DATA_URL_LENGTH) {
      throw new Error('The cropped picture is too large. Try a different picture.');
    }

    closeProfileCrop();
    profileImageUrl = croppedImageUrl;
    setProfileImagePreview(profileImageUrl, displayNameInput.value || originalDisplayName);
    setMessage('Profile picture cropped and ready to save.', 'success');
  } catch (error) {
    setProfileCropMessage(error.message || 'Could not crop that image.', 'error');
  }
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

  let objectUrl = null;
  profileCropReturnFocus = document.activeElement;

  try {
    validateProfileImageFile(file);
    objectUrl = URL.createObjectURL(file);
    const image = await loadImage(objectUrl);
    profileImageInput.value = '';
    openProfileCrop(image, objectUrl);
    objectUrl = null;
  } catch (error) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    profileCropReturnFocus = null;
    profileImageInput.value = '';
    setMessage(error.message || 'Could not use that image.', 'error');
  }
});

profileCropZoomInput.addEventListener('input', () => {
  setProfileCropZoom(profileCropZoomInput.value);
});

profileCropZoomOutButton.addEventListener('click', () => {
  setProfileCropZoom(profileCropZoom - PROFILE_CROP_ZOOM_STEP);
});

profileCropZoomInButton.addEventListener('click', () => {
  setProfileCropZoom(profileCropZoom + PROFILE_CROP_ZOOM_STEP);
});

profileCropCancelButton.addEventListener('click', closeProfileCrop);
profileCropResetButton.addEventListener('click', resetProfileCrop);
profileCropUseButton.addEventListener('click', useProfileCrop);

profileCropModal.addEventListener('click', (event) => {
  if (event.target === profileCropModal) {
    closeProfileCrop();
  }
});

profileCropStage.addEventListener('pointerdown', (event) => {
  if (
    !profileCropImage
    || profileCropPointerId !== null
    || (event.pointerType === 'mouse' && event.button !== 0)
  ) {
    return;
  }

  event.preventDefault();
  profileCropPointerId = event.pointerId;
  profileCropLastPointerX = event.clientX;
  profileCropLastPointerY = event.clientY;
  profileCropStage.setPointerCapture(event.pointerId);
  profileCropStage.classList.add('is-dragging');
});

profileCropStage.addEventListener('pointermove', (event) => {
  if (event.pointerId !== profileCropPointerId) {
    return;
  }

  event.preventDefault();
  moveProfileCropByClientPixels(
    event.clientX - profileCropLastPointerX,
    event.clientY - profileCropLastPointerY
  );
  profileCropLastPointerX = event.clientX;
  profileCropLastPointerY = event.clientY;
});

profileCropStage.addEventListener('pointerup', (event) => {
  if (event.pointerId === profileCropPointerId) {
    releaseProfileCropPointer();
  }
});

profileCropStage.addEventListener('pointercancel', (event) => {
  if (event.pointerId === profileCropPointerId) {
    releaseProfileCropPointer();
  }
});

profileCropStage.addEventListener('lostpointercapture', () => {
  profileCropPointerId = null;
  profileCropStage.classList.remove('is-dragging');
});

profileCropStage.addEventListener('wheel', (event) => {
  if (!profileCropImage || !event.deltaY) {
    return;
  }

  event.preventDefault();
  setProfileCropZoom(profileCropZoom - (Math.sign(event.deltaY) * PROFILE_CROP_ZOOM_STEP));
}, { passive: false });

profileCropStage.addEventListener('keydown', (event) => {
  const movement = event.shiftKey ? 20 : 6;
  const directions = {
    ArrowLeft: [-movement, 0],
    ArrowRight: [movement, 0],
    ArrowUp: [0, -movement],
    ArrowDown: [0, movement],
  };
  const direction = directions[event.key];

  if (!direction) {
    return;
  }

  event.preventDefault();
  moveProfileCropByClientPixels(direction[0], direction[1]);
});

document.addEventListener('keydown', (event) => {
  if (!profileCropIsOpen()) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeProfileCrop();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusableElements = getProfileCropFocusableElements();
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) {
    event.preventDefault();
    profileCropDialog.focus();
    return;
  }

  if (!profileCropDialog.contains(document.activeElement)) {
    event.preventDefault();
    firstElement.focus();
    return;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
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

  if (displayName.length > 28 && displayName !== originalDisplayName) {
    setMessage('Username must be 28 characters or fewer.', 'error');
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
    if (!(await confirmAction('Change your username? You can only change it once per season.', 'Change'))) {
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
