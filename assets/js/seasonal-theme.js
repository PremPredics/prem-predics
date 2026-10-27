// Public cosmetic setting: deliberately independent of auth and page loading.
(() => {
  const cacheKey = 'pp-seasonal-theme-v1';
  const root = document.documentElement;
  const endpoint = 'https://bduiyeddwlgxzpzbelqf.supabase.co/rest/v1/site_theme_settings?id=eq.true&select=halloween_enabled';
  const apiKey = 'sb_publishable_-h1kA0MhtiH4_RuZBxKGbg_thh6RRG-';
  let active = false, busy = false, scheduled = false, lastRead = 0;
  const seed = Math.floor(Math.random() * 10000);
  const segments = 'main > section, main > .panel, .league-panel, .play-card, .quick-league-card, .award-card, .champions-section, .player-box, .curse-target, .account-panel, .league-card';
  const pumpkin = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 14q-2-8 4-10" fill="none" stroke="#b6b45c" stroke-width="4" stroke-linecap="round"/><path d="M25 12q10-6 15-1-8 5-15 1" fill="#8e9948"/><ellipse cx="15" cy="28" rx="12" ry="15" fill="#d85b18"/><ellipse cx="33" cy="28" rx="12" ry="15" fill="#e57020"/><ellipse cx="24" cy="28" rx="13" ry="16" fill="#ff9b32"/><path d="m14 26 5-6 3 7m4 0 3-7 5 6M15 32q9 10 18 0l-6 3-3-3-3 3Z" fill="#47213a"/><path d="M24 15q-6 12-2 24" fill="none" stroke="#ffca65" stroke-width="2" opacity=".5"/></svg>';
  function decorate() {
    scheduled = false;
    if (!active) return;
    const candidates = [...document.querySelectorAll(segments)];
    candidates.forEach((el, index) => {
      if (el.closest('dialog,[hidden]') || el.querySelector(':scope > .pp-pumpkin')) return;
      // Scatter accents between panels, not on every item or inside compact cards.
      if (index !== 0 && (index + seed) % 3 !== 0) return;
      const badge = document.createElement('span');
      badge.className = 'pp-pumpkin';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = pumpkin;
      el.classList.add('pp-autumn-panel');
      el.append(badge);
    });
  }
  const observer = new MutationObserver(records => {
    if (!active || scheduled || !records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && !n.classList.contains('pp-pumpkin')))) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  });
  function apply(enabled) {
    active = enabled === true;
    root.classList.toggle('pp-halloween', active);
    if (active) {
      decorate();
      observer.observe(document.body, {childList:true, subtree:true});
    } else {
      observer.disconnect();
      document.querySelectorAll('.pp-pumpkin').forEach(el => el.remove());
      document.querySelectorAll('.pp-autumn-panel').forEach(el => el.classList.remove('pp-autumn-panel'));
    }
  }
  function save(enabled) {
    apply(enabled);
    try { localStorage.setItem(cacheKey, JSON.stringify({enabled, at:Date.now()})); } catch {}
  }
  async function refresh() {
    if (busy || document.hidden || Date.now() - lastRead < 15000) return;
    busy = true; lastRead = Date.now();
    try {
      const response = await fetch(endpoint, {headers:{apikey:apiKey}, cache:'no-store', signal:AbortSignal.timeout(5000)});
      if (!response.ok) { if (response.status === 404) save(false); return; }
      const rows = await response.json();
      save(rows[0]?.halloween_enabled === true);
    } catch { /* A cosmetic lookup must never block the page. */ }
    finally { busy = false; }
  }
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && Date.now() - cached.at < 300000) apply(cached.enabled);
  } catch {}
  window.addEventListener('pp-theme-changed', event => save(event.detail?.enabled === true));
  window.addEventListener('storage', event => {
    if (event.key === cacheKey) { try { apply(JSON.parse(event.newValue)?.enabled); } catch {} }
  });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  setInterval(refresh, 60000);
  setTimeout(refresh, 0);
})();
