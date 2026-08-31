import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';

const { PGlite } = testDependency('@electric-sql/pglite');
const migration = readFileSync(new URL('../supabase/curse-thief-pending-play-and-ldpetrov-repair-2026-08-29.sql', import.meta.url), 'utf8');
const targetCapMigration = readFileSync(new URL('../supabase/curse-thief-target-cap-and-live-history-2026-08-31.sql', import.meta.url), 'utf8');
const powerCards = readFileSync(new URL('../power-cards.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fixtureDatabase() {
  const db = await PGlite.create();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.is_admin() returns boolean language sql stable as $$select false$$;
    create function public.star_man_lock_at_for_gameweek(uuid, bigint) returns timestamptz language sql stable as $$select null::timestamptz$$;

    create table profiles(id uuid primary key, display_name text not null);
    create table seasons(id uuid primary key, is_active boolean);
    create table gameweeks(id bigint primary key, season_id uuid not null, number int not null, unique(id, season_id));
    create table competitions(
      id uuid primary key, season_id uuid not null, name text not null, starts_gameweek_id bigint not null
    );
    create table competition_members(competition_id uuid not null, user_id uuid not null, primary key(competition_id,user_id));
    create table fixtures(
      id uuid primary key, season_id uuid not null, gameweek_id bigint not null,
      kickoff_at timestamptz, status text
    );
    create table card_definitions(
      id text primary key, name text not null, category text not null,
      deck_type text not null, effect_key text not null, description text
    );
    create table league_cards(
      id uuid primary key, competition_id uuid not null, card_id text not null,
      owner_user_id uuid, zone text not null, sort_order int not null default 0,
      updated_at timestamptz not null default now()
    );
    create table active_card_effects(
      id uuid primary key default gen_random_uuid(), competition_id uuid not null,
      card_instance_id uuid, card_id text not null, season_id uuid not null,
      gameweek_id bigint, start_gameweek_id bigint, end_gameweek_id bigint,
      fixture_id uuid, played_by_user_id uuid not null, target_user_id uuid,
      deadline_at timestamptz, payload jsonb not null default '{}'::jsonb,
      status text not null default 'active', played_at timestamptz not null default now(),
      resolved_at timestamptz
    );
    create table card_draw_events(
      id uuid primary key default gen_random_uuid(), competition_id uuid not null,
      user_id uuid not null, source_card_effect_id uuid
    );

    create or replace function public.enforce_card_play_deadline()
    returns trigger language plpgsql security definer set search_path = public as $$
    declare
      first_kickoff timestamptz;
      league_start_gameweek_id bigint;
    begin
      select starts_gameweek_id into league_start_gameweek_id from competitions where id = new.competition_id;
      if exists (
        select 1 from fixtures f where f.season_id = new.season_id
          and f.gameweek_id = league_start_gameweek_id
          and lower(coalesce(f.status, '')) not in ('final','completed','finished','full_time','ft')
      ) then
        raise exception 'Cards can be played after the first gameweek in this private league is completed.';
      end if;
      select min(kickoff_at) filter (where lower(coalesce(status, '')) <> 'postponed')
        into first_kickoff from fixtures
      where season_id = new.season_id and gameweek_id = coalesce(new.start_gameweek_id,new.gameweek_id);
      if now() >= first_kickoff - interval '24 hours' then
        raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
      end if;
      return new;
    end;
    $$;
    create trigger active_card_effects_enforce_card_play_deadline
      before insert on active_card_effects for each row execute function enforce_card_play_deadline();

    insert into profiles values
      ('${id(1)}','ldpetrov'),('${id(2)}','Opponent'),('${id(3)}','Third Player');
    insert into seasons values ('${id(10)}',true);
    insert into gameweeks values (100,'${id(10)}',1),(200,'${id(10)}',2),(300,'${id(10)}',3);
    insert into competitions values ('${id(20)}','${id(10)}','PREM PREDICS 26/27',100);
    insert into competition_members values
      ('${id(20)}','${id(1)}'),('${id(20)}','${id(2)}'),('${id(20)}','${id(3)}');
    insert into fixtures values
      ('${id(30)}','${id(10)}',100,now() - interval '8 days','final'),
      ('${id(31)}','${id(10)}',200,now() + interval '3 days','scheduled'),
      ('${id(32)}','${id(10)}',300,now() + interval '10 days','scheduled');
    insert into card_definitions values
      ('curse_thief','Curse of the Thief','curse','regular','curse_thief','old description'),
      ('power_goal','Power of the Goal','power','regular','power_goal',null),
      ('super_draw','Super Draw','super','premium','super_draw',null),
      ('power_swap','Power of the Swap','power','regular','power_swap',null);
    insert into league_cards(id,competition_id,card_id,owner_user_id,zone,sort_order) values
      ('${id(40)}','${id(20)}','curse_thief','${id(1)}','hand',1),
      ('${id(41)}','${id(20)}','curse_thief','${id(1)}','hand',2),
      ('${id(42)}','${id(20)}','curse_thief','${id(1)}','hand',3),
      ('${id(43)}','${id(20)}','power_goal','${id(2)}','hand',4),
      ('${id(44)}','${id(20)}','power_goal','${id(2)}','hand',5),
      ('${id(45)}','${id(20)}','super_draw','${id(2)}','hand',6);
    insert into active_card_effects(
      id,competition_id,card_instance_id,card_id,season_id,gameweek_id,start_gameweek_id,
      end_gameweek_id,played_by_user_id,target_user_id,deadline_at,status,payload
    ) values (
      '${id(50)}','${id(20)}','${id(40)}','curse_thief','${id(10)}',200,200,200,
      '${id(1)}',null,now() + interval '2 days','active','{"effect_key":"curse_thief","steal_pending":true}'
    );
    select set_config('request.jwt.claim.sub','${id(1)}',false);
  `);
  return db;
}

test('pending Thief repair and lifecycle are atomic, target-safe and deadline-safe', { timeout: 120000 }, async () => {
  const db = await fixtureDatabase();
  try {
    await db.exec(migration);
    await db.exec(targetCapMigration);
    const repaired = (await db.query(`select status, payload from active_card_effects where id='${id(50)}'`)).rows[0];
    assert.equal(repaired.status, 'cancelled');
    assert.equal(repaired.payload.repair_key, 'ldpetrov_thief_pending_20260829');
    assert.equal((await db.query(`select zone from league_cards where id='${id(40)}'`)).rows[0].zone, 'hand');

    const begun = (await db.query(`select begin_curse_thief_play('${id(20)}','${id(41)}',200) as result`)).rows[0].result;
    assert.equal(begun.status, 'active');
    assert.equal(begun.target_user_id, null);
    assert.equal((await db.query('select auth.uid() as id')).rows[0].id, id(1));
    assert.equal((await db.query('select public.is_admin() as value')).rows[0].value, false);
    assert.equal((await db.query("select count(*)::int as count from pg_trigger where tgname='active_card_effects_enforce_curse_target_rules' and not tgisinternal")).rows[0].count, 1);
    assert.notEqual((await db.query("select current_setting('app.curse_thief_completion_effect_id',true) as id")).rows[0].id, begun.id);
    assert.equal((await db.query(`select zone from league_cards where id='${id(41)}'`)).rows[0].zone, 'hand');

    const completed = (await db.query(`select complete_curse_thief_steal('${id(20)}',$1,'${id(43)}') as result`, [begun.id])).rows[0].result;
    assert.equal(completed.expired, false);
    assert.equal(completed.stolen_card_name, 'Power of the Goal');
    assert.deepEqual(
      (await db.query(`select owner_user_id, zone from league_cards where id='${id(43)}'`)).rows[0],
      { owner_user_id: id(1), zone: 'hand' }
    );
    assert.equal((await db.query(`select zone from league_cards where id='${id(41)}'`)).rows[0].zone, 'discard');
    assert.deepEqual(
      (await db.query('select status, target_user_id from active_card_effects where id=$1', [begun.id])).rows[0],
      { status: 'resolved', target_user_id: id(2) }
    );

    const second = (await db.query(`select begin_curse_thief_play('${id(20)}','${id(42)}',200) as result`)).rows[0].result;
    await assert.rejects(
      db.query(`select complete_curse_thief_steal('${id(20)}',$1,'${id(44)}')`, [second.id]),
      /next Curse this Gameweek must target a different player/
    );
    assert.equal((await db.query(`select owner_user_id from league_cards where id='${id(44)}'`)).rows[0].owner_user_id, id(2));
    assert.deepEqual(
      (await db.query('select status, target_user_id from active_card_effects where id=$1', [second.id])).rows[0],
      { status: 'active', target_user_id: null }
    );

    await db.query(`update active_card_effects set deadline_at=now()-interval '1 second' where id=$1`, [second.id]);
    assert.equal((await db.query(`select expire_my_incomplete_curse_thief_plays('${id(20)}') as count`)).rows[0].count, 1);
    assert.equal((await db.query('select status from active_card_effects where id=$1', [second.id])).rows[0].status, 'cancelled');
    assert.equal((await db.query(`select zone from league_cards where id='${id(42)}'`)).rows[0].zone, 'hand');

    // A successful Thief is resolved, but still occupies one of the victim's
    // three Curse slots for the Gameweek. Two more Curses fill the cap; a
    // fourth is rejected. Use a two-player membership here so this assertion
    // isolates the cap from the separate consecutive-target rule.
    await db.exec(`
      delete from competition_members
      where competition_id='${id(20)}' and user_id='${id(3)}';
      select set_config('request.jwt.claim.sub','',false);
      insert into active_card_effects(
        id,competition_id,card_id,season_id,gameweek_id,start_gameweek_id,end_gameweek_id,
        played_by_user_id,target_user_id,status,payload
      ) values
        ('${id(60)}','${id(20)}','curse_thief','${id(10)}',200,200,200,'${id(90)}','${id(2)}','active','{"effect_key":"curse_thief"}'),
        ('${id(61)}','${id(20)}','curse_thief','${id(10)}',200,200,200,'${id(91)}','${id(2)}','active','{"effect_key":"curse_thief"}');
    `);
    assert.equal((await db.query(`
      select count(*)::int as count
      from active_card_effects ace
      where ace.target_user_id='${id(2)}'
        and (ace.status='active' or (ace.status='resolved' and ace.card_id='curse_thief'))
    `)).rows[0].count, 3);
    await assert.rejects(
      db.exec(`
        insert into active_card_effects(
          id,competition_id,card_id,season_id,gameweek_id,start_gameweek_id,end_gameweek_id,
          played_by_user_id,target_user_id,status,payload
        ) values (
          '${id(62)}','${id(20)}','curse_thief','${id(10)}',200,200,200,
          '${id(92)}','${id(2)}','active','{"effect_key":"curse_thief"}'
        );
      `),
      /maximum of 3 Curse Cards for this Gameweek/
    );

    await db.exec(migration);
    await db.exec(targetCapMigration);
    assert.equal((await db.query(`select count(*)::int as count from active_card_effects where payload->>'repair_key'='ldpetrov_thief_pending_20260829'`)).rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test('Power Cards UI uses the pending Thief RPCs and forces a fresh PWA cache', () => {
  assert.match(powerCards, /begin_curse_thief_play/);
  assert.match(powerCards, /complete_curse_thief_steal/);
  assert.match(powerCards, /expire_my_incomplete_curse_thief_plays/);
  assert.doesNotMatch(powerCards, /rpc\('steal_regular_card_from_opponent'/);
  assert.match(powerCards, /opponentCardIsStealable/);
  assert.match(powerCards, /revealOpponentCard/);
  assert.match(powerCards, /classList\.toggle\('is-empty', handIsEmpty\)/);
  assert.match(powerCards, /\.hand\.is-empty \{[^}]*height: 114px/s);
  assert.match(powerCards, /height: clamp\(66px, 20\.5vw, 80px\)/);
  assert.match(serviceWorker, /prem-predics-pwa-v60/);
});
