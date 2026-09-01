import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';

const { PGlite } = testDependency('@electric-sql/pglite');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/game-card-unique-ranking-and-tie-safe-awards-2026-09-01.sql');
const gameCardJs = read('../assets/js/game-card.js');
const gameCardCss = read('../assets/css/game-card-slick.css');
const powerCards = read('../power-cards.html');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function createDatabase() {
  const db = await PGlite.create();
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
    create table gameweeks(id bigint primary key, season_id uuid not null, number integer not null);
    create table card_definitions(id text primary key, category text not null, effect_key text);
    create table game_card_rounds(
      id uuid primary key, competition_id uuid not null, season_id uuid not null,
      card_id text not null, round_number integer not null,
      start_gameweek_id bigint not null, end_gameweek_id bigint not null
    );
    create table game_card_predictions(
      round_id uuid not null, gameweek_id bigint not null, user_id uuid not null,
      predicted_value numeric not null
    );
    create table game_card_results(round_id uuid not null, gameweek_id bigint not null, actual_value numeric);
    create table game_card_actual_results(season_id uuid not null, gameweek_id bigint not null, card_id text not null, actual_value numeric);
    create table game_card_round_tiebreaks(
      round_id uuid not null, user_id uuid not null,
      uc_points_at_tiebreak integer not null default 0,
      random_tiebreak_rank integer not null,
      created_at timestamptz not null default now(),
      primary key(round_id,user_id), unique(round_id,random_tiebreak_rank)
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
    create table active_card_effects(
      id uuid primary key, competition_id uuid, season_id uuid, played_by_user_id uuid,
      card_id text, gameweek_id bigint, start_gameweek_id bigint, end_gameweek_id bigint,
      status text
    );
    create function is_competition_member(target uuid) returns boolean language sql stable as
      $$ select exists(select 1 from competition_members where competition_id=target and user_id=auth.uid()) $$;

    create view game_card_week_scores as
    with scored as (
      select
        gcr.id as round_id, gcr.competition_id, gcr.season_id, gcr.card_id,
        gcr.round_number, gcp.gameweek_id, gw.number as gameweek_number,
        gcp.user_id, gcp.predicted_value,
        coalesce(gcrs.actual_value,gcar.actual_value) as actual_value,
        abs(gcp.predicted_value-coalesce(gcrs.actual_value,gcar.actual_value)) as difference
      from game_card_predictions gcp
      join game_card_rounds gcr on gcr.id=gcp.round_id
      join gameweeks gw on gw.id=gcp.gameweek_id
      left join game_card_results gcrs on gcrs.round_id=gcp.round_id and gcrs.gameweek_id=gcp.gameweek_id
      left join game_card_actual_results gcar on gcar.season_id=gcr.season_id and gcar.gameweek_id=gcp.gameweek_id and gcar.card_id=gcr.card_id
      where coalesce(gcrs.actual_value,gcar.actual_value) is not null
    ), ranked as (
      select scored.*, rank() over(partition by round_id,gameweek_id order by difference) as weekly_rank
      from scored
    )
    select ranked.*, weekly_rank=1 as is_weekly_winner from ranked;

    create view game_card_round_standings as select
      null::uuid as round_id, null::uuid as competition_id, null::uuid as season_id,
      null::text as card_id, null::integer as round_number, null::uuid as user_id,
      null::bigint as completed_gameweeks, null::bigint as weekly_wins,
      null::numeric as total_difference, null::integer as uc_points_at_tiebreak,
      null::integer as random_tiebreak_rank, null::bigint as round_rank,
      null::boolean as earns_super_medal, null::bigint as expected_gameweeks,
      null::bigint as missed_gameweeks, null::bigint as exact_predictions,
      null::numeric as rank_points
    where false;
  `);
  return db;
}

test('migration is idempotent, final ranks are unique and a two-way best tie splits only two medals', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration);
    await db.exec(migration);

    const competition = id(1);
    const season = id(2);
    const round = id(3);
    const users = [id(11), id(12), id(13), id(14)];
    await db.exec(`
      insert into competitions values ('${competition}','${season}','Four Player League',4);
      insert into card_definitions values ('game_goals','game','game_goals'),('super_pen','super','super_pen');
      ${users.map((user, index) => `insert into profiles values ('${user}','Player ${index + 1}'); insert into competition_members values ('${competition}','${user}'); insert into leaderboard values ('${competition}','${user}',0,0);`).join('\n')}
      ${[1, 2, 3, 4, 5].map((gw) => `insert into gameweeks values (${gw},'${season}',${gw}); insert into game_card_actual_results values ('${season}',${gw},'game_goals',3);`).join('\n')}
      insert into game_card_rounds values ('${round}','${competition}','${season}','game_goals',1,1,5);
      ${[1, 2, 3, 4, 5].map((gw) => `insert into game_card_predictions values ('${round}',${gw},'${users[0]}',3),('${round}',${gw},'${users[1]}',3),('${round}',${gw},'${users[2]}',4);`).join('\n')}
      select set_config('request.jwt.claim.sub','${users[0]}',false);
      select ensure_game_card_tiebreaks('${competition}');
      select reconcile_game_card_super_medals('${competition}',null);
    `);

    const ranks = await db.query(`select user_id::text, round_rank::int, performance_rank::int, performance_tie_size::int from game_card_round_standings where round_id='${round}' order by round_rank`);
    assert.deepEqual(ranks.rows.map((row) => row.round_rank), [1, 2, 3, 4]);
    assert.deepEqual(ranks.rows.slice(0, 2).map((row) => row.performance_rank), [1, 1]);
    assert.deepEqual(ranks.rows.slice(0, 2).map((row) => row.performance_tie_size), [2, 2]);

    const entitlements = await db.query(`select user_id::text, medal_count from game_card_super_medal_entitlements('${competition}',null) where medal_count > 0 order by user_id`);
    assert.deepEqual(entitlements.rows.map((row) => row.medal_count), [1, 1]);
    assert.equal(entitlements.rows.reduce((total, row) => total + row.medal_count, 0), 2);

    await db.exec(`
      insert into card_draw_tokens(competition_id,season_id,user_id,token_type,deck_type,source_type,source_game_card_round_id,source_key)
      values
        ('${competition}','${season}','${users[0]}','super_medal','premium','game_card','${round}','legacy-extra-a'),
        ('${competition}','${season}','${users[1]}','super_medal','premium','game_card','${round}','legacy-extra-b');
      select reconcile_game_card_super_medals('${competition}',null);
    `);
    const tokens = await db.query(`select status,count(*)::int as count from card_draw_tokens where competition_id='${competition}' group by status order by status`);
    assert.deepEqual(tokens.rows, [{ status: 'available', count: 2 }, { status: 'void', count: 2 }]);
  } finally {
    await db.close();
  }
});

test('UI uses compact non-overlapping SM badges and the deck viewer omits the Game deck', () => {
  assert.match(gameCardJs, /gameCardSuperMedalAwardCounts/);
  assert.match(gameCardJs, /Fewest missed picks[^]*Most exact picks[^]*Lowest total distance[^]*Most weekly wins[^]*Lowest weekly-rank total[^]*Stored draw if still level/s);
  assert.match(gameCardCss, /\.super-medal-award \{[^}]*width: 31px;[^}]*max-width: 100%;/s);
  assert.match(gameCardCss, /grid-template-columns: minmax\(78px,1fr\) 40px/);
  const deckDisplay = powerCards.match(/function updateDecksDisplay\(\) \{([^]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(deckDisplay, /gameState\.gameCardDeck|deck-card-visual game|deck-label">Game/);
  assert.match(deckDisplay, /gameState\.regularDeck/);
  assert.match(deckDisplay, /gameState\.premiumDeck/);
  assert.match(powerCards, /deck-overview-title">Card Decks</);
  assert.match(powerCards, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
