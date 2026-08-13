import { supabase } from './supabase-client.js';

const form = document.querySelector('[data-reset-form]');
const submitButton = document.querySelector('[data-reset-submit]');
const status = document.querySelector('[data-reset-status]');
const requestNewLink = document.querySelector('[data-request-new-link]');
const backToLogin = document.querySelector('[data-back-to-login]');
const continueToApp = document.querySelector('[data-continue-to-app]');

let recoverySession = null;
let isSubmitting = false;

function setStatus(text, type = 'info') {
  status.textContent = text;
  status.dataset.type = type;
}

function cleanRecoveryUrl() {
  try {
    window.history.replaceState(null, '', 'reset-password.html');
  } catch {
    // The reset still works if an embedded browser does not allow history replacement.
  }
}

function activateResetForm(session) {
  if (!session?.user || recoverySession) {
    return;
  }

  recoverySession = session;
  cleanRecoveryUrl();
  requestNewLink.hidden = true;
  form.hidden = false;
  setStatus('Your reset link is verified. Choose your new password.', 'success');
  form.elements.newPassword.focus();
}

function showInvalidLink() {
  if (recoverySession) {
    return;
  }

  form.hidden = true;
  requestNewLink.hidden = false;
  setStatus('This reset link is invalid or has expired. Request a new link and try again.', 'error');
}

const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    activateResetForm(session);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isSubmitting || !recoverySession) {
    return;
  }

  const formData = new FormData(form);
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (newPassword.length < 6) {
    setStatus('Your new password must be at least 6 characters.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setStatus('The two passwords do not match.', 'error');
    form.elements.confirmPassword.focus();
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  setStatus('Updating your password…', 'info');

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw error;
    }
  } catch (error) {
    setStatus(error.message || 'We could not update your password. Request a new reset link and try again.', 'error');
    submitButton.disabled = false;
    isSubmitting = false;
    return;
  }

  form.reset();
  form.hidden = true;

  let signedOut = false;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    signedOut = !error;
  } catch {
    signedOut = false;
  }

  if (!signedOut) {
    backToLogin.hidden = true;
    continueToApp.hidden = false;
    setStatus('Password updated successfully. You are still signed in on this browser and can continue to Prem Predics.', 'success');
    return;
  }

  setStatus('Password updated. Returning you to Log In…', 'success');
  window.setTimeout(() => {
    window.location.replace('login.html?password_reset=success');
  }, 900);
});

try {
  const { error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  if (!recoverySession) {
    showInvalidLink();
  }
} catch {
  showInvalidLink();
}

window.addEventListener('pagehide', () => {
  authListener?.subscription?.unsubscribe();
}, { once: true });
