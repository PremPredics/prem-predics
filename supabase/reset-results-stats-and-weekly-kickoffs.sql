-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- - Keep every fixture in its existing gameweek.
-- - Clear entered player stat data.
-- - Clear actual match/fixture/game-card result data.
-- - Set every fixture in GW1 to 27 May 2026 15:00 Europe/London.
-- - Set every later gameweek to the same 15:00 Europe/London kick-off,
--   exactly one week after the previous gameweek.
--
-- Notes:
-- - The fixtures_set_deadlines trigger refreshes prediction_locks_at
--   and second_half_deadline_at whenever kickoff_at changes.
-- - This does not delete user predictions, star man picks, league members,
--   cards, or fixture rows.
-- - Match results are stored as not-null rows, so "blank" means deleting the
--   result rows rather than setting home_goals/away_goals to null.

begin;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.player_fixture_stats stats
  using target_season s
  where stats.season_id = s.id
  returning 1
)
select 'deleted player_fixture_stats' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.player_gameweek_stats stats
  using target_season s
  where stats.season_id = s.id
  returning 1
)
select 'deleted player_gameweek_stats' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.match_results results
  using public.fixtures fixtures, target_season s
  where results.fixture_id = fixtures.id
    and fixtures.season_id = s.id
  returning 1
)
select 'deleted match_results' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.fixture_game_stats stats
  using public.fixtures fixtures, target_season s
  where stats.fixture_id = fixtures.id
    and fixtures.season_id = s.id
  returning 1
)
select 'deleted fixture_game_stats' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.game_card_actual_results results
  using target_season s
  where results.season_id = s.id
  returning 1
)
select 'deleted game_card_actual_results' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
deleted_rows as (
  delete from public.game_card_results results
  using public.game_card_rounds rounds, target_season s
  where results.round_id = rounds.id
    and rounds.season_id = s.id
  returning 1
)
select 'deleted game_card_results' as action, count(*) as rows_affected
from deleted_rows;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
target_gameweeks as (
  select
    gw.id,
    gw.season_id,
    gw.number,
    make_timestamptz(2026, 5, 27, 15, 0, 0, 'Europe/London')
      + ((gw.number - 1) * interval '7 days') as new_kickoff_at
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
)
update public.fixtures fixtures
set
  kickoff_at = target_gameweeks.new_kickoff_at,
  status = 'scheduled'
from target_gameweeks
where fixtures.gameweek_id = target_gameweeks.id
  and fixtures.season_id = target_gameweeks.season_id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
target_gameweeks as (
  select
    gw.id,
    gw.season_id,
    gw.number,
    make_timestamptz(2026, 5, 27, 15, 0, 0, 'Europe/London')
      + ((gw.number - 1) * interval '7 days') as new_kickoff_at
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
)
update public.gameweeks gw
set star_man_locks_at = target_gameweeks.new_kickoff_at - interval '90 minutes'
from target_gameweeks
where gw.id = target_gameweeks.id
  and gw.season_id = target_gameweeks.season_id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
competition_start_gameweeks as (
  select
    competitions.id as competition_id,
    competitions.season_id,
    min(fixtures.kickoff_at) as first_kickoff_at
  from public.competitions
  join target_season s on s.id = competitions.season_id
  join public.fixtures
    on fixtures.season_id = competitions.season_id
   and fixtures.gameweek_id = competitions.starts_gameweek_id
  group by competitions.id, competitions.season_id
)
update public.competitions competitions
set
  starts_at = competition_start_gameweeks.first_kickoff_at - interval '24 hours',
  member_lock_at = competition_start_gameweeks.first_kickoff_at - interval '90 minutes'
from competition_start_gameweeks
where competitions.id = competition_start_gameweeks.competition_id
  and competitions.season_id = competition_start_gameweeks.season_id;

commit;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
select
  gw.number as gameweek,
  count(fixtures.id) as fixture_count,
  min(fixtures.kickoff_at) as first_kickoff_at,
  max(fixtures.kickoff_at) as last_kickoff_at,
  min(fixtures.prediction_locks_at) as first_prediction_lock_at,
  max(fixtures.second_half_deadline_at) as last_second_half_deadline_at,
  gw.star_man_locks_at
from public.gameweeks gw
join target_season s on s.id = gw.season_id
left join public.fixtures
  on fixtures.gameweek_id = gw.id
 and fixtures.season_id = gw.season_id
group by gw.number, gw.star_man_locks_at
order by gw.number;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
select 'remaining match_results' as check_name, count(*) as rows_remaining
from public.match_results results
join public.fixtures fixtures on fixtures.id = results.fixture_id
join target_season s on s.id = fixtures.season_id
union all
select 'remaining fixture_game_stats', count(*)
from public.fixture_game_stats stats
join public.fixtures fixtures on fixtures.id = stats.fixture_id
join target_season s on s.id = fixtures.season_id
union all
select 'remaining player_fixture_stats', count(*)
from public.player_fixture_stats stats
join target_season s on s.id = stats.season_id
union all
select 'remaining player_gameweek_stats', count(*)
from public.player_gameweek_stats stats
join target_season s on s.id = stats.season_id
union all
select 'remaining game_card_actual_results', count(*)
from public.game_card_actual_results results
join target_season s on s.id = results.season_id
union all
select 'remaining game_card_results', count(*)
from public.game_card_results results
join public.game_card_rounds rounds on rounds.id = results.round_id
join target_season s on s.id = rounds.season_id;
