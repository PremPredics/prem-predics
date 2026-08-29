# Player Stats and homepage reliability — 28 August 2026

## Status

Implemented locally and tested. **The read-only live player audit is complete**
and documented in `docs/live-player-stats-audit-2026-08-28.md`. No production
SQL, league changes, commits, pushes or new deployment were performed in this
pass. The repair migration has only been rehearsed in disposable PostgreSQL.

The previous profile cache/retry fix is already present on `prempredics.com`
(verified by reading the served `site-auth.js`). The live Quick Access script still
contains the all-or-nothing loading code; this replacement is not deployed yet.

## Root causes and fixes

- Player Stats was built from the full Roster Review query, but a single
  `.range(0, 9999)` does not fetch every page. It can silently stop at Supabase's
  configured row cap (normally 1,000). Alphabetically later players can therefore
  disappear even when present in the separate active-player query. Assignments
  were also unpaginated, and fixtures were fetched across all seasons before
  filtering. The loader now pages every collection with deterministic ordering
  and fetches fixtures/gameweeks for the selected season on the server.
  [Supabase pagination documentation](https://supabase.com/docs/reference/javascript/using-modifiers-range).
- The stats pool did not default to active players. An unchecked **Include
  deactivated players** checkbox now immediately refreshes the current search;
  eligible inactive rows are labelled **Deactivated**.
- A missing assignment previously granted all fixtures of the player's current
  club. That invents historical tenure after a transfer. Editing now requires an
  actual assignment covering the fixture's Gameweek number and team. Gaps,
  wrong-season rows and overlapping different clubs fail closed with an explanation.
- Display/first/last names alone cannot find every documented registered name.
  The additive alias table uses the existing identity source's explicit names,
  not a player-specific nickname rule or fuzzy guess. **Phil Foden remains Phil
  Foden in the UI**; `Philip Foden` is only a search input that can find him.
- Late stat reads could display the previous selection's values. They are now
  ignored, and the entry form is cleared while loading. Saving the four displayed
  stats no longer zeroes/nulls unedited advanced stats/minutes.
- Quick Access waited for every league and hid the entire panel on a single
  failure. It now renders league navigation first, resolves statuses independently,
  shares repeated season/start-week reads and uses bounded requests, retry controls
  and online/visibility recovery. Its per-user cache stores navigation only, not
  predictions or stale action states. Existing game-card rounds no longer require
  a round-creation request on every visit.
- Profile loading retains the known username/photo, bounds the entire request
  (including auth-lock waits), retries failures and recovers on auth/reconnection
  events. Homepage modules share the SDK session read instead of making three
  blocking `getUser` network calls. This is presentation only: admin authorization
  and database RLS remain in force. The fallback no longer displays the email as
  a username. Late responses cannot render/cache an account after sign-out.

## Array responsibilities

| Collection | Purpose | Effect of checkbox |
| --- | --- | --- |
| `state.rosterPlayers` | Complete roster, including inactive rows, for Roster Review | None |
| `state.players` | Active-only roster for existing admin tools | None |
| `state.playerStatPlayers` | Separate active-season stats eligibility pool | Filters this pool's displayed results only |

## Affected players: live audit

The Data API row limit is 1,000. The database has 1,793 player rows and 587 active
players; 269 valid active-season players sit beyond the all-player query's first
page. All 587 active players have usable current-season assignment history. No
active team/history mismatches, invalid/overlapping windows, or fixture stats
without matching history were found. The full 269-name list, 20 intentional
deactivations with history, and all duplicate/identity review groups are in the
live-audit report. None should be reactivated or merged merely because it appears
in that report.

The repository's explicit identity evidence confirms these name variants:

- `Rayan Mathis Cherki` / `Rayan Cherki`.
- `Philip Walter Foden` / `Philip Foden` / `Phil Foden`.

The source contains **1,560 identity groups and 2,957 distinct-per-group name
variants**. Those are source-evidence counts, **not** counts of broken live players.
The migration uses all of this evidence consistently, matching exact normalized
names plus nationality and rejecting players matching multiple source identities.

## SQL and manual steps

1. Review **`docs/live-player-stats-audit-2026-08-28.md`**. The audit used
   **`supabase/audit-player-stats-snapshot-2026-08-28.sql`** and exported football
   reference/history data only—not user emails, profile photos, prediction values
   or cards.
2. The prepared migration is **`supabase/player-stats-pool-integrity-2026-08-28.sql`**.
   Run the **entire file in one run**, not individual selections. It has an explicit
   transaction and is idempotent. It does not depend on a previous temporary table
   or any reset script. The new name searches need this additive migration; the
   client tolerates the alias table not existing while deployment is pending.
3. Later, the persistent read-only report can be rerun with:

```sql
select *
from public.audit_player_stats_pool()
order by issue, display_name;
```

The audit cap defaults to 1,000; pass the configured cap if different. The final
migration output contains both its exact repairs and remaining review cases.

### What the migration can repair

- Adds documented name variants without changing `display_name` or player IDs.
- Copies a current-season assignment to the sole active canonical-name row only
  when its unused inactive legacy identity has the same current club, the target
  has no current-season assignment, no peer has conflicting club history and the
  legacy identities have no current-season picks or stats. The original row and
  assignment are preserved.
- Restores a **single-GW** assignment from existing fixture-stat evidence when
  the recorded club actually played that fixture and no covering assignment exists.
- Fills a **NULL** active current team only from a unique open assignment covering
  the current GW, with a current-season club and no uniqueness conflict.

It never deletes/merges players, changes active flags, rewrites stats/picks or
touches competitions, memberships, predictions, results or cards.

### Ambiguities intentionally not guessed

- Multiple active identities or ambiguous source-name matches.
- Legacy identities already referenced by current-season picks/stats.
- Non-null current-club mismatches, overlapping different clubs and uncertain
  transfer/start dates.
- Active players with no usable assignment evidence; inactive-only identities
  and intentional departures/loans.
- Different-nationality namesakes or undocumented newer player-name changes.

The report flags duplicate names/identities, out-of-season active rows, missing or
invalid history, inactive history, overlapping clubs, current-team mismatches,
stats lacking matching history and players past the configured API page boundary.

## Files changed

- `assets/js/global-admin.js`, `global-admin.html`.
- New `assets/js/load-all-rows.js`, `assets/js/player-stats-pool.js`.
- Both SQL files above; `tools/player-identity-evidence.mjs` reproduces/validates
  the embedded evidence without executing the old identity SQL.
- `assets/js/site-auth.js`, `assets/js/index-actions.js`, `assets/js/index-admin.js`.
- New `assets/js/async-read.js`, `assets/js/session-user.js`.
- `index.html`, `service-worker.js` and the other pages' shared-auth script version
  references only. The PWA cache includes all newly imported modules.
- Regression tests/support and `tools/preview-player-stats-fixes.mjs` (synthetic,
  local-only visual QA; never imported into production).

Existing unrelated/untracked transfer/reset SQL files were left untouched.

## Verification

- **28 automated tests passed**: complete capped pagination; all six requested
  searches; accent-insensitive search; active/deactivated filtering; isolated
  arrays; historical transfers, gaps, overlaps and non-monotonic GW IDs; checkbox
  refresh; actual admin panel rendering (Actual Results, Fixture Stats, Schedule,
  Roster Review); stat entry/update and late-response safety; homepage staged
  loading/timeouts/partial failures/retry/sign-out; profile cache/retry and blocked
  storage.
- Executed the full SQL twice in disposable PostgreSQL/PGlite: second run produced
  no new repairs, protected rows and original assignments remained byte-for-byte
  equivalent, names/flags/IDs stayed unchanged, constraints remained valid, RLS
  blocked non-admin alias writes, and ambiguous active seasons rolled back.
- Local browser verified `Philip Foden` displays **Phil Foden**, checkbox results
  refresh immediately, only the correct workflow step is shown, and mobile/desktop
  layouts have no horizontal overflow. Simulated game-card failure kept both
  leagues and their healthy statuses visible.
- JavaScript syntax checks, `git diff --check` and the Capacitor web build passed.
- The live snapshot contains 1,793 players, 2,262 assignments, 760 fixtures and
  76 Gameweeks. The migration rehearsal added 2,944 aliases across 1,552 identities,
  made zero assignment/team/activation changes, preserved the downloaded protected
  evidence, and produced no changes on its second run.
- Star Man selectors and transfer-processing logic were not edited. SQL tests
  verify their referenced player IDs/flags and historical records are preserved;
  an authenticated production smoke test remains required after deployment.

See `tests/README.md` for repeatable local commands. Browser/SQL tests used
synthetic data, not live league writes. No device installation was performed.
