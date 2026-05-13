-- Moves Vas Test League to start in GW37.
-- Safe to run after supabase/create-test-league.sql.

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
target_gameweek as (
  select gw.id, gw.season_id
  from public.gameweeks gw
  join target_season s on s.id = gw.season_id
  where gw.number = 37
  limit 1
),
first_fixture as (
  select min(f.kickoff_at) as first_kickoff_at
  from public.fixtures f
  join target_gameweek gw on gw.id = f.gameweek_id
)
update public.competitions c
set
  starts_gameweek_id = target_gameweek.id,
  starts_at = first_fixture.first_kickoff_at - interval '24 hours',
  member_lock_at = first_fixture.first_kickoff_at - interval '90 minutes'
from target_gameweek
cross join first_fixture
where c.slug = 'vas-test-league';

select
  c.name,
  c.slug,
  c.join_code,
  gw.number as starts_gameweek,
  c.starts_at,
  c.member_lock_at,
  count(cm.user_id) as members
from public.competitions c
join public.gameweeks gw on gw.id = c.starts_gameweek_id
left join public.competition_members cm on cm.competition_id = c.id
where c.slug = 'vas-test-league'
group by
  c.name,
  c.slug,
  c.join_code,
  gw.number,
  c.starts_at,
  c.member_lock_at;
