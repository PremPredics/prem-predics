import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPlayerStatsIndex, matchesPlayerSearch, normalisePlayerSearch } from '../assets/js/player-stats-pool.js';
import { readIdentityEvidence } from './player-identity-evidence.mjs';

// Offline only: accepts the reference-data JSON returned by the read-only audit.
// It has no network client, credentials, or production database connection.
export function analysePlayerSnapshot(snapshot, rowCap = 1000) {
  const season = snapshot.seasons.filter((s) => s.is_active);
  assert.equal(season.length, 1, 'Exactly one active season is required');
  const seasonId = season[0].id;
  const fixtures = snapshot.fixtures.filter((f) => f.season_id === seasonId);
  const assignments = snapshot.assignments.filter((a) => a.season_id === seasonId);
  const teams = new Map(snapshot.teams.map((t) => [t.id, t.name]));
  const gameweeks = new Map(snapshot.gameweeks.map((g) => [g.id, g]));
  const index = createPlayerStatsIndex({ seasonId, fixtures, assignments, gameweeks: snapshot.gameweeks });
  const key = (name) => normalisePlayerSearch(name).replace(/[^a-z0-9]/g, '');
  const country = (name) => ({ republicofireland: 'ireland', cotedivoire: 'ivorycoast',
    unitedstatesofamerica: 'unitedstates', usa: 'unitedstates', turkiye: 'turkey',
    czechia: 'czechrepublic', drcongo: 'democraticrepublicofthecongo' }[key(name)] || key(name));
  const source = readIdentityEvidence();
  const identityMatches = new Map();
  for (const p of snapshot.players) {
    const matches = source.filter((s) => country(s.nationality) === country(p.nationality)
      && s.names.some((n) => key(n) === key(p.display_name)));
    if (matches.length === 1) identityMatches.set(p.id, matches[0]);
  }
  const describe = (p) => ({ id: p.id, name: p.display_name, active: p.is_active,
    nationality: p.nationality, team: teams.get(p.team_id) || null,
    api_position: snapshot.players.indexOf(p) + 1,
    history: index.history(p.id).map((a) => ({ id: a.id, team: teams.get(a.team_id),
      start: gameweeks.get(a.starts_gameweek_id)?.number ?? null,
      end: a.ends_gameweek_id == null ? null : gameweeks.get(a.ends_gameweek_id)?.number ?? 'invalid' })) });
  const active = snapshot.players.filter((p) => p.is_active === true);
  const activeEligible = active.filter(index.eligible);
  const inactiveEligible = snapshot.players.filter((p) => !p.is_active && index.eligible(p));
  const missing = snapshot.players.slice(rowCap).filter((p) => p.is_active && index.eligible(p));
  const byName = new Map();
  const byIdentity = new Map();
  for (const p of snapshot.players) {
    const name = key(p.display_name);
    byName.set(name, [...(byName.get(name) || []), p]);
    const identity = identityMatches.get(p.id);
    if (identity) byIdentity.set(identity.source_key, [...(byIdentity.get(identity.source_key) || []), p]);
  }
  const overlaps = [];
  const invalidWindows = [];
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const start = gameweeks.get(a.starts_gameweek_id);
    const end = a.ends_gameweek_id == null ? null : gameweeks.get(a.ends_gameweek_id);
    if (!start || start.season_id !== seasonId || (a.ends_gameweek_id != null
      && (!end || end.season_id !== seasonId || end.number < start.number))) invalidWindows.push(a);
    for (const b of assignments.slice(i + 1)) {
      if (a.player_id !== b.player_id || a.team_id === b.team_id) continue;
      const bStart = gameweeks.get(b.starts_gameweek_id);
      const bEnd = b.ends_gameweek_id == null ? null : gameweeks.get(b.ends_gameweek_id);
      if (start?.number <= (bEnd?.number ?? Infinity) && bStart?.number <= (end?.number ?? Infinity)) {
        overlaps.push({ player_id: a.player_id, assignment_a: a.id, assignment_b: b.id });
      }
    }
  }
  const queries = ['Cherki', 'Rayan', 'Rayan Cherki', 'Foden', 'Phil Foden', 'Philip Foden'];
  return {
    captured_at: snapshot.captured_at, season: season[0], rowCap,
    counts: { players: snapshot.players.length, active: active.length, activeEligible: activeEligible.length,
      inactiveEligible: inactiveEligible.length, assignments: snapshot.assignments.length,
      currentSeasonAssignments: assignments.length, currentSeasonFixtures: fixtures.length,
      omittedByOldPage: missing.length },
    omittedByOldPage: missing.map(describe),
    activeWithoutEligibleHistory: active.filter((p) => !fixtures.some((f) => index.teamForFixture(p, f))).map(describe),
    activeOutsideSeason: active.filter((p) => !index.eligible(p)).map(describe),
    inactiveWithHistory: inactiveEligible.map(describe),
    activeCurrentTeamMismatch: active.filter((p) => index.history(p.id).some((a) => a.ends_gameweek_id == null && a.team_id !== p.team_id)).map(describe),
    duplicateNames: [...byName.values()].filter((rows) => rows.length > 1).map((rows) => rows.map(describe)),
    documentedDuplicateIdentities: [...byIdentity.entries()].filter(([, rows]) => rows.length > 1)
      .map(([source_key, rows]) => ({ source_key, players: rows.map(describe) })),
    invalidWindows, overlaps,
    fixtureStatsWithoutMatchingHistory: snapshot.fixture_stat_references.filter((r) => r.season_id === seasonId)
      .filter((r) => index.teamForFixture(snapshot.players.find((p) => p.id === r.player_id), fixtures.find((f) => f.id === r.fixture_id)) !== r.team_id),
    requestedSearches: Object.fromEntries(queries.map((query) => [query, activeEligible
      .filter((p) => matchesPlayerSearch(p, query, identityMatches.get(p.id)?.names || []))
      .map((p) => ({ id: p.id, display_name: p.display_name }))])),
  };
}

