import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDependency } from './support/dependencies.mjs';

const { PGlite } = testDependency('@electric-sql/pglite');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/game-card-ranking-and-veto-slots-2026-09-01.sql');
const schema = read('../supabase/schema.sql');
const gameCardHtml = read('../game-card.html');
const gameCardJs = read('../assets/js/game-card.js');
const gameCardCss = read('../assets/css/game-card-slick.css');
const returnCss = read('../assets/css/hub-return-button.css');
const powerCards = read('../power-cards.html');
const worker = read('../service-worker.js');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('Game Card rankings put complete two-week entries above a one-week entry', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create table gameweeks(id bigint primary key, season_id uuid not null, number integer not null);
      create table game_card_rounds(
        id uuid primary key, competition_id uuid not null, season_id uuid not null,
        card_id text not null, round_number integer not null,
        start_gameweek_id bigint not null, end_gameweek_id bigint not null
      );
      create table game_card_predictions(
        round_id uuid not null, gameweek_id bigint not null, user_id uuid not null,
        predicted_value integer not null, unique(round_id,gameweek_id,user_id)
      );
      create table game_card_results(round_id uuid not null, gameweek_id bigint not null, actual_value integer);
      create table game_card_actual_results(season_id uuid not null, gameweek_id bigint not null, card_id text not null, actual_value integer);
      create table competition_members(competition_id uuid not null, user_id uuid not null);
      create table game_card_round_tiebreaks(
        round_id uuid not null, user_id uuid not null,
        uc_points_at_tiebreak integer not null default 0,
        random_tiebreak_rank integer not null
      );
    `);

    const viewStart = migration.indexOf('create or replace view public.game_card_week_scores');
    const viewEnd = migration.indexOf('grant select on public.game_card_week_scores');
    await db.exec(migration.slice(viewStart, viewEnd));

    await db.exec(`
      insert into gameweeks values
        (1,'${id(1)}',1),(2,'${id(1)}',2);
      insert into game_card_rounds values
        ('${id(10)}','${id(20)}','${id(1)}','game_goals',1,1,2);
      insert into competition_members values
        ('${id(20)}','${id(31)}'),('${id(20)}','${id(32)}'),('${id(20)}','${id(33)}');
      insert into game_card_results values
        ('${id(10)}',1,3),('${id(10)}',2,3);
      insert into game_card_predictions values
        ('${id(10)}',1,'${id(31)}',4),
        ('${id(10)}',1,'${id(32)}',3),('${id(10)}',2,'${id(32)}',4),
        ('${id(10)}',1,'${id(33)}',2),('${id(10)}',2,'${id(33)}',3);
      insert into game_card_round_tiebreaks values
        ('${id(10)}','${id(31)}',0,1),('${id(10)}','${id(32)}',0,2),('${id(10)}','${id(33)}',0,3);
    `);

    const result = await db.query(`
      select user_id::text, round_rank::int, completed_gameweeks::int,
             missed_gameweeks::int, exact_predictions::int, total_difference::int
      from game_card_round_standings
      order by round_rank
    `);
    const incomplete = result.rows.find((row) => row.user_id === id(31));
    const complete = result.rows.filter((row) => row.user_id !== id(31));
    assert.equal(incomplete.completed_gameweeks, 1);
    assert.equal(incomplete.missed_gameweeks, 1);
    assert.ok(complete.every((row) => row.completed_gameweeks === 2 && row.missed_gameweeks === 0));
    assert.ok(complete.every((row) => row.round_rank < incomplete.round_rank));
    assert.ok(complete.every((row) => row.exact_predictions === 1 && row.total_difference === 1));
  } finally {
    await db.close();
  }
});

test('ranking and Veto migration is safe, explicit and reflected in the schema', () => {
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate)\b/i);
  assert.match(migration, /standings\.missed_gameweeks asc,[^]*standings\.rank_points asc,[^]*standings\.exact_predictions desc,[^]*standings\.total_difference asc/s);
  assert.match(migration, /participants\.member_count \+ 1/);
  assert.match(migration, /ace\.status in \('active', 'vetoed'\)/);
  assert.match(migration, /cd\.effect_key = 'power_veto'[^]*lc\.zone in \('hand', 'active'\)/s);
  assert.match(schema, /standings\.missed_gameweeks asc,[^]*standings\.exact_predictions desc/s);
  assert.match(schema, /ace\.status in \('active', 'vetoed'\)/);
});

test('Power of the Veto leaves the visible hand immediately and vetoed curses occupy slots', () => {
  assert.match(powerCards, /\['power_swap', 'power_veto', 'super_sub'/);
  assert.match(powerCards, /countsForGameweekCap = status === 'active'\s*\|\| status === 'vetoed'/s);
});

test('Game Card page uses the slick layout and publishes transparent ranking rules', () => {
  assert.match(gameCardHtml, /class="pp-page-loading slick-game-card"/);
  assert.match(gameCardHtml, /game-card-slick\.css\?v=20260901-v1/);
  assert.match(gameCardHtml, /game-card\.js\?v=20260901-ranking-v1/);
  assert.match(gameCardJs, /Fewest missed picks/);
  assert.match(gameCardJs, /Lowest weekly-rank total/);
  assert.match(gameCardJs, /Most exact picks/);
  assert.match(gameCardJs, /Random draw only if still tied/);
  assert.match(gameCardCss, /body\.slick-game-card \.game-card-ranking-rules/);
  assert.match(gameCardCss, /body\.slick-game-card \.gameweek-row\.current-gameweek/);
});

test('requested League Hub return buttons share one fixed crisp control', () => {
  const pages = [
    '../live-curses.html', '../correct-scores.html', '../statistics.html',
    '../leaderboard.html', '../medals.html', '../game-card.html',
    '../star-man.html', '../all-star-men.html', '../predictions.html',
    '../all-predictions.html',
  ];
  pages.forEach((page) => assert.match(read(page), /hub-return-button\.css\?v=20260901-v1/));
  assert.match(returnCss, /width: min\(220px, 100%\)/);
  assert.match(returnCss, /border: 1px solid rgba\(255,255,255,\.86\) !important/);
  assert.match(powerCards, /\.back-home-btn \{[^]*border: 1px solid rgba\(255, 255, 255, 0\.86\);/s);
  assert.match(worker, /prem-predics-pwa-v71/);
  assert.match(worker, /hub-return-button\.css\?v=20260901-v1/);
  assert.match(worker, /game-card-slick\.css\?v=20260901-v1/);
});
