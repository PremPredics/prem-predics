export function allowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)
        || /^[a-z0-9-]+[.]notify[.]windows[.]com$/.test(url.hostname));
  } catch { return false; }
}
export function notificationTTL(expiresAt, now = Date.now()) {
  return Math.max(0, Math.min(86400, Math.floor((new Date(expiresAt).getTime()-now)/1000))) || 0;
}
