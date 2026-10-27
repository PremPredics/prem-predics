// No database reads or permission prompts during page startup.
let host = document.querySelector('body > header, .awards-header, body > h1');
// Cards has a standalone title and an absolutely-positioned Back button.
// Give those existing elements a real toolbar so the bell never covers either.
if (host?.tagName === 'H1') {
  const title=host, back=document.querySelector('body > .back-home-btn');
  host=document.createElement('header');
  host.className='pp-card-titlebar';
  title.before(host);
  host.append(title);
  if(back) host.append(back);
}
let dialog, user, client, subscription, publicKey, busy = false;
const supportsPush = () => 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
  && !window.Capacitor?.isNativePlatform?.();
const bounded = (promise, ms = 12000) => {
  let timer;
  return Promise.race([promise, new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('Connection timed out. Please try again.')), ms); })]).finally(() => clearTimeout(timer));
};
const bytes = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
function setStatus(message) { dialog.querySelector('[data-notification-status]').textContent = message; }
function setBusy(value) {
  busy = value;
  dialog.querySelectorAll('input,button[type=submit]').forEach(el => { el.disabled = value; });
}
async function registration() {
  await bounded(navigator.serviceWorker.register('service-worker.js', { scope:'./', updateViaCache:'none' }));
  return bounded(navigator.serviceWorker.ready);
}
function makeDialog() {
  const el = document.createElement('dialog');
  el.className = 'pp-notification-dialog';
  el.setAttribute('aria-labelledby','pp-notification-title');
  el.innerHTML = `<form>
    <h2 id="pp-notification-title">Your notifications</h2>
    <p>Choose your reminders on this device. Both are off until you switch them on.</p>
    <label><span><b>Gameweek results are ready</b><small>Get notified when the Gameweek has ended so you can check your results.</small></span><input type="checkbox" name="gameweek_ended" aria-label="Gameweek results notifications"></label>
    <label><span><b>2 hours until deadlines lock</b><small>A reminder to submit your opening-match predictions, Star Man and Game Card picks, and play any Power Cards before the Gameweek's opening deadlines.</small></span><input type="checkbox" name="deadline_reminder" aria-label="Two-hour deadline reminder"></label>
    <p data-notification-status role="status" aria-live="polite"></p>
    <div class="pp-notification-actions"><button type="button" data-notification-close>Back</button><button type="submit">Save settings</button></div>
  </form>`;
  el.querySelector('[data-notification-close]').onclick = () => el.close();
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.querySelector('form').addEventListener('submit', save);
  document.body.append(el);
  return el;
}
async function open() {
  dialog ||= makeDialog();
  dialog.showModal();
  setBusy(true);
  setStatus('Loading your settings…');
  dialog.querySelectorAll('input').forEach(el => { el.checked = false; });
  try {
    if (!supportsPush()) {
      throw new Error('Notifications need a supported browser or installed PWA. On iPhone/iPad (iOS 16.4+), add Prem Predics to your Home Screen, then open it there. The native Android wrapper is not supported yet.');
    }
    ({ supabase:client } = await import('./supabase-client.js'));
    const {data,error} = await bounded(client.auth.getUser());
    if (error || !data?.user) throw new Error('Sign in to choose your notification settings.');
    user = data.user;
    const reg = await registration();
    subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const {data:settings,error:readError} = await bounded(client.from('pp_push_subscriptions')
        .select('gameweek_ended,deadline_reminder').eq('user_id',user.id).eq('endpoint',subscription.endpoint).maybeSingle());
      if (readError) throw new Error('Notification setup is not available yet. Please try again shortly.');
      for (const name of ['gameweek_ended','deadline_reminder']) dialog.querySelector(`[name="${name}"]`).checked = Boolean(settings?.[name]);
    }
    const {data:key,error:keyError} = await bounded(client.rpc('pp_push_public_key'));
    if (keyError || !key) throw new Error('Notifications are being set up. Please try again shortly.');
    publicKey = key;
    setStatus(Notification.permission === 'denied'
      ? 'Notifications are blocked in browser settings. You can turn reminders off here; to enable them, first allow notifications for Prem Predics in your browser.'
      : '');
    setBusy(false);
  } catch(error) {
    setStatus(error.message || 'Could not load notification settings.');
    // Back remains usable even if setup/permissions fail.
    setBusy(true);
  }
}
async function save(event) {
  event.preventDefault();
  if (busy || !user) return;
  const ended = dialog.querySelector('[name=gameweek_ended]').checked;
  const deadline = dialog.querySelector('[name=deadline_reminder]').checked;
  // Call directly from the click gesture, before awaiting any network operation (iOS).
  const permission = ended || deadline ? Notification.requestPermission() : Promise.resolve('granted');
  setBusy(true);
  try {
    if (await permission !== 'granted') throw new Error('Permission was not granted. Your notifications have not been enabled.');
    const reg = await registration();
    subscription = await reg.pushManager.getSubscription();
    if (!ended && !deadline) {
      if (subscription) {
        const {error} = await bounded(client.from('pp_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',subscription.endpoint));
        if (error) throw error;
        await subscription.unsubscribe();
      }
    } else {
      if (!subscription) subscription = await bounded(reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:bytes(publicKey) }));
      const json = subscription.toJSON();
      const {error} = await bounded(client.rpc('pp_push_subscribe', {
        p_endpoint:json.endpoint, p_p256dh:json.keys.p256dh, p_auth:json.keys.auth,
        p_ended:ended, p_deadline:deadline,
      }));
      if (error) throw new Error('Could not save settings. Please try again.');
    }
    try {
      if (ended || deadline) localStorage.setItem('pp-push-user',user.id);
      else localStorage.removeItem('pp-push-user');
    } catch { /* browser storage may be unavailable */ }
    setStatus(ended || deadline ? 'Saved! Your selected notifications are enabled on this device.' : 'Saved. Notifications are off on this device.');
  } catch(error) {
    setStatus(error.message || 'Could not save settings. Please try again.');
  } finally { setBusy(false); }
}
async function syncAccount(userId) {
  if (!supportsPush()) return;
  try {
    const owner=localStorage.getItem('pp-push-user');
    if (owner && owner!==userId) {
      const reg=await navigator.serviceWorker.getRegistration();
      const sub=await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      localStorage.removeItem('pp-push-user');
      user=null;
      dialog?.close();
    }
  } catch { /* expired endpoints are also disabled server-side */ }
}
window.addEventListener('pp-auth-state', ({detail}) => syncAccount(detail.userId));
if (window.premPredicsSupabase) {
  window.premPredicsSupabase.auth.getSession().then(({data}) => syncAccount(data.session?.user?.id || null));
}
// Homepage keeps the logo alone at the exact centre; other pages retain the bell.
if (host && !document.body.classList.contains('slick-home')) {
  const css = document.createElement('link');
  css.rel='stylesheet'; css.href='assets/css/notifications.css?v=20261027-clear'; document.head.append(css);
  host.classList.add('pp-bell-host');
  const button=document.createElement('button');
  button.type='button'; button.className='pp-notification-bell';
  button.setAttribute('aria-label','Notification settings'); button.setAttribute('aria-haspopup','dialog');
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4M12 1v2"/></svg>';
  button.addEventListener('click',open); host.append(button);
}
