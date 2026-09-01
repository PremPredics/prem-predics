import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';
import {
  gameCardSuperMedalAwardCount,
  gameCardSuperMedalAwardCounts,
  gameCardSuperMedalAwardSummary,
} from '../assets/js/game-card-awards.js';

const { PGlite } = testDependency('@electric-sql/pglite');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/game-card-super-medal-places-2026-09-01.sql');
const leagueHtml = read('../league.html');
const leagueJs = read('../assets/js/league.js');
const gameCardJs = read('../assets/js/game-card.js');
const gameCardCss = read('../assets/css/game-card-slick.css');
const starManJs = read('../assets/js/star-man.js');
const worker = read('../service-worker.js');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('award matrix matches every supported league-size tier', () => {
  assert.deepEqual([2, 3].map((size) => gameCardSuperMedalAwardCount(size, 1)), [1, 1]);
  assert.deepEqual([4, 5, 6].map((size) => gameCardSuperMedalAwardCount(size, 1)), [2, 2, 2]);
  assert.deepEqual([7, 8, 9, 10].map((size) => [
    gameCardSuperMedalAwardCount(size, 1),
    gameCardSuperMedalAwardCount(size, 2),
    gameCardSuperMedalAwardCount(size, 3),
  ]), [[2, 1, 0], [2, 1, 0], [2, 1, 0], [2, 1, 0]]);
  assert.equal(gameCardSuperMedalAwardSummary(6), '1st: 2 Super Medals · exact two-way tie: 1 each');
  assert.equal(gameCardSuperMedalAwardSummary(10), '1st: 2 Super Medals · 2nd: 1 Super Medal');
});

test('four-to-six player exact two-way best-performance tie splits the two-medal pool', () => {
  const base = {
    missed_gameweeks: 0,
    exact_predictions: 2,
    total_difference: 3,
    weekly_wins: 2,
    rank_points: 8,
  };
  const awards = gameCardSuperMedalAwardCounts(6, [
    { ...base, user_id: 'a', round_rank: 1 },
    { ...base, user_id: 'b', round_rank: 2 },
    { ...base, user_id: 'c', round_rank: 3, total_difference: 4 },
  ]);

  assert.deepEqual(awards, { a: 1, b: 1 });
  assert.equal(Object.values(awards).reduce((total, count) => total + count, 0), 2);
});

test('three-way performance tie still uses the unique final order without multiplying medals', () => {
  const base = {
    missed_gameweeks: 0,
    exact_predictions: 1,
    total_difference: 4,
    weekly_wins: 1,
    rank_points: 9,
  };
  const awards = gameCardSuperMedalAwardCounts(6, [
    { ...base, user_id: 'a', round_rank: 1 },
    { ...base, user_id: 'b', round_rank: 2 },
    { ...base, user_id: 'c', round_rank: 3 },
  ]);

  assert.deepEqual(awards, { a: 2 });
  assert.equal(Object.values(awards).reduce((total, count) => total + count, 0), 2);
});

