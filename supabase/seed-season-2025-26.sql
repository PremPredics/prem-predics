-- Prem Predics season reference seed.
-- Run after schema.sql, seed-cards.sql, auth-profile-trigger.sql, and any migration files.
--
-- This creates the season shell:
-- - one active Premier League 2025-26 season
-- - the 20 Premier League teams
-- - 38 gameweeks
--
-- Fixtures and players are intentionally imported separately because fixture
-- deadlines depend on accurate kickoff_at values.

insert into public.seasons (name, starts_on, ends_on, is_active)
select 'Premier League 2025-26', date '2025-08-15', date '2026-05-24', true
where not exists (
  select 1
  from public.seasons
  where name = 'Premier League 2025-26'
);

update public.seasons
set starts_on = date '2025-08-15',
    ends_on = date '2026-05-24',
    is_active = true
where name = 'Premier League 2025-26';

insert into public.teams (name, short_name)
values
  ('Arsenal', 'ARS'),
  ('Aston Villa', 'AVL'),
  ('Bournemouth', 'BOU'),
  ('Brentford', 'BRE'),
  ('Brighton', 'BHA'),
  ('Burnley', 'BUR'),
  ('Chelsea', 'CHE'),
  ('Crystal Palace', 'CRY'),
  ('Everton', 'EVE'),
  ('Fulham', 'FUL'),
  ('Leeds', 'LEE'),
  ('Liverpool', 'LIV'),
  ('Manchester City', 'MCI'),
  ('Manchester United', 'MUN'),
  ('Newcastle', 'NEW'),
  ('Nottingham Forest', 'NFO'),
  ('Sunderland', 'SUN'),
  ('Tottenham', 'TOT'),
  ('West Ham', 'WHU'),
  ('Wolverhampton', 'WOL')
on conflict (name) do update
set short_name = excluded.short_name;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
gameweek_seed(number, fallback_star_man_locks_at) as (
  values
    (1,  timestamptz '2025-08-15 18:30:00+01'),
    (2,  timestamptz '2025-08-22 18:30:00+01'),
    (3,  timestamptz '2025-08-29 18:30:00+01'),
    (4,  timestamptz '2025-09-12 18:30:00+01'),
    (5,  timestamptz '2025-09-19 18:30:00+01'),
    (6,  timestamptz '2025-09-26 18:30:00+01'),
    (7,  timestamptz '2025-10-03 18:30:00+01'),
    (8,  timestamptz '2025-10-17 18:30:00+01'),
    (9,  timestamptz '2025-10-24 18:30:00+01'),
    (10, timestamptz '2025-10-31 18:30:00+00'),
    (11, timestamptz '2025-11-07 18:30:00+00'),
    (12, timestamptz '2025-11-21 18:30:00+00'),
    (13, timestamptz '2025-11-28 18:30:00+00'),
    (14, timestamptz '2025-12-02 18:30:00+00'),
    (15, timestamptz '2025-12-05 18:30:00+00'),
    (16, timestamptz '2025-12-12 18:30:00+00'),
    (17, timestamptz '2025-12-19 18:30:00+00'),
    (18, timestamptz '2025-12-26 11:00:00+00'),
    (19, timestamptz '2025-12-29 18:30:00+00'),
    (20, timestamptz '2026-01-02 18:30:00+00'),
    (21, timestamptz '2026-01-06 18:30:00+00'),
    (22, timestamptz '2026-01-16 18:30:00+00'),
    (23, timestamptz '2026-01-23 18:30:00+00'),
    (24, timestamptz '2026-01-30 18:30:00+00'),
    (25, timestamptz '2026-02-06 18:30:00+00'),
    (26, timestamptz '2026-02-13 18:30:00+00'),
    (27, timestamptz '2026-02-20 18:30:00+00'),
    (28, timestamptz '2026-02-27 18:30:00+00'),
    (29, timestamptz '2026-03-03 18:30:00+00'),
    (30, timestamptz '2026-03-13 18:30:00+00'),
    (31, timestamptz '2026-03-20 18:30:00+00'),
    (32, timestamptz '2026-04-03 18:30:00+01'),
    (33, timestamptz '2026-04-10 18:30:00+01'),
    (34, timestamptz '2026-04-17 18:30:00+01'),
    (35, timestamptz '2026-04-24 18:30:00+01'),
    (36, timestamptz '2026-05-01 18:30:00+01'),
    (37, timestamptz '2026-05-08 18:30:00+01'),
    (38, timestamptz '2026-05-24 14:30:00+01')
)
insert into public.gameweeks (season_id, number, star_man_locks_at)
select target_season.id, gameweek_seed.number, gameweek_seed.fallback_star_man_locks_at
from target_season
cross join gameweek_seed
on conflict (season_id, number) do update
set star_man_locks_at = excluded.star_man_locks_at;

select
  s.name as season,
  count(distinct gw.id) as gameweeks,
  (select count(*) from public.teams) as teams
from public.seasons s
left join public.gameweeks gw on gw.season_id = s.id
where s.name = 'Premier League 2025-26'
group by s.name;