export async function rehearseMigration(snapshot) {
  const { testDependency } = await import('../tests/support/dependencies.mjs');
  const { PGlite } = testDependency('@electric-sql/pglite');
  const { unaccent } = testDependency('@electric-sql/pglite/contrib/unaccent');
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/player-stats-pool-integrity-2026-08-28.sql', import.meta.url), 'utf8');
  const db = await PGlite.create({ extensions: { unaccent } });
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create function public.is_admin() returns boolean language sql as $$select false$$;
      create table seasons(id uuid primary key, name text, is_active boolean);
      create table teams(id uuid primary key, name text);
      create table profiles(id uuid primary key);
      create table gameweeks(id bigint primary key, season_id uuid references seasons(id), number int, unique(id,season_id));
      create table fixtures(id uuid primary key, season_id uuid references seasons(id), gameweek_id bigint,
        home_team_id uuid references teams(id), away_team_id uuid references teams(id), status text,
        foreign key(gameweek_id,season_id) references gameweeks(id,season_id));
      ${schema.match(/create table public\.players \([\s\S]*?\n\);/)[0]}
      ${schema.match(/create table public\.player_team_assignments \([\s\S]*?\n\);/)[0]}
      create table player_fixture_stats(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id),
        fixture_id uuid references fixtures(id), gameweek_id bigint references gameweeks(id),
        player_id uuid references players(id), team_id uuid references teams(id), unique(fixture_id,player_id));
      create table player_gameweek_stats(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id),
        gameweek_id bigint references gameweeks(id), player_id uuid references players(id), unique(season_id,gameweek_id,player_id));
      create table star_man_picks(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id), player_id uuid references players(id));
    `);
    async function insertRows(table, rows) {
      if (!rows?.length) return;
      const columns = Object.keys(rows[0]);
      const definitions = (await db.query('select column_name, udt_name from information_schema.columns where table_schema = $1 and table_name = $2', ['public', table])).rows;
      const types = new Map(definitions.map((c) => [c.column_name, c.udt_name]));
      for (const c of columns) assert.ok(types.has(c), `Unknown ${table}.${c}`);
      const names = columns.map((c) => `"${c}"`).join(',');
      const typed = columns.map((c) => `"${c}" ${types.get(c)}`).join(',');
      await db.query(`insert into "${table}" (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${typed})`, [JSON.stringify(rows)]);
    }
    for (const table of ['seasons', 'teams', 'gameweeks', 'fixtures', 'players']) await insertRows(table, snapshot[table]);
    await insertRows('player_team_assignments', snapshot.assignments);
    await insertRows('player_fixture_stats', snapshot.fixture_stat_references);
    await insertRows('player_gameweek_stats', snapshot.gameweek_stat_references);
    await insertRows('star_man_picks', snapshot.pick_references.map(({ season_id, player_id }) => ({ season_id, player_id })));
    // Pick counts are aggregate evidence, not a downloaded copy of users' picks.
    const protectedTables = ['seasons', 'teams', 'gameweeks', 'fixtures', 'players', 'player_fixture_stats', 'player_gameweek_stats', 'star_man_picks'];
    const before = await Promise.all(protectedTables.map((t) => db.query(`select * from ${t} order by id`)));
    const history = (await db.query('select * from player_team_assignments order by id')).rows;
    const first = await db.exec(migration);
    const report = first.find((r) => r.rows?.[0]?.player_stats_integrity_report).rows[0].player_stats_integrity_report;
    for (const [i, table] of protectedTables.entries()) {
      assert.deepEqual((await db.query(`select * from ${table} order by id`)).rows, before[i].rows, `${table} changed unexpectedly in snapshot rehearsal`);
    }
    const afterHistory = (await db.query('select * from player_team_assignments order by id')).rows;
    for (const row of history) assert.deepEqual(afterHistory.find((r) => r.id === row.id), row);
    const aliases = (await db.query('select * from player_name_aliases order by player_id,name')).rows;
    const second = await db.exec(migration);
    assert.deepEqual(second.find((r) => r.rows?.[0]?.player_stats_integrity_report).rows[0].player_stats_integrity_report.repairs, []);
    assert.deepEqual((await db.query('select * from player_team_assignments order by id')).rows, afterHistory);
    assert.deepEqual((await db.query('select * from player_name_aliases order by player_id,name')).rows, aliases);
    return { ...report, aliasRows: aliases.length, aliasPlayerRows: new Set(aliases.map((a) => a.player_id)).size,
      newAssignments: afterHistory.length - history.length, protectedSnapshotRowsUnchanged: true, secondRunNoChanges: true };
  } finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const result = { audit: analysePlayerSnapshot(snapshot, Number(process.argv[3] || 1000)) };
  if (process.argv.includes('--rehearse')) result.rehearsal = await rehearseMigration(snapshot);
  if (process.argv.includes('--compact')) {
    const countBy = (rows, field) => Object.fromEntries([...new Set(rows.map((r) => r[field]))]
      .sort().map((value) => [value, rows.filter((r) => r[field] === value).length]));
    const compact = {
      audit: {
        captured_at: result.audit.captured_at,
        season: result.audit.season,
        rowCap: result.audit.rowCap,
        counts: result.audit.counts,
        omittedByOldPage: result.audit.omittedByOldPage.map(({ id, name, team, api_position }) => ({ id, name, team, api_position })),
        findingCounts: Object.fromEntries(['activeWithoutEligibleHistory', 'activeOutsideSeason',
          'inactiveWithHistory', 'activeCurrentTeamMismatch', 'duplicateNames',
          'documentedDuplicateIdentities', 'invalidWindows', 'overlaps',
          'fixtureStatsWithoutMatchingHistory'].map((field) => [field, result.audit[field].length])),
        highRiskFindings: Object.fromEntries(['activeWithoutEligibleHistory', 'activeOutsideSeason',
          'activeCurrentTeamMismatch', 'invalidWindows', 'overlaps',
          'fixtureStatsWithoutMatchingHistory'].map((field) => [field, result.audit[field]])),
        inactiveWithHistory: result.audit.inactiveWithHistory.map(({ id, name, team, history }) => ({ id, name, team, history })),
        duplicateNames: result.audit.duplicateNames.map((group) => group.map(({ id, name, active, team, history }) => ({ id, name, active, team, history }))),
        documentedDuplicateIdentities: result.audit.documentedDuplicateIdentities.map(({ source_key, players }) => ({
          source_key, players: players.map(({ id, name, active, team, history }) => ({ id, name, active, team, history })),
        })),
        requestedSearches: result.audit.requestedSearches,
      },
    };
    if (result.rehearsal) compact.rehearsal = {
      repairCounts: countBy(result.rehearsal.repairs, 'repair'),
      nonAliasRepairs: result.rehearsal.repairs.filter((r) => r.repair !== 'search_names_added'),
      reviewCounts: countBy(result.rehearsal.review, 'issue'),
      reviewNames: Object.fromEntries([...new Set(result.rehearsal.review.map((r) => r.issue))]
        .sort().map((issue) => [issue, result.rehearsal.review.filter((r) => r.issue === issue)
          .map((r) => r.display_name).sort((a, b) => a.localeCompare(b))])),
      aliasRows: result.rehearsal.aliasRows,
      aliasPlayerRows: result.rehearsal.aliasPlayerRows,
      newAssignments: result.rehearsal.newAssignments,
      protectedSnapshotRowsUnchanged: result.rehearsal.protectedSnapshotRowsUnchanged,
      secondRunNoChanges: result.rehearsal.secondRunNoChanges,
    };
    const section = process.argv.find((arg) => arg.startsWith('--section='))?.split('=')[1];
    if (section === 'omitted') console.log(JSON.stringify(compact.audit.omittedByOldPage));
    else if (section === 'inactive') console.log(JSON.stringify(compact.audit.inactiveWithHistory));
    else if (section === 'duplicates') console.log(JSON.stringify(compact.audit.duplicateNames));
    else if (section === 'identities') console.log(JSON.stringify(compact.audit.documentedDuplicateIdentities));
    else if (section === 'ambiguities') console.log(JSON.stringify({ inactiveWithHistory: compact.audit.inactiveWithHistory,
      duplicateNames: compact.audit.duplicateNames, documentedDuplicateIdentities: compact.audit.documentedDuplicateIdentities }));
    else if (section === 'summary') {
      const { omittedByOldPage, inactiveWithHistory, duplicateNames, documentedDuplicateIdentities, ...summary } = compact.audit;
      console.log(JSON.stringify({ ...summary, sectionCounts: {
        omittedByOldPage: omittedByOldPage.length, inactiveWithHistory: inactiveWithHistory.length,
        duplicateNames: duplicateNames.length, documentedDuplicateIdentities: documentedDuplicateIdentities.length,
      }}));
    } else console.log(JSON.stringify(compact));
  } else console.log(JSON.stringify(result));
}