test('migration compiles twice, awards the correct tokens and avoids held Super Card types', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table competitions(id uuid primary key, season_id uuid not null, name text not null, locked_member_count integer);
      create table competition_members(competition_id uuid not null, user_id uuid not null);
      create table profiles(id uuid primary key, display_name text not null);
      create table leaderboard(
        competition_id uuid not null, user_id uuid not null,
        ultimate_champion_points integer not null default 0,
        star_man_goals integer not null default 0
      );
      create table game_card_rounds(id uuid primary key, competition_id uuid not null, season_id uuid not null, round_number integer not null);
      create table game_card_round_standings(
        round_id uuid not null, user_id uuid not null,
        round_rank bigint not null, completed_gameweeks bigint not null
      );
      create table card_definitions(
        id text primary key, name text not null, category text not null,
        description text not null, effect_key text
      );
      create table card_draw_tokens(
        id uuid primary key default gen_random_uuid(), competition_id uuid not null,
        season_id uuid not null, user_id uuid not null, token_type text not null,
        deck_type text not null, source_type text not null,
        source_game_card_round_id uuid, source_card_effect_id uuid, source_key text,
        status text not null default 'available', created_at timestamptz not null default now(),
        redeemed_at timestamptz
      );
      create unique index card_draw_tokens_unique_source_key
        on card_draw_tokens(competition_id,user_id,token_type,source_key)
        where source_key is not null;
      create table gameweeks(id bigint primary key, season_id uuid not null, number integer not null);
      create table active_card_effects(
        id uuid primary key, competition_id uuid, season_id uuid, played_by_user_id uuid,
        card_id text, gameweek_id bigint, start_gameweek_id bigint, end_gameweek_id bigint,
        status text
      );
      create table game_card_actual_results(season_id uuid, gameweek_id bigint, card_id text, actual_value numeric);
      create table league_cards(
        id uuid primary key default gen_random_uuid(), competition_id uuid not null,
        card_id text not null, owner_user_id uuid, zone text not null,
        updated_at timestamptz not null default now()
      );
      create table card_draw_events(
        id uuid primary key default gen_random_uuid(), competition_id uuid, season_id uuid,
        user_id uuid, token_id uuid, card_instance_id uuid, card_id text,
        deck_type text, drawn_at timestamptz default now()
      );
      create function is_competition_member(target uuid) returns boolean language sql stable as
        $$ select exists(select 1 from competition_members where competition_id=target and user_id=auth.uid()) $$;
      create function ensure_game_card_tiebreaks(target uuid) returns void language sql as $$ select $$;
      create function league_card_draws_unlocked(target uuid) returns boolean language sql stable as $$ select true $$;
      create function ensure_league_card_decks(target uuid) returns void language sql as $$ select $$;
    `);

    await db.exec(migration);
    await db.exec(migration);

    const cases = [
      { key: 10, members: 2, rank: 1, expected: 1 },
      { key: 20, members: 4, rank: 1, expected: 2 },
      { key: 30, members: 7, rank: 1, expected: 2 },
      { key: 40, members: 7, rank: 2, expected: 1 },
    ];

    for (const item of cases) {
      const competitionId = id(item.key);
      const seasonId = id(item.key + 1);
      const userId = id(item.key + 2);
      const roundId = id(item.key + 3);
      await db.exec(`
        insert into competitions values ('${competitionId}','${seasonId}','League ${item.key}',${item.members});
        insert into profiles values ('${userId}','Player ${item.key}');
        insert into leaderboard values ('${competitionId}','${userId}',0,0);
        insert into game_card_rounds values ('${roundId}','${competitionId}','${seasonId}',1);
        insert into game_card_round_standings values ('${roundId}','${userId}',${item.rank},5);
        insert into competition_members values ('${competitionId}','${userId}');
        select set_config('request.jwt.claim.sub','${userId}',false);
        select * from sync_my_card_draw_tokens('${competitionId}');
        select * from sync_my_card_draw_tokens('${competitionId}');
      `);
      const count = await db.query(`select count(*)::int as count from card_draw_tokens where competition_id='${competitionId}' and user_id='${userId}' and token_type='super_medal'`);
      assert.equal(count.rows[0].count, item.expected);
    }

    const drawCase = cases[0];
    const competitionId = id(drawCase.key);
    const userId = id(drawCase.key + 2);
    await db.exec(`
      insert into card_definitions values
        ('super_alpha','Super Alpha','super','Alpha effect','super_alpha'),
        ('super_beta','Super Beta','super','Beta effect','super_beta');
      insert into league_cards(competition_id,card_id,owner_user_id,zone) values
        ('${competitionId}','super_alpha','${userId}','hand'),
        ('${competitionId}','super_alpha',null,'premium_deck'),
        ('${competitionId}','super_beta',null,'premium_deck');
      select set_config('request.jwt.claim.sub','${userId}',false);
    `);
    const draw = await db.query(`select card_id, super_medals from redeem_super_card_draw_token('${competitionId}')`);
    assert.equal(draw.rows.length, 1);
    assert.equal(draw.rows[0].card_id, 'super_beta');
    assert.equal(draw.rows[0].super_medals, 0);
  } finally {
    await db.close();
  }
});

test('compact UI exposes award places, one-line medal label and revised card copy', () => {
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate)\b/i);
  assert.match(migration, /when gcs\.round_rank = 2 and target_member_count >= 7 then 1/);
  assert.match(migration, /generate_series\(1, eligible\.medal_count\)/);
  assert.match(migration, /held\.zone = 'hand'[^]*held\.card_id = available\.card_id/s);
  assert.match(leagueHtml, /\.medal-progress-top span \{[^}]*white-space: nowrap;/s);
  assert.match(leagueJs, /View All Live Curses for GW\$\{gameweekNumber\}/);
  assert.match(gameCardJs, /gameCardSuperMedalAwardCounts/);
  assert.match(gameCardJs, /<span>Rank<\/span>/);
  assert.match(gameCardCss, /\.history-result-row\.super-medal-place/);
  assert.match(starManJs, /playerVisualMarkup\(player, \{ showCountry: mode !== 'search' \}\)/);
  assert.match(worker, /prem-predics-pwa-v74/);
  assert.match(worker, /game-card-awards\.js\?v=20260901-v2/);
});
