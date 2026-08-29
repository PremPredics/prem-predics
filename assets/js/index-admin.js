import { supabase } from './supabase-client.js';
import { getSessionUser } from './session-user.js';

const adminButton = document.querySelector('[data-admin-access]');

async function boot() {
  if (!adminButton) {
    return;
  }

  const user = await getSessionUser();
  if (!user) {
    return;
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  adminButton.hidden = isAdmin !== true;
}

boot().catch(() => { if (adminButton) adminButton.hidden = true; });
