import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';
const { PGlite } = testDependency('@electric-sql/pglite');
const { unaccent } = testDependency('@electric-sql/pglite/contrib/unaccent');
const migration = readFileSync(new URL('../supabase/player-stats-pool-integrity-2026-08-28.sql', import.meta.url), 'utf8');
const snapshotSql = readFileSync(new URL('../supabase/audit-player-stats-snapshot-2026-08-28.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fixtureDatabase() {
  const db = await PGlite.create({ extensions: { unaccent } });
  await db.exec(`
    create role authenticated; create role anon;
    create function public.is_admin() returns boolean language sql as $$select false$$;
    create table seasons(id uuid primary key, name text, is_active boolean);
    create table teams(id uuid primary key, name text);
    create table profiles(id uuid primary key);
    create table gameweeks(id bigint primary key, season_id uuid references seasons(id), number int, unique(id, season_id));
    create table fixtures(id uuid primary key, season_id uuid references seasons(id), gameweek_id bigint,
      home_team_id uuid references teams(id), away_team_id uuid references teams(id), status text,
      foreign key(gameweek_id,season_id) references gameweeks(id,season_id));
    ${schema.match(/create table public\.players \([\s\S]*?\n\);/)[0]}
    ${schema.match(/create table public\.player_team_assignments \([\s\S]*?\n\);/)[0]}
    create table player_fixture_stats(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id),
      fixture_id uuid references fixtures(id), gameweek_id bigint references gameweeks(id),
      player_id uuid references players(id), team_id uuid references teams(id), goals int default 0,
      minutes_played int, unique(fixture_id,player_id));
    create table player_gameweek_stats(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id),
      gameweek_id bigint references gameweeks(id), player_id uuid references players(id), goals int default 0,
      unique(season_id,gameweek_id,player_id));
    create table star_man_picks(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id), player_id uuid references players(id));
    create table competitions(id uuid primary key, payload jsonb);
    create table predictions(id uuid primary key, payload jsonb);
    create table match_results(id uuid primary key, payload jsonb);
    create table league_cards(id uuid primary key, payload jsonb);
    insert into seasons values ('${id(1)}','Current',true),('${id(2)}','Historic',false);
    insert into teams values ('${id(10)}','Manchester City'),('${id(11)}','Other Club'),('${id(12)}','Former Club');
    insert into gameweeks values (100,'${id(1)}',1),(200,'${id(1)}',2),(300,'${id(1)}',3),(1,'${id(2)}',1);
    insert into fixtures values
      ('${id(20)}','${id(1)}',100,'${id(10)}','${id(11)}','final'),
      ('${id(21)}','${id(1)}',200,'${id(11)}','${id(10)}','scheduled'),
      ('${id(22)}','${id(1)}',300,'${id(10)}','${id(11)}','scheduled'),
      ('${id(23)}','${id(2)}',1,'${id(12)}','${id(10)}','final');
    insert into players(id,display_name,nationality,team_id,is_active) values
      ('${id(100)}','Phil Foden','England','${id(10)}',true),
      ('${id(101)}','Philip Walter Foden','England','${id(10)}',false),
      ('${id(102)}','Rayan Cherki','France','${id(10)}',true),
      ('${id(103)}','Rayan Mathis Cherki','France','${id(10)}',false),
      ('${id(104)}','Ben White','England','${id(10)}',true),
      ('${id(105)}','Benjamin White','England','${id(11)}',true),
      ('${id(106)}','Harry Wilson','Wales','${id(12)}',false),
      ('${id(107)}','Null Club Example','England',null,true),
      ('${id(108)}','Historic Example','England','${id(12)}',false),
      ('${id(109)}','Transfer Example','England','${id(11)}',true),
      ('${id(110)}','Overlap Example','England','${id(10)}',true),
      ('${id(111)}','Unknown Tenure','England','${id(10)}',true),
      ('${id(112)}','Savio','Brazil','${id(11)}',true),
      ('${id(113)}','Phil Foden','Germany','${id(11)}',true);
    insert into player_team_assignments(season_id,player_id,team_id,starts_gameweek_id,ends_gameweek_id) values
      ('${id(1)}','${id(101)}','${id(10)}',100,null),
      ('${id(1)}','${id(103)}','${id(10)}',100,null),
      ('${id(1)}','${id(105)}','${id(11)}',100,null),
      ('${id(1)}','${id(107)}','${id(10)}',100,null),
      ('${id(1)}','${id(109)}','${id(10)}',100,100),
      ('${id(1)}','${id(109)}','${id(11)}',200,null),
      ('${id(1)}','${id(110)}','${id(10)}',100,null),
      ('${id(1)}','${id(110)}','${id(11)}',200,null),
      ('${id(2)}','${id(106)}','${id(12)}',1,null);
    insert into player_fixture_stats(season_id,fixture_id,gameweek_id,player_id,team_id,goals,minutes_played) values
      ('${id(1)}','${id(20)}',100,'${id(103)}','${id(10)}',2,88),
      ('${id(1)}','${id(20)}',100,'${id(108)}','${id(11)}',1,90),
      ('${id(1)}','${id(20)}',100,'${id(109)}','${id(10)}',3,45);
    insert into player_gameweek_stats(season_id,gameweek_id,player_id,goals) values ('${id(1)}',100,'${id(103)}',2);
    insert into star_man_picks(season_id,player_id) values ('${id(1)}','${id(103)}');
    insert into competitions values ('${id(50)}','{"live_league":"preserve"}');
    insert into predictions values ('${id(50)}','{"prediction":"preserve"}');
    insert into match_results values ('${id(50)}','{"score":"preserve"}');
    insert into league_cards values ('${id(50)}','{"card":"preserve"}');
  `);
  return db;
}

test('full SQL executes, repairs only clear evidence, preserves every protected row and is idempotent', { timeout: 120000 }, async () => {
  const executableMigration = migration.replace(/^--.*$/gm, '');
  assert.doesNotMatch(executableMigration, /create\s+temp(?:orary)?\s+table|on\s+commit\s+drop/i,
    'Supabase SQL Editor can commit between top-level statements');
  assert.doesNotMatch(executableMigration, /create\s+schema\s+pp_migration_player_stats/i,
    'migration staging must not depend on a custom schema surviving between statements');
  assert.match(executableMigration.trim(), /^do\s+\$player_stats_migration\$/i,
    'the SQL Editor migration must be one atomic anonymous statement');
  assert.equal((executableMigration.match(/\$player_stats_migration\$;/g) || []).length, 1,
    'the one-statement migration block closes exactly once');
  const db = await fixtureDatabase();
  try {
    const protectedTables = ['competitions', 'predictions', 'match_results', 'league_cards', 'player_fixture_stats', 'player_gameweek_stats', 'star_man_picks', 'fixtures'];
    const protectedBefore = await Promise.all(protectedTables.map((t) => db.query(`select * from ${t} order by id`)));
    const playersBefore = (await db.query('select * from players order by id')).rows;
    const assignmentsBefore = (await db.query('select * from player_team_assignments order by id')).rows;
    await db.exec(migration);
    assert.equal((await db.query("select count(*)::int as rows from information_schema.tables where table_schema = 'public' and table_name like 'pp_migration_player_stats_20260829_%'")).rows[0].rows, 0,
      'persistent staging tables are removed after a successful run');
    const history = (await db.query('select * from player_team_assignments order by id')).rows;
    for (const old of assignmentsBefore) assert.deepEqual(history.find((a) => a.id === old.id), old);
    assert.equal(history.filter((r) => r.player_id === id(100)).length, 1, 'clear unused-identity history is copied to Phil Foden');
    assert.equal(history.filter((r) => r.player_id === id(102)).length, 0, 'referenced old Cherki identity stays a review case');
    const historicEvidence = history.filter((r) => r.player_id === id(108));
    assert.equal(historicEvidence.length, 1);
    assert.equal(historicEvidence[0].starts_gameweek_id, 100);
    assert.equal(historicEvidence[0].ends_gameweek_id, 100);
    assert.equal(history.filter((r) => r.player_id === id(111)).length, 0, 'unknown start date not guessed');
    assert.equal(history.filter((r) => r.player_id === id(104)).length, 0, 'two active identities not guessed');
    const playersAfter = (await db.query('select * from players order by id')).rows;
    for (const old of playersBefore) {
      const expected = old.id === id(107) ? { ...old, team_id: id(10) } : old;
      assert.deepEqual(playersAfter.find((p) => p.id === old.id), expected);
    }
    for (const [i, table] of protectedTables.entries()) assert.deepEqual((await db.query(`select * from ${table} order by id`)).rows, protectedBefore[i].rows, table);
    const aliases = (await db.query('select * from player_name_aliases order by player_id,name')).rows;
    assert.ok(aliases.some((a) => a.player_id === id(100) && a.name === 'Philip Walter Foden'));
    assert.ok(!aliases.some((a) => a.player_id === id(113)), 'different-nationality namesake not conflated');
    const review = (await db.query('select * from audit_player_stats_pool()')).rows;
    assert.ok(review.some((r) => r.issue === 'overlapping_club_assignments'));
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from player_team_assignments order by id')).rows, history);
    assert.deepEqual((await db.query('select * from player_name_aliases order by player_id,name')).rows, aliases);
    const snapshot = await db.query(snapshotSql);
    assert.equal(snapshot.rows[0].player_stats_snapshot.players.length, playersBefore.length);
    await db.exec('set role authenticated;');
    assert.ok((await db.query('select * from player_name_aliases')).rows.length);
    await assert.rejects(db.query("insert into player_name_aliases values ('00000000-0000-4000-8000-000000000100','Unapproved alias','manual')"), /row-level security/);
  } finally { await db.close(); }
});

test('ambiguous active seasons roll back the entire migration', { timeout: 120000 }, async () => {
  const db = await fixtureDatabase();
  try {
    await db.exec('update seasons set is_active = true;');
    await assert.rejects(db.exec(migration), /exactly one active season/);
    await db.exec('rollback;');
    assert.equal((await db.query("select to_regclass('public.player_name_aliases') as name")).rows[0].name, null);
  } finally { await db.close(); }
});
