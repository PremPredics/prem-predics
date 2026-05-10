import { supabase } from './supabase-client.js';

const adminButton = document.querySelector('[data-admin-access]');

async function boot() {
  if (!adminButton) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return;
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  adminButton.hidden = isAdmin !== true;
}

boot();
