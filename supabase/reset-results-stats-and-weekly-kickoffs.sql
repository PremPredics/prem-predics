-- Run this whole file in Supabase SQL Editor.
--
-- Purpose:
-- - Keep every fixture in its existing gameweek.
-- - Clear global-admin manual entry data for actual scores, fixture stats,
--   player stats, and game-card actual/result entries.
-- - Reset Game Card rounds back to scheduled, clearing completed-round
--   tiebreak snapshots.
-- - Set every fixture to 17 June 2026 Europe/London.
-- - Set each gameweek 1 minute later than the previous one:
--   GW1 = 15:00, GW2 = 15:01, GW3 = 15:02, etc.
--
-- This does not delete user predictions, Star Man picks, league members,
-- cards, or fixture rows.

do $$
declare
  target_season_id uuid;
begin
  select id
    into target_season_id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1;

  if target_season_id is null then
    raise exception 'Premier League 2025-26 season was not found.';
  end if;

  delete from public.player_fixture_stats stats
  where stats.season_id = target_season_id;

  delete from public.player_gameweek_stats stats
  where stats.season_id = target_season_id;

  delete from public.match_results results
  using public.fixtures fixtures
  where results.fixture_id = fixtures.id
    and fixtures.season_id = target_season_id;

  delete from public.fixture_game_stats stats
  using public.fixtures fixtures
  where stats.fixture_id = fixtures.id
    and fixtures.season_id = target_season_id;

  delete from public.game_card_actual_results results
  where results.season_id = target_season_id;

  delete from public.game_card_results results
  using public.game_card_rounds rounds
  where results.round_id = rounds.id
    and rounds.season_id = target_season_id;

  delete from public.game_card_round_tiebreaks tiebreaks
  using public.game_card_rounds rounds
  where tiebreaks.round_id = rounds.id
    and rounds.season_id = target_season_id;

  update public.game_card_rounds rounds
  set
    status = 'scheduled',
    finalized_at = null
  where rounds.season_id = target_season_id;

  update public.fixtures fixtures
  set
    kickoff_at = make_timestamptz(
      extract(year from date '2026-06-17')::integer,
      extract(month from date '2026-06-17')::integer,
      extract(day from date '2026-06-17')::integer,
      15,
      (gameweeks.number - 1)::integer,
      0,
      'Europe/London'
    ),
    status = 'scheduled'
  from public.gameweeks gameweeks
  where fixtures.gameweek_id = gameweeks.id
    and fixtures.season_id = gameweeks.season_id
    and fixtures.season_id = target_season_id;

  update public.gameweeks gameweeks
  set star_man_locks_at = make_timestamptz(
      extract(year from date '2026-06-17')::integer,
      extract(month from date '2026-06-17')::integer,
      extract(day from date '2026-06-17')::integer,
      15,
      (gameweeks.number - 1)::integer,
      0,
      'Europe/London'
    ) - interval '90 minutes'
  where gameweeks.season_id = target_season_id;

  update public.competitions competitions
  set
    starts_at = competition_start_gameweeks.first_kickoff_at - interval '24 hours',
    member_lock_at = competition_start_gameweeks.first_kickoff_at - interval '90 minutes'
  from (
    select
      competitions.id as competition_id,
      min(fixtures.kickoff_at) as first_kickoff_at
    from public.competitions competitions
    join public.fixtures fixtures
      on fixtures.season_id = competitions.season_id
     and fixtures.gameweek_id = competitions.starts_gameweek_id
    where competitions.season_id = target_season_id
    group by competitions.id
  ) competition_start_gameweeks
  where competitions.id = competition_start_gameweeks.competition_id
    and competitions.season_id = target_season_id;
end $$;

-- Verification 1: every manual/admin result table below should show 0.
with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
select 'match_results' as table_name, count(*) as rows_remaining
from public.match_results results
join public.fixtures fixtures on fixtures.id = results.fixture_id
join target_season s on s.id = fixtures.season_id
union all
select 'fixture_game_stats', count(*)
from public.fixture_game_stats stats
join public.fixtures fixtures on fixtures.id = stats.fixture_id
join target_season s on s.id = fixtures.season_id
union all
select 'player_fixture_stats', count(*)
from public.player_fixture_stats stats
join target_season s on s.id = stats.season_id
union all
select 'player_gameweek_stats', count(*)
from public.player_gameweek_stats stats
join target_season s on s.id = stats.season_id
union all
select 'game_card_actual_results', count(*)
from public.game_card_actual_results results
join target_season s on s.id = results.season_id
union all
select 'game_card_results', count(*)
from public.game_card_results results
join public.game_card_rounds rounds on rounds.id = results.round_id
join target_season s on s.id = rounds.season_id
union all
select 'game_card_round_tiebreaks', count(*)
from public.game_card_round_tiebreaks tiebreaks
join public.game_card_rounds rounds on rounds.id = tiebreaks.round_id
join target_season s on s.id = rounds.season_id;

-- Verification 2: first few gameweeks should all show 17 June 2026 at 15:00, 15:01, 15:02, etc.
with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
select
  gameweeks.number as gameweek,
  count(fixtures.id) as fixture_count,
  min(fixtures.kickoff_at at time zone 'Europe/London') as first_kickoff_london,
  max(fixtures.kickoff_at at time zone 'Europe/London') as last_kickoff_london,
  min(fixtures.prediction_locks_at at time zone 'Europe/London') as first_prediction_lock_london,
  gameweeks.star_man_locks_at at time zone 'Europe/London' as star_man_lock_london
from public.gameweeks gameweeks
join target_season s on s.id = gameweeks.season_id
left join public.fixtures fixtures
  on fixtures.gameweek_id = gameweeks.id
 and fixtures.season_id = gameweeks.season_id
group by gameweeks.number, gameweeks.star_man_locks_at
order by gameweeks.number
limit 8;
