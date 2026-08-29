# Local regression tests

No test connects to the live Supabase project. SQL tests execute the entire new
migration in an in-memory PostgreSQL/PGlite database with synthetic records.
DOM tests execute the real admin/home/profile modules against synthetic responses.

Optional isolated dependencies (run from the repository root):

```powershell
npm.cmd install --prefix ..\test-tools --cache ..\test-tools\npm-cache --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8 jsdom@26.1.0
node --test tests/player-stats-pool.test.mjs tests/admin-ui.test.mjs tests/home-loading.test.mjs tests/player-integrity-migration.test.mjs
```

They can also be installed in the normal Node module resolution path.

For visual QA only:

```powershell
node tools/preview-player-stats-fixes.mjs
```

Open `http://127.0.0.1:4187/index.html?testFailure=1` for a simulated failed game
card request, or `http://127.0.0.1:4187/global-admin.html` for the admin controls.
Any synthetic password unlocks this local test double; do not enter a real one.
The local server substitutes the Supabase client, so all saves stay in memory.

Coverage includes capped pagination, array isolation, all requested name queries,
accent handling, assignment windows/gaps/overlaps, the inactive checkbox, stale
stat responses, preservation of unedited stats, admin panel rendering, staged
homepage loading, independent failures, timeout/retry, account changes, profile
cache/storage failures, SQL rollback/idempotency, RLS and historical-record/FK
preservation. Synthetic tests complement, but do not replace, the completed
read-only live-data audit described below.

The completed read-only live audit snapshot is stored outside the repository.
Reproduce its offline classification and migration rehearsal with:

```powershell
node tools/audit-player-stats-snapshot.mjs ..\player-audit-2026-08-28.json 1000 --compact
node tools/audit-player-stats-snapshot.mjs ..\player-audit-2026-08-28.json 1000 --rehearse --compact
```

The rehearsal uses a disposable local PostgreSQL/PGlite database and has no
network client or production credentials. See
`docs/live-player-stats-audit-2026-08-28.md` for the verified live findings.
