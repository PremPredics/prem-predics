-- Run this in Supabase SQL Editor.
--
-- What this fixes:
-- 1. Fills missing match scores before GW37 with random results.
-- 2. Marks all non-postponed fixtures before GW37 as final.
-- 3. Sets every GW37 fixture to 15 May 2026 at 15:00 UK time.
-- 4. Sets every GW38 fixture to 24 May 2026 at 16:00 UK time.
-- 5. Refreshes leagues that start in GW37/GW38 so they do not remain locked
--    from the previous wrong kickoff dates.
--
-- The fixtures_set_deadlines trigger refreshes prediction_locks_at
-- and second_half_deadline_at whenever kickoff_at changes.

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
previous_missing_results as (
  select f.id as fixture_id
  from public.fixtures f
  join public.gameweeks gw
    on gw.id = f.gameweek_id
    and gw.season_id = f.season_id
  join target_season s on s.id = f.season_id
  left join public.match_results mr on mr.fixture_id = f.id
  where gw.number < 37
    and f.status <> 'postponed'
    and mr.fixture_id is null
),
random_results as (
  select
    fixture_id,
    floor(random() * 5)::integer as home_goals,
    floor(random() * 5)::integer as away_goals
  from previous_missing_results
)
insert into public.match_results (fixture_id, home_goals, away_goals)
select fixture_id, home_goals, away_goals
from random_results
on conflict (fixture_id) do nothing;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
update public.fixtures f
set status = 'final'
from public.gameweeks gw, target_season s
where gw.id = f.gameweek_id
  and gw.season_id = f.season_id
  and s.id = f.season_id
  and gw.number < 37
  and f.status <> 'postponed';

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
    case
      when gw.number = 37 then make_timestamptz(2026, 5, 15, 15, 0, 0, 'Europe/London')
      when gw.number = 38 then make_timestamptz(2026, 5, 24, 16, 0, 0, 'Europe/London')
    end as new_kickoff_at
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
  where gw.number in (37, 38)
)
update public.fixtures f
set kickoff_at = tg.new_kickoff_at
from target_gameweeks tg
where f.gameweek_id = tg.id
  and f.season_id = tg.season_id
  and tg.new_kickoff_at is not null;

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
    case
      when gw.number = 37 then make_timestamptz(2026, 5, 15, 15, 0, 0, 'Europe/London')
      when gw.number = 38 then make_timestamptz(2026, 5, 24, 16, 0, 0, 'Europe/London')
    end as new_kickoff_at
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
  where gw.number in (37, 38)
)
update public.fixtures f
set status = 'scheduled'
from target_gameweeks tg
where f.gameweek_id = tg.id
  and f.season_id = tg.season_id
  and f.status <> 'postponed';

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
    case
      when gw.number = 37 then make_timestamptz(2026, 5, 15, 15, 0, 0, 'Europe/London')
      when gw.number = 38 then make_timestamptz(2026, 5, 24, 16, 0, 0, 'Europe/London')
    end as new_kickoff_at
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
  where gw.number in (37, 38)
)
update public.competitions c
set
  starts_at = tg.new_kickoff_at - interval '24 hours',
  member_lock_at = tg.new_kickoff_at,
  started_at = null,
  accepts_new_members = true,
  locked_member_count = null,
  locked_deck_variant_id = null
from target_gameweeks tg
where c.starts_gameweek_id = tg.id
  and c.season_id = tg.season_id;

select
  gw.number as gameweek,
  count(f.id) as fixture_count,
  min(f.kickoff_at) as first_kickoff_at,
  max(f.kickoff_at) as last_kickoff_at,
  min(f.prediction_locks_at) as first_prediction_lock_at,
  max(f.second_half_deadline_at) as last_second_half_deadline_at
from public.fixtures f
join public.gameweeks gw on gw.id = f.gameweek_id and gw.season_id = f.season_id
where gw.number in (37, 38)
group by gw.number
order by gw.number;
