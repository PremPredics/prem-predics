-- Creates a private test league for the global admin account.
-- Run after season, fixtures, players, and team assignments are imported.
--
-- This uses GW37 because it is the next gameweek to start in the current setup.

with target_owner as (
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower('goulasvasilios@gmail.com')
  limit 1
),
target_season as (
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
),
created_league as (
  insert into public.competitions (
    season_id,
    owner_id,
    name,
    slug,
    max_members,
    deck_variant_id,
    starts_gameweek_id,
    starts_at,
    member_lock_at
  )
  select
    target_season.id,
    target_owner.id,
    'Vas Test League',
    'vas-test-league',
    3,
    'players_2_3',
    target_gameweek.id,
    first_fixture.first_kickoff_at - interval '24 hours',
    first_fixture.first_kickoff_at - interval '24 hours'
  from target_owner
  cross join target_season
  cross join target_gameweek
  cross join first_fixture
  where not exists (
    select 1
    from public.competitions existing
    where existing.slug = 'vas-test-league'
  )
  returning id
)
select
  c.name,
  c.slug,
  c.join_code,
  gw.number as starts_gameweek,
  c.max_members,
  c.deck_variant_id,
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
  c.max_members,
  c.deck_variant_id,
  c.starts_at,
  c.member_lock_at;
