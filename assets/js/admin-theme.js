import { supabase } from './supabase-client.js';
const toggle = document.querySelector('[data-halloween-toggle]');
const status = document.querySelector('[data-theme-status]');
async function load() {
  const {data,error} = await supabase.from('site_theme_settings').select('halloween_enabled').eq('id',true).single();
  if (error) { status.textContent = 'Run the Halloween theme SQL setup, then refresh this page to enable the switch.'; return; }
  toggle.checked = data.halloween_enabled;
  toggle.disabled = false;
}
toggle?.addEventListener('change', async () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  status.textContent = 'Saving for everyone…';
  try {
    const {data,error} = await supabase.from('site_theme_settings').update({halloween_enabled:enabled}).eq('id',true).select('halloween_enabled').single();
    if (error || data?.halloween_enabled !== enabled) throw error || new Error('Not saved');
    window.dispatchEvent(new CustomEvent('pp-theme-changed',{detail:{enabled}}));
    status.textContent = enabled ? 'Halloween is on for everyone. Open pages update within a minute.' : 'Halloween is off for everyone. Open pages update within a minute.';
  } catch {
    toggle.checked = !enabled;
    status.textContent = 'Could not save. Check your global-admin session and try again.';
  } finally { toggle.disabled = false; }
});
if (toggle) load().catch(() => { status.textContent = 'Could not load the theme setting. Refresh to retry.'; });
