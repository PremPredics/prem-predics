# Gameweek notifications and compact predictions

## Release

The additive migration `supabase/migrations/20261018154215_gameweek_push_notifications.sql`
and the `gameweek-notifications` Edge Function are installed on Prem Predics
(`bduiyeddwlgxzpzbelqf`). No season reset or manual SQL is required for this release.
No leagues, memberships, predictions, results, card effects or player stats are changed.

## User controls

- A bell appears in page title bars. Open it while signed in, select either reminder,
  and press **Save settings** to grant the browser permission.
- Both options start off. Preferences apply to this browser/device, independently.
- Switching both off deletes this device's subscription and unsubscribes it.
- Signing out or changing accounts unsubscribes a device previously bound by this UI.
- Supported browser/PWA Web Push is required. On iOS/iPadOS 16.4+, use the installed
  Home Screen app. The Capacitor native Android wrapper does not implement this feature.
- Permission is requested only from the Save gesture, never on page load. Settings
  queries are deferred until the bell opens; existing pages do not wait for them.

## Event definitions

- **Gameweek finished:** all non-postponed fixtures in the active-season gameweek
  have been marked `final`. This depends on entered results, not an estimated final whistle.
- **Deadline reminder:** two hours before the first deadline (normally 90 minutes
  before first kick-off), so normally 3.5 hours before kick-off, not two hours before kick-off.
- One event per season/gameweek/type and one delivery per subscribed device; belonging
  to multiple leagues does not multiply the same reminder.
- Only relevant league members who opted in before the event qualify. Already-completed
  weeks are baselined as expired; opting in never sends a backlog of old notifications.
- Cron checks each minute. Deadline events have a 15-minute catch-up window; completed
  week events expire after 24 hours. Device/network/browser restrictions can delay delivery.
- Delivery has a five-attempt limit and a five-minute claim lease. HTTP 404/410 disables
  expired subscriptions. Repeated event tags coalesce on the device.
- Notifications open the homepage, where the user can choose their league.

## Security

Subscription rows are readable/deletable only by their authenticated owner. Registration
uses an auth-checked RPC that derives the owner from the JWT. Private event/queue/config
tables are inaccessible to browser roles; the VAPID private key and cron secret stay in Vault.
Only the public signing key is public. Worker and secret RPCs are service-role-only.
The worker validates its private cron header before claiming jobs; disabling the Edge
gateway JWT check does not remove this worker authentication. Delivery endpoints are
restricted to known HTTPS browser push providers, with redirects rejected and timeouts.

Security advisors flag the intentionally public-key RPC and authenticated registration
RPC as security-definer APIs. Their grants, auth checks and empty search paths were reviewed.
Private tables intentionally have RLS with no browser policies (deny all).

## Verification

- Browser checks at widths 360, 390, 430, 768 and 1440: all ten normal fixtures visible,
  no horizontal overflow, kickoff headers, save/edit retained, bell placement, independent
  opt-in/off controls and no permission request at startup. Browser backend/push calls
  are mocked in this test; real league writes are not made.
- Unit tests cover UK GMT/BST labels, malformed dates, endpoint allowlisting, notification
  expiry, service-worker display/tags and safe click destinations.
- Full suite: 97 passed, 15 failed. An isolated archive of the pre-change commit was
  run with the same local transfer evidence: 93 passed, the exact same 15 failed.
  Four new tests pass; no new failure was introduced. Fourteen legacy assertions
  expect superseded asset/cache versions or old markup/text. One Player Stats
  evidence-snapshot assertion differs from the separately untracked transfer SQL.
  These unrelated tests were not rewritten to conceal their failures.
- Live database rollback checks confirm own-user subscription access and denial of
  another user's rows and internal RPCs. No test subscription remains.
- Live worker responded successfully; signing key is ready and scheduled runs succeed.
- Actual receipt on a user's physical device still needs their opt-in and a qualifying
  event. Browser mocks and a healthy worker are not proof of device delivery.

Run local focused checks:

```powershell
node --test tests/push-notifications.test.mjs tests/page-loader.test.mjs tests/power-cards-loading.test.mjs tests/deadline-countdown.test.mjs
# With the local static server on port 4173:
node tools/check-predictions-notifications.cjs
```

## Safe operational checks

These SQL queries are optional diagnostics, not installation steps. Do not query or
copy Vault secrets into browser code, logs or support conversations.

```sql
select public.pp_push_public_key() is not null as signing_key_ready;
select jobname, active from cron.job
where jobname = 'prem-predics-gameweek-push';
select status, count(*) from pp_notifications.deliveries group by status;
select gameweek_number, kind, occurred_at, expires_at
from pp_notifications.events order by occurred_at desc;
```

The compact prediction layout replaces row GW pills with UK kickoff labels and shared
column headings; existing fixture locks, save logic, curse restrictions and Hedge rows
remain in place. Additional effect panels, zoom or very short screens may require scrolling.
