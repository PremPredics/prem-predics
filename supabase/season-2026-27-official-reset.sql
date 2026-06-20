-- Official Prem Predics 2026/27 season reset.
--
-- Run this once in Supabase SQL Editor when you are ready to move the app to
-- the 2026/27 Premier League season. This intentionally deletes every private
-- league from public.competitions; the child league data cascades from there.
--
-- What it does:
-- - Creates/activates Premier League 2026-27.
-- - Inserts/updates the current 20 Premier League teams using short display names.
-- - Replaces the 2026/27 fixture list with all 380 fixtures and real UK kick-off times.
-- - Deactivates selectable players from Burnley, West Ham, and Wolves.
-- - Adds/updates promoted-club Star Man players for Coventry, Ipswich, and Hull.
-- - Creates 2026/27 player-team assignments for all active current-team players.

begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
set local search_path = extensions, public, pg_temp;

delete from public.competitions;

update public.seasons
set is_active = false;

insert into public.seasons (name, starts_on, ends_on, is_active)
select 'Premier League 2026-27', date '2026-08-21', date '2027-05-30', true
where not exists (
  select 1
  from public.seasons
  where name = 'Premier League 2026-27'
);

update public.seasons
set
  starts_on = date '2026-08-21',
  ends_on = date '2027-05-30',
  is_active = true
where name = 'Premier League 2026-27';

drop table if exists pg_temp.current_premier_league_teams;
create temp table pg_temp.current_premier_league_teams (
  team_name text primary key,
  short_name text not null
) on commit drop;

insert into pg_temp.current_premier_league_teams (team_name, short_name)
values
  ('Arsenal', 'ARS'),
  ('Aston Villa', 'AVL'),
  ('Bournemouth', 'BOU'),
  ('Brentford', 'BRE'),
  ('Brighton', 'BHA'),
  ('Chelsea', 'CHE'),
  ('Coventry', 'COV'),
  ('Crystal Palace', 'CRY'),
  ('Everton', 'EVE'),
  ('Fulham', 'FUL'),
  ('Hull', 'HUL'),
  ('Ipswich', 'IPS'),
  ('Leeds', 'LEE'),
  ('Liverpool', 'LIV'),
  ('Manchester City', 'MCI'),
  ('Manchester United', 'MUN'),
  ('Newcastle', 'NEW'),
  ('Nottingham Forest', 'NFO'),
  ('Sunderland', 'SUN'),
  ('Tottenham', 'TOT');

insert into public.teams (name, short_name)
select team_name, short_name
from pg_temp.current_premier_league_teams
on conflict (name) do update
set short_name = excluded.short_name;

drop table if exists pg_temp.fixture_seed_2026_27;
create temp table pg_temp.fixture_seed_2026_27 (
  gameweek_number integer not null check (gameweek_number between 1 and 38),
  sort_order integer not null check (sort_order between 1 and 10),
  home_team_name text not null,
  away_team_name text not null,
  kickoff_local text not null,
  primary key (gameweek_number, sort_order)
) on commit drop;

insert into pg_temp.fixture_seed_2026_27 (
  gameweek_number,
  sort_order,
  home_team_name,
  away_team_name,
  kickoff_local
)
values
    (1, 1, 'Arsenal', 'Coventry', '2026-08-21 20:00'),
    (1, 2, 'Hull', 'Manchester United', '2026-08-22 12:30'),
    (1, 3, 'Everton', 'Crystal Palace', '2026-08-22 15:00'),
    (1, 4, 'Ipswich', 'Sunderland', '2026-08-22 15:00'),
    (1, 5, 'Nottingham Forest', 'Leeds', '2026-08-22 15:00'),
    (1, 6, 'Brentford', 'Tottenham', '2026-08-22 17:30'),
    (1, 7, 'Brighton', 'Aston Villa', '2026-08-23 14:00'),
    (1, 8, 'Manchester City', 'Bournemouth', '2026-08-23 14:00'),
    (1, 9, 'Newcastle', 'Liverpool', '2026-08-23 16:30'),
    (1, 10, 'Fulham', 'Chelsea', '2026-08-24 20:00'),
    (2, 1, 'Bournemouth', 'Everton', '2026-08-29 15:00'),
    (2, 2, 'Aston Villa', 'Arsenal', '2026-08-29 15:00'),
    (2, 3, 'Chelsea', 'Brighton', '2026-08-29 15:00'),
    (2, 4, 'Coventry', 'Hull', '2026-08-29 15:00'),
    (2, 5, 'Crystal Palace', 'Manchester City', '2026-08-29 15:00'),
    (2, 6, 'Leeds', 'Brentford', '2026-08-29 15:00'),
    (2, 7, 'Liverpool', 'Nottingham Forest', '2026-08-29 15:00'),
    (2, 8, 'Manchester United', 'Ipswich', '2026-08-29 15:00'),
    (2, 9, 'Sunderland', 'Fulham', '2026-08-29 15:00'),
    (2, 10, 'Tottenham', 'Newcastle', '2026-08-29 15:00'),
    (3, 1, 'Arsenal', 'Chelsea', '2026-09-05 15:00'),
    (3, 2, 'Brentford', 'Sunderland', '2026-09-05 15:00'),
    (3, 3, 'Brighton', 'Leeds', '2026-09-05 15:00'),
    (3, 4, 'Everton', 'Manchester United', '2026-09-05 15:00'),
    (3, 5, 'Fulham', 'Crystal Palace', '2026-09-05 15:00'),
    (3, 6, 'Hull', 'Aston Villa', '2026-09-05 15:00'),
    (3, 7, 'Ipswich', 'Liverpool', '2026-09-05 15:00'),
    (3, 8, 'Manchester City', 'Coventry', '2026-09-05 15:00'),
    (3, 9, 'Newcastle', 'Bournemouth', '2026-09-05 15:00'),
    (3, 10, 'Nottingham Forest', 'Tottenham', '2026-09-05 15:00'),
    (4, 1, 'Bournemouth', 'Brentford', '2026-09-12 15:00'),
    (4, 2, 'Aston Villa', 'Nottingham Forest', '2026-09-12 15:00'),
    (4, 3, 'Chelsea', 'Hull', '2026-09-12 15:00'),
    (4, 4, 'Coventry', 'Brighton', '2026-09-12 15:00'),
    (4, 5, 'Crystal Palace', 'Ipswich', '2026-09-12 15:00'),
    (4, 6, 'Leeds', 'Newcastle', '2026-09-12 15:00'),
    (4, 7, 'Liverpool', 'Fulham', '2026-09-12 15:00'),
    (4, 8, 'Manchester United', 'Manchester City', '2026-09-12 15:00'),
    (4, 9, 'Sunderland', 'Arsenal', '2026-09-12 15:00'),
    (4, 10, 'Tottenham', 'Everton', '2026-09-12 15:00'),
    (5, 1, 'Bournemouth', 'Liverpool', '2026-09-19 15:00'),
    (5, 2, 'Brentford', 'Chelsea', '2026-09-19 15:00'),
    (5, 3, 'Brighton', 'Arsenal', '2026-09-19 15:00'),
    (5, 4, 'Everton', 'Ipswich', '2026-09-19 15:00'),
    (5, 5, 'Fulham', 'Manchester United', '2026-09-19 15:00'),
    (5, 6, 'Leeds', 'Crystal Palace', '2026-09-19 15:00'),
    (5, 7, 'Manchester City', 'Sunderland', '2026-09-19 15:00'),
    (5, 8, 'Newcastle', 'Hull', '2026-09-19 15:00'),
    (5, 9, 'Nottingham Forest', 'Coventry', '2026-09-19 15:00'),
    (5, 10, 'Tottenham', 'Aston Villa', '2026-09-19 15:00'),
    (6, 1, 'Arsenal', 'Leeds', '2026-10-10 15:00'),
    (6, 2, 'Aston Villa', 'Brentford', '2026-10-10 15:00'),
    (6, 3, 'Chelsea', 'Bournemouth', '2026-10-10 15:00'),
    (6, 4, 'Coventry', 'Newcastle', '2026-10-10 15:00'),
    (6, 5, 'Crystal Palace', 'Nottingham Forest', '2026-10-10 15:00'),
    (6, 6, 'Hull', 'Everton', '2026-10-10 15:00'),
    (6, 7, 'Ipswich', 'Fulham', '2026-10-10 15:00'),
    (6, 8, 'Liverpool', 'Manchester City', '2026-10-10 15:00'),
    (6, 9, 'Manchester United', 'Tottenham', '2026-10-10 15:00'),
    (6, 10, 'Sunderland', 'Brighton', '2026-10-10 15:00'),
    (7, 1, 'Bournemouth', 'Sunderland', '2026-10-17 15:00'),
    (7, 2, 'Brentford', 'Liverpool', '2026-10-17 15:00'),
    (7, 3, 'Brighton', 'Crystal Palace', '2026-10-17 15:00'),
    (7, 4, 'Everton', 'Chelsea', '2026-10-17 15:00'),
    (7, 5, 'Fulham', 'Hull', '2026-10-17 15:00'),
    (7, 6, 'Leeds', 'Manchester United', '2026-10-17 15:00'),
    (7, 7, 'Manchester City', 'Ipswich', '2026-10-17 15:00'),
    (7, 8, 'Newcastle', 'Aston Villa', '2026-10-17 15:00'),
    (7, 9, 'Nottingham Forest', 'Arsenal', '2026-10-17 15:00'),
    (7, 10, 'Tottenham', 'Coventry', '2026-10-17 15:00'),
    (8, 1, 'Arsenal', 'Everton', '2026-10-24 15:00'),
    (8, 2, 'Aston Villa', 'Manchester City', '2026-10-24 15:00'),
    (8, 3, 'Chelsea', 'Tottenham', '2026-10-24 15:00'),
    (8, 4, 'Coventry', 'Fulham', '2026-10-24 15:00'),
    (8, 5, 'Crystal Palace', 'Newcastle', '2026-10-24 15:00'),
    (8, 6, 'Hull', 'Brentford', '2026-10-24 15:00'),
    (8, 7, 'Ipswich', 'Nottingham Forest', '2026-10-24 15:00'),
    (8, 8, 'Liverpool', 'Brighton', '2026-10-24 15:00'),
    (8, 9, 'Manchester United', 'Bournemouth', '2026-10-24 15:00'),
    (8, 10, 'Sunderland', 'Leeds', '2026-10-24 15:00'),
    (9, 1, 'Bournemouth', 'Leeds', '2026-10-31 15:00'),
    (9, 2, 'Aston Villa', 'Fulham', '2026-10-31 15:00'),
    (9, 3, 'Brentford', 'Nottingham Forest', '2026-10-31 15:00'),
    (9, 4, 'Chelsea', 'Manchester United', '2026-10-31 15:00'),
    (9, 5, 'Coventry', 'Sunderland', '2026-10-31 15:00'),
    (9, 6, 'Hull', 'Ipswich', '2026-10-31 15:00'),
    (9, 7, 'Liverpool', 'Arsenal', '2026-10-31 15:00'),
    (9, 8, 'Manchester City', 'Brighton', '2026-10-31 15:00'),
    (9, 9, 'Newcastle', 'Everton', '2026-10-31 15:00'),
    (9, 10, 'Tottenham', 'Crystal Palace', '2026-10-31 15:00'),
    (10, 1, 'Arsenal', 'Hull', '2026-11-07 15:00'),
    (10, 2, 'Brighton', 'Brentford', '2026-11-07 15:00'),
    (10, 3, 'Crystal Palace', 'Liverpool', '2026-11-07 15:00'),
    (10, 4, 'Everton', 'Coventry', '2026-11-07 15:00'),
    (10, 5, 'Fulham', 'Newcastle', '2026-11-07 15:00'),
    (10, 6, 'Ipswich', 'Bournemouth', '2026-11-07 15:00'),
    (10, 7, 'Leeds', 'Tottenham', '2026-11-07 15:00'),
    (10, 8, 'Manchester United', 'Aston Villa', '2026-11-07 15:00'),
    (10, 9, 'Nottingham Forest', 'Manchester City', '2026-11-07 15:00'),
    (10, 10, 'Sunderland', 'Chelsea', '2026-11-07 15:00'),
    (11, 1, 'Bournemouth', 'Nottingham Forest', '2026-11-21 15:00'),
    (11, 2, 'Aston Villa', 'Sunderland', '2026-11-21 15:00'),
    (11, 3, 'Brentford', 'Everton', '2026-11-21 15:00'),
    (11, 4, 'Chelsea', 'Leeds', '2026-11-21 15:00'),
    (11, 5, 'Coventry', 'Crystal Palace', '2026-11-21 15:00'),
    (11, 6, 'Hull', 'Brighton', '2026-11-21 15:00'),
    (11, 7, 'Liverpool', 'Manchester United', '2026-11-21 15:00'),
    (11, 8, 'Manchester City', 'Fulham', '2026-11-21 15:00'),
    (11, 9, 'Newcastle', 'Arsenal', '2026-11-21 15:00'),
    (11, 10, 'Tottenham', 'Ipswich', '2026-11-21 15:00'),
    (12, 1, 'Arsenal', 'Manchester City', '2026-11-28 15:00'),
    (12, 2, 'Brighton', 'Newcastle', '2026-11-28 15:00'),
    (12, 3, 'Crystal Palace', 'Hull', '2026-11-28 15:00'),
    (12, 4, 'Everton', 'Liverpool', '2026-11-28 15:00'),
    (12, 5, 'Fulham', 'Bournemouth', '2026-11-28 15:00'),
    (12, 6, 'Ipswich', 'Aston Villa', '2026-11-28 15:00'),
    (12, 7, 'Leeds', 'Coventry', '2026-11-28 15:00'),
    (12, 8, 'Manchester United', 'Brentford', '2026-11-28 15:00'),
    (12, 9, 'Nottingham Forest', 'Chelsea', '2026-11-28 15:00'),
    (12, 10, 'Sunderland', 'Tottenham', '2026-11-28 15:00'),
    (13, 1, 'Bournemouth', 'Brighton', '2026-12-02 20:00'),
    (13, 2, 'Aston Villa', 'Everton', '2026-12-02 20:00'),
    (13, 3, 'Brentford', 'Arsenal', '2026-12-02 20:00'),
    (13, 4, 'Chelsea', 'Crystal Palace', '2026-12-02 20:00'),
    (13, 5, 'Coventry', 'Ipswich', '2026-12-02 20:00'),
    (13, 6, 'Hull', 'Nottingham Forest', '2026-12-02 20:00'),
    (13, 7, 'Liverpool', 'Sunderland', '2026-12-02 20:00'),
    (13, 8, 'Manchester City', 'Leeds', '2026-12-02 20:00'),
    (13, 9, 'Newcastle', 'Manchester United', '2026-12-02 20:00'),
    (13, 10, 'Tottenham', 'Fulham', '2026-12-02 20:00'),
    (14, 1, 'Bournemouth', 'Hull', '2026-12-05 15:00'),
    (14, 2, 'Aston Villa', 'Crystal Palace', '2026-12-05 15:00'),
    (14, 3, 'Brentford', 'Manchester City', '2026-12-05 15:00'),
    (14, 4, 'Chelsea', 'Liverpool', '2026-12-05 15:00'),
    (14, 5, 'Everton', 'Fulham', '2026-12-05 15:00'),
    (14, 6, 'Leeds', 'Ipswich', '2026-12-05 15:00'),
    (14, 7, 'Manchester United', 'Coventry', '2026-12-05 15:00'),
    (14, 8, 'Newcastle', 'Sunderland', '2026-12-05 15:00'),
    (14, 9, 'Nottingham Forest', 'Brighton', '2026-12-05 15:00'),
    (14, 10, 'Tottenham', 'Arsenal', '2026-12-05 15:00'),
    (15, 1, 'Arsenal', 'Bournemouth', '2026-12-12 15:00'),
    (15, 2, 'Brighton', 'Everton', '2026-12-12 15:00'),
    (15, 3, 'Coventry', 'Aston Villa', '2026-12-12 15:00'),
    (15, 4, 'Crystal Palace', 'Manchester United', '2026-12-12 15:00'),
    (15, 5, 'Fulham', 'Brentford', '2026-12-12 15:00'),
    (15, 6, 'Hull', 'Tottenham', '2026-12-12 15:00'),
    (15, 7, 'Ipswich', 'Newcastle', '2026-12-12 15:00'),
    (15, 8, 'Liverpool', 'Leeds', '2026-12-12 15:00'),
    (15, 9, 'Manchester City', 'Chelsea', '2026-12-12 15:00'),
    (15, 10, 'Sunderland', 'Nottingham Forest', '2026-12-12 15:00'),
    (16, 1, 'Bournemouth', 'Coventry', '2026-12-19 15:00'),
    (16, 2, 'Arsenal', 'Manchester United', '2026-12-19 15:00'),
    (16, 3, 'Brentford', 'Newcastle', '2026-12-19 15:00'),
    (16, 4, 'Brighton', 'Ipswich', '2026-12-19 15:00'),
    (16, 5, 'Chelsea', 'Aston Villa', '2026-12-19 15:00'),
    (16, 6, 'Leeds', 'Fulham', '2026-12-19 15:00'),
    (16, 7, 'Liverpool', 'Tottenham', '2026-12-19 15:00'),
    (16, 8, 'Manchester City', 'Hull', '2026-12-19 15:00'),
    (16, 9, 'Nottingham Forest', 'Everton', '2026-12-19 15:00'),
    (16, 10, 'Sunderland', 'Crystal Palace', '2026-12-19 15:00'),
    (17, 1, 'Aston Villa', 'Leeds', '2026-12-26 15:00'),
    (17, 2, 'Coventry', 'Chelsea', '2026-12-26 15:00'),
    (17, 3, 'Crystal Palace', 'Arsenal', '2026-12-26 15:00'),
    (17, 4, 'Everton', 'Sunderland', '2026-12-26 15:00'),
    (17, 5, 'Fulham', 'Brighton', '2026-12-26 15:00'),
    (17, 6, 'Hull', 'Liverpool', '2026-12-26 15:00'),
    (17, 7, 'Ipswich', 'Brentford', '2026-12-26 15:00'),
    (17, 8, 'Manchester United', 'Nottingham Forest', '2026-12-26 15:00'),
    (17, 9, 'Newcastle', 'Manchester City', '2026-12-26 15:00'),
    (17, 10, 'Tottenham', 'Bournemouth', '2026-12-26 15:00'),
    (18, 1, 'Aston Villa', 'Liverpool', '2026-12-30 20:00'),
    (18, 2, 'Coventry', 'Brentford', '2026-12-30 20:00'),
    (18, 3, 'Crystal Palace', 'Bournemouth', '2026-12-30 20:00'),
    (18, 4, 'Everton', 'Manchester City', '2026-12-30 20:00'),
    (18, 5, 'Fulham', 'Arsenal', '2026-12-30 20:00'),
    (18, 6, 'Hull', 'Leeds', '2026-12-30 20:00'),
    (18, 7, 'Ipswich', 'Chelsea', '2026-12-30 20:00'),
    (18, 8, 'Manchester United', 'Sunderland', '2026-12-30 20:00'),
    (18, 9, 'Newcastle', 'Nottingham Forest', '2026-12-30 20:00'),
    (18, 10, 'Tottenham', 'Brighton', '2026-12-30 20:00'),
    (19, 1, 'Bournemouth', 'Aston Villa', '2027-01-02 15:00'),
    (19, 2, 'Arsenal', 'Ipswich', '2027-01-02 15:00'),
    (19, 3, 'Brentford', 'Crystal Palace', '2027-01-02 15:00'),
    (19, 4, 'Brighton', 'Manchester United', '2027-01-02 15:00'),
    (19, 5, 'Chelsea', 'Newcastle', '2027-01-02 15:00'),
    (19, 6, 'Leeds', 'Everton', '2027-01-02 15:00'),
    (19, 7, 'Liverpool', 'Coventry', '2027-01-02 15:00'),
    (19, 8, 'Manchester City', 'Tottenham', '2027-01-02 15:00'),
    (19, 9, 'Nottingham Forest', 'Fulham', '2027-01-02 15:00'),
    (19, 10, 'Sunderland', 'Hull', '2027-01-02 15:00'),
    (20, 1, 'Arsenal', 'Brentford', '2027-01-06 20:00'),
    (20, 2, 'Brighton', 'Bournemouth', '2027-01-06 20:00'),
    (20, 3, 'Crystal Palace', 'Chelsea', '2027-01-06 20:00'),
    (20, 4, 'Everton', 'Aston Villa', '2027-01-06 20:00'),
    (20, 5, 'Fulham', 'Tottenham', '2027-01-06 20:00'),
    (20, 6, 'Ipswich', 'Coventry', '2027-01-06 20:00'),
    (20, 7, 'Leeds', 'Manchester City', '2027-01-06 20:00'),
    (20, 8, 'Manchester United', 'Newcastle', '2027-01-06 20:00'),
    (20, 9, 'Nottingham Forest', 'Hull', '2027-01-06 20:00'),
    (20, 10, 'Sunderland', 'Liverpool', '2027-01-06 20:00'),
    (21, 1, 'Bournemouth', 'Ipswich', '2027-01-16 15:00'),
    (21, 2, 'Aston Villa', 'Manchester United', '2027-01-16 15:00'),
    (21, 3, 'Brentford', 'Brighton', '2027-01-16 15:00'),
    (21, 4, 'Chelsea', 'Sunderland', '2027-01-16 15:00'),
    (21, 5, 'Coventry', 'Everton', '2027-01-16 15:00'),
    (21, 6, 'Hull', 'Arsenal', '2027-01-16 15:00'),
    (21, 7, 'Liverpool', 'Crystal Palace', '2027-01-16 15:00'),
    (21, 8, 'Manchester City', 'Nottingham Forest', '2027-01-16 15:00'),
    (21, 9, 'Newcastle', 'Fulham', '2027-01-16 15:00'),
    (21, 10, 'Tottenham', 'Leeds', '2027-01-16 15:00'),
    (22, 1, 'Arsenal', 'Newcastle', '2027-01-23 15:00'),
    (22, 2, 'Brighton', 'Manchester City', '2027-01-23 15:00'),
    (22, 3, 'Crystal Palace', 'Tottenham', '2027-01-23 15:00'),
    (22, 4, 'Everton', 'Brentford', '2027-01-23 15:00'),
    (22, 5, 'Fulham', 'Aston Villa', '2027-01-23 15:00'),
    (22, 6, 'Ipswich', 'Hull', '2027-01-23 15:00'),
    (22, 7, 'Leeds', 'Chelsea', '2027-01-23 15:00'),
    (22, 8, 'Manchester United', 'Liverpool', '2027-01-23 15:00'),
    (22, 9, 'Nottingham Forest', 'Bournemouth', '2027-01-23 15:00'),
    (22, 10, 'Sunderland', 'Coventry', '2027-01-23 15:00'),
    (23, 1, 'Bournemouth', 'Fulham', '2027-01-30 15:00'),
    (23, 2, 'Aston Villa', 'Ipswich', '2027-01-30 15:00'),
    (23, 3, 'Brentford', 'Manchester United', '2027-01-30 15:00'),
    (23, 4, 'Chelsea', 'Nottingham Forest', '2027-01-30 15:00'),
    (23, 5, 'Coventry', 'Leeds', '2027-01-30 15:00'),
    (23, 6, 'Hull', 'Crystal Palace', '2027-01-30 15:00'),
    (23, 7, 'Liverpool', 'Everton', '2027-01-30 15:00'),
    (23, 8, 'Manchester City', 'Arsenal', '2027-01-30 15:00'),
    (23, 9, 'Newcastle', 'Brighton', '2027-01-30 15:00'),
    (23, 10, 'Tottenham', 'Sunderland', '2027-01-30 15:00'),
    (24, 1, 'Arsenal', 'Liverpool', '2027-02-06 15:00'),
    (24, 2, 'Brighton', 'Hull', '2027-02-06 15:00'),
    (24, 3, 'Crystal Palace', 'Coventry', '2027-02-06 15:00'),
    (24, 4, 'Everton', 'Newcastle', '2027-02-06 15:00'),
    (24, 5, 'Fulham', 'Manchester City', '2027-02-06 15:00'),
    (24, 6, 'Ipswich', 'Tottenham', '2027-02-06 15:00'),
    (24, 7, 'Leeds', 'Bournemouth', '2027-02-06 15:00'),
    (24, 8, 'Manchester United', 'Chelsea', '2027-02-06 15:00'),
    (24, 9, 'Nottingham Forest', 'Brentford', '2027-02-06 15:00'),
    (24, 10, 'Sunderland', 'Aston Villa', '2027-02-06 15:00'),
    (25, 1, 'Aston Villa', 'Bournemouth', '2027-02-10 20:00'),
    (25, 2, 'Coventry', 'Liverpool', '2027-02-10 20:00'),
    (25, 3, 'Crystal Palace', 'Brentford', '2027-02-10 20:00'),
    (25, 4, 'Everton', 'Leeds', '2027-02-10 20:00'),
    (25, 5, 'Fulham', 'Nottingham Forest', '2027-02-10 20:00'),
    (25, 6, 'Hull', 'Sunderland', '2027-02-10 20:00'),
    (25, 7, 'Ipswich', 'Arsenal', '2027-02-10 20:00'),
    (25, 8, 'Manchester United', 'Brighton', '2027-02-10 20:00'),
    (25, 9, 'Newcastle', 'Chelsea', '2027-02-10 20:00'),
    (25, 10, 'Tottenham', 'Manchester City', '2027-02-10 20:00'),
    (26, 1, 'Bournemouth', 'Crystal Palace', '2027-02-20 15:00'),
    (26, 2, 'Arsenal', 'Fulham', '2027-02-20 15:00'),
    (26, 3, 'Brentford', 'Coventry', '2027-02-20 15:00'),
    (26, 4, 'Brighton', 'Tottenham', '2027-02-20 15:00'),
    (26, 5, 'Chelsea', 'Ipswich', '2027-02-20 15:00'),
    (26, 6, 'Leeds', 'Aston Villa', '2027-02-20 15:00'),
    (26, 7, 'Liverpool', 'Hull', '2027-02-20 15:00'),
    (26, 8, 'Manchester City', 'Newcastle', '2027-02-20 15:00'),
    (26, 9, 'Nottingham Forest', 'Manchester United', '2027-02-20 15:00'),
    (26, 10, 'Sunderland', 'Everton', '2027-02-20 15:00'),
    (27, 1, 'Aston Villa', 'Chelsea', '2027-02-27 15:00'),
    (27, 2, 'Coventry', 'Bournemouth', '2027-02-27 15:00'),
    (27, 3, 'Crystal Palace', 'Sunderland', '2027-02-27 15:00'),
    (27, 4, 'Everton', 'Nottingham Forest', '2027-02-27 15:00'),
    (27, 5, 'Fulham', 'Leeds', '2027-02-27 15:00'),
    (27, 6, 'Hull', 'Manchester City', '2027-02-27 15:00'),
    (27, 7, 'Ipswich', 'Brighton', '2027-02-27 15:00'),
    (27, 8, 'Manchester United', 'Arsenal', '2027-02-27 15:00'),
    (27, 9, 'Newcastle', 'Brentford', '2027-02-27 15:00'),
    (27, 10, 'Tottenham', 'Liverpool', '2027-02-27 15:00'),
    (28, 1, 'Bournemouth', 'Tottenham', '2027-03-03 20:00'),
    (28, 2, 'Arsenal', 'Crystal Palace', '2027-03-03 20:00'),
    (28, 3, 'Brentford', 'Ipswich', '2027-03-03 20:00'),
    (28, 4, 'Brighton', 'Fulham', '2027-03-03 20:00'),
    (28, 5, 'Chelsea', 'Coventry', '2027-03-03 20:00'),
    (28, 6, 'Leeds', 'Hull', '2027-03-03 20:00'),
    (28, 7, 'Liverpool', 'Aston Villa', '2027-03-03 20:00'),
    (28, 8, 'Manchester City', 'Everton', '2027-03-03 20:00'),
    (28, 9, 'Nottingham Forest', 'Newcastle', '2027-03-03 20:00'),
    (28, 10, 'Sunderland', 'Manchester United', '2027-03-03 20:00'),
    (29, 1, 'Bournemouth', 'Newcastle', '2027-03-13 15:00'),
    (29, 2, 'Aston Villa', 'Hull', '2027-03-13 15:00'),
    (29, 3, 'Chelsea', 'Arsenal', '2027-03-13 15:00'),
    (29, 4, 'Coventry', 'Manchester City', '2027-03-13 15:00'),
    (29, 5, 'Crystal Palace', 'Fulham', '2027-03-13 15:00'),
    (29, 6, 'Leeds', 'Brighton', '2027-03-13 15:00'),
    (29, 7, 'Liverpool', 'Ipswich', '2027-03-13 15:00'),
    (29, 8, 'Manchester United', 'Everton', '2027-03-13 15:00'),
    (29, 9, 'Sunderland', 'Brentford', '2027-03-13 15:00'),
    (29, 10, 'Tottenham', 'Nottingham Forest', '2027-03-13 15:00'),
    (30, 1, 'Arsenal', 'Sunderland', '2027-03-20 15:00'),
    (30, 2, 'Brentford', 'Bournemouth', '2027-03-20 15:00'),
    (30, 3, 'Brighton', 'Coventry', '2027-03-20 15:00'),
    (30, 4, 'Everton', 'Tottenham', '2027-03-20 15:00'),
    (30, 5, 'Fulham', 'Liverpool', '2027-03-20 15:00'),
    (30, 6, 'Hull', 'Chelsea', '2027-03-20 15:00'),
    (30, 7, 'Ipswich', 'Crystal Palace', '2027-03-20 15:00'),
    (30, 8, 'Manchester City', 'Manchester United', '2027-03-20 15:00'),
    (30, 9, 'Newcastle', 'Leeds', '2027-03-20 15:00'),
    (30, 10, 'Nottingham Forest', 'Aston Villa', '2027-03-20 15:00'),
    (31, 1, 'Bournemouth', 'Manchester City', '2027-04-10 15:00'),
    (31, 2, 'Aston Villa', 'Brighton', '2027-04-10 15:00'),
    (31, 3, 'Chelsea', 'Fulham', '2027-04-10 15:00'),
    (31, 4, 'Coventry', 'Arsenal', '2027-04-10 15:00'),
    (31, 5, 'Crystal Palace', 'Everton', '2027-04-10 15:00'),
    (31, 6, 'Leeds', 'Nottingham Forest', '2027-04-10 15:00'),
    (31, 7, 'Liverpool', 'Newcastle', '2027-04-10 15:00'),
    (31, 8, 'Manchester United', 'Hull', '2027-04-10 15:00'),
    (31, 9, 'Sunderland', 'Ipswich', '2027-04-10 15:00'),
    (31, 10, 'Tottenham', 'Brentford', '2027-04-10 15:00'),
    (32, 1, 'Arsenal', 'Aston Villa', '2027-04-17 15:00'),
    (32, 2, 'Brentford', 'Leeds', '2027-04-17 15:00'),
    (32, 3, 'Brighton', 'Chelsea', '2027-04-17 15:00'),
    (32, 4, 'Everton', 'Bournemouth', '2027-04-17 15:00'),
    (32, 5, 'Fulham', 'Sunderland', '2027-04-17 15:00'),
    (32, 6, 'Hull', 'Coventry', '2027-04-17 15:00'),
    (32, 7, 'Ipswich', 'Manchester United', '2027-04-17 15:00'),
    (32, 8, 'Manchester City', 'Crystal Palace', '2027-04-17 15:00'),
    (32, 9, 'Newcastle', 'Tottenham', '2027-04-17 15:00'),
    (32, 10, 'Nottingham Forest', 'Liverpool', '2027-04-17 15:00'),
    (33, 1, 'Bournemouth', 'Arsenal', '2027-04-24 15:00'),
    (33, 2, 'Aston Villa', 'Coventry', '2027-04-24 15:00'),
    (33, 3, 'Brentford', 'Fulham', '2027-04-24 15:00'),
    (33, 4, 'Chelsea', 'Manchester City', '2027-04-24 15:00'),
    (33, 5, 'Everton', 'Brighton', '2027-04-24 15:00'),
    (33, 6, 'Leeds', 'Liverpool', '2027-04-24 15:00'),
    (33, 7, 'Manchester United', 'Crystal Palace', '2027-04-24 15:00'),
    (33, 8, 'Newcastle', 'Ipswich', '2027-04-24 15:00'),
    (33, 9, 'Nottingham Forest', 'Sunderland', '2027-04-24 15:00'),
    (33, 10, 'Tottenham', 'Hull', '2027-04-24 15:00'),
    (34, 1, 'Arsenal', 'Tottenham', '2027-05-01 15:00'),
    (34, 2, 'Brighton', 'Nottingham Forest', '2027-05-01 15:00'),
    (34, 3, 'Coventry', 'Manchester United', '2027-05-01 15:00'),
    (34, 4, 'Crystal Palace', 'Aston Villa', '2027-05-01 15:00'),
    (34, 5, 'Fulham', 'Everton', '2027-05-01 15:00'),
    (34, 6, 'Hull', 'Bournemouth', '2027-05-01 15:00'),
    (34, 7, 'Ipswich', 'Leeds', '2027-05-01 15:00'),
    (34, 8, 'Liverpool', 'Chelsea', '2027-05-01 15:00'),
    (34, 9, 'Manchester City', 'Brentford', '2027-05-01 15:00'),
    (34, 10, 'Sunderland', 'Newcastle', '2027-05-01 15:00'),
    (35, 1, 'Bournemouth', 'Manchester United', '2027-05-08 15:00'),
    (35, 2, 'Brentford', 'Aston Villa', '2027-05-08 15:00'),
    (35, 3, 'Brighton', 'Sunderland', '2027-05-08 15:00'),
    (35, 4, 'Everton', 'Hull', '2027-05-08 15:00'),
    (35, 5, 'Fulham', 'Ipswich', '2027-05-08 15:00'),
    (35, 6, 'Leeds', 'Arsenal', '2027-05-08 15:00'),
    (35, 7, 'Manchester City', 'Liverpool', '2027-05-08 15:00'),
    (35, 8, 'Newcastle', 'Coventry', '2027-05-08 15:00'),
    (35, 9, 'Nottingham Forest', 'Crystal Palace', '2027-05-08 15:00'),
    (35, 10, 'Tottenham', 'Chelsea', '2027-05-08 15:00'),
    (36, 1, 'Arsenal', 'Nottingham Forest', '2027-05-15 15:00'),
    (36, 2, 'Aston Villa', 'Newcastle', '2027-05-15 15:00'),
    (36, 3, 'Chelsea', 'Everton', '2027-05-15 15:00'),
    (36, 4, 'Coventry', 'Tottenham', '2027-05-15 15:00'),
    (36, 5, 'Crystal Palace', 'Brighton', '2027-05-15 15:00'),
    (36, 6, 'Hull', 'Fulham', '2027-05-15 15:00'),
    (36, 7, 'Ipswich', 'Manchester City', '2027-05-15 15:00'),
    (36, 8, 'Liverpool', 'Brentford', '2027-05-15 15:00'),
    (36, 9, 'Manchester United', 'Leeds', '2027-05-15 15:00'),
    (36, 10, 'Sunderland', 'Bournemouth', '2027-05-15 15:00'),
    (37, 1, 'Bournemouth', 'Chelsea', '2027-05-23 15:00'),
    (37, 2, 'Brentford', 'Hull', '2027-05-23 15:00'),
    (37, 3, 'Brighton', 'Liverpool', '2027-05-23 15:00'),
    (37, 4, 'Everton', 'Arsenal', '2027-05-23 15:00'),
    (37, 5, 'Fulham', 'Coventry', '2027-05-23 15:00'),
    (37, 6, 'Leeds', 'Sunderland', '2027-05-23 15:00'),
    (37, 7, 'Manchester City', 'Aston Villa', '2027-05-23 15:00'),
    (37, 8, 'Newcastle', 'Crystal Palace', '2027-05-23 15:00'),
    (37, 9, 'Nottingham Forest', 'Ipswich', '2027-05-23 15:00'),
    (37, 10, 'Tottenham', 'Manchester United', '2027-05-23 15:00'),
    (38, 1, 'Arsenal', 'Brighton', '2027-05-30 15:00'),
    (38, 2, 'Aston Villa', 'Tottenham', '2027-05-30 15:00'),
    (38, 3, 'Chelsea', 'Brentford', '2027-05-30 15:00'),
    (38, 4, 'Coventry', 'Nottingham Forest', '2027-05-30 15:00'),
    (38, 5, 'Crystal Palace', 'Leeds', '2027-05-30 15:00'),
    (38, 6, 'Hull', 'Newcastle', '2027-05-30 15:00'),
    (38, 7, 'Ipswich', 'Everton', '2027-05-30 15:00'),
    (38, 8, 'Liverpool', 'Bournemouth', '2027-05-30 15:00'),
    (38, 9, 'Manchester United', 'Fulham', '2027-05-30 15:00'),
    (38, 10, 'Sunderland', 'Manchester City', '2027-05-30 15:00');

do $$
begin
  if (select count(*) from pg_temp.fixture_seed_2026_27) <> 380 then
    raise exception 'Fixture seed must contain 380 rows.';
  end if;

  if exists (
    select 1
    from generate_series(1, 38) as gw(number)
    left join (
      select gameweek_number, count(*) as fixture_count
      from pg_temp.fixture_seed_2026_27
      group by gameweek_number
    ) counts on counts.gameweek_number = gw.number
    where coalesce(counts.fixture_count, 0) <> 10
  ) then
    raise exception 'Every gameweek must contain exactly 10 fixtures.';
  end if;

  if exists (
    select 1
    from pg_temp.fixture_seed_2026_27 seed
    left join public.teams home_team on home_team.name = seed.home_team_name
    left join public.teams away_team on away_team.name = seed.away_team_name
    where home_team.id is null or away_team.id is null
  ) then
    raise exception 'Some fixture team names do not match public.teams: %',
      (
        select string_agg(distinct missing_team, ', ' order by missing_team)
        from (
          select seed.home_team_name as missing_team
          from pg_temp.fixture_seed_2026_27 seed
          left join public.teams teams on teams.name = seed.home_team_name
          where teams.id is null
          union
          select seed.away_team_name as missing_team
          from pg_temp.fixture_seed_2026_27 seed
          left join public.teams teams on teams.name = seed.away_team_name
          where teams.id is null
        ) missing
      );
  end if;
end;
$$;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
),
gameweek_seed(number, fallback_star_man_locks_at) as (
  values
    (1, ('2026-08-21 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (2, ('2026-08-29 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (3, ('2026-09-05 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (4, ('2026-09-12 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (5, ('2026-09-19 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (6, ('2026-10-10 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (7, ('2026-10-17 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (8, ('2026-10-24 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (9, ('2026-10-31 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (10, ('2026-11-07 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (11, ('2026-11-21 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (12, ('2026-11-28 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (13, ('2026-12-02 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (14, ('2026-12-05 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (15, ('2026-12-12 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (16, ('2026-12-19 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (17, ('2026-12-26 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (18, ('2026-12-30 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (19, ('2027-01-02 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (20, ('2027-01-06 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (21, ('2027-01-16 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (22, ('2027-01-23 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (23, ('2027-01-30 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (24, ('2027-02-06 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (25, ('2027-02-10 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (26, ('2027-02-20 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (27, ('2027-02-27 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (28, ('2027-03-03 20:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (29, ('2027-03-13 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (30, ('2027-03-20 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (31, ('2027-04-10 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (32, ('2027-04-17 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (33, ('2027-04-24 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (34, ('2027-05-01 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (35, ('2027-05-08 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (36, ('2027-05-15 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (37, ('2027-05-23 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes'),
    (38, ('2027-05-30 15:00'::timestamp at time zone 'Europe/London') - interval '90 minutes')
)
insert into public.gameweeks (season_id, number, star_man_locks_at)
select target_season.id, gameweek_seed.number, gameweek_seed.fallback_star_man_locks_at
from target_season
cross join gameweek_seed
on conflict (season_id, number) do update
set star_man_locks_at = excluded.star_man_locks_at;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
)
delete from public.player_gameweek_stats stats
using target_season
where stats.season_id = target_season.id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
)
delete from public.game_card_actual_results results
using target_season
where results.season_id = target_season.id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
)
delete from public.fixtures fixtures
using target_season
where fixtures.season_id = target_season.id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
)
insert into public.fixtures (
  season_id,
  gameweek_id,
  original_gameweek_id,
  home_team_id,
  away_team_id,
  kickoff_at,
  sort_order,
  status
)
select
  target_season.id,
  gameweeks.id,
  gameweeks.id,
  home_team.id,
  away_team.id,
  fixture_seed.kickoff_local::timestamp at time zone 'Europe/London',
  fixture_seed.sort_order,
  'scheduled'
from pg_temp.fixture_seed_2026_27 fixture_seed
cross join target_season
join public.gameweeks gameweeks
  on gameweeks.season_id = target_season.id
 and gameweeks.number = fixture_seed.gameweek_number
join public.teams home_team
  on home_team.name = fixture_seed.home_team_name
join public.teams away_team
  on away_team.name = fixture_seed.away_team_name
order by fixture_seed.gameweek_number, fixture_seed.sort_order;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
),
locks as (
  select
    fixtures.gameweek_id,
    min(fixtures.kickoff_at) - interval '90 minutes' as star_man_locks_at
  from public.fixtures fixtures
  join target_season on target_season.id = fixtures.season_id
  where fixtures.status <> 'postponed'
  group by fixtures.gameweek_id
)
update public.gameweeks gameweeks
set star_man_locks_at = locks.star_man_locks_at
from locks, target_season
where gameweeks.season_id = target_season.id
  and gameweeks.id = locks.gameweek_id;

create or replace function pg_temp.star_man_norm(input_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(input_text, ''))), '[^a-z0-9]+', '', 'g');
$$;

create or replace function pg_temp.star_man_first_name(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  words text[];
  word_count integer;
begin
  words := regexp_split_to_array(trim(coalesce(input_text, '')), '\s+');
  word_count := array_length(words, 1);

  if word_count is null or word_count = 0 then
    return null;
  end if;

  return words[1];
end;
$$;

create or replace function pg_temp.star_man_last_name(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  words text[];
  word_count integer;
  particle_pos integer;
begin
  words := regexp_split_to_array(trim(coalesce(input_text, '')), '\s+');
  word_count := array_length(words, 1);

  if word_count is null or word_count = 0 then
    return null;
  end if;

  if word_count = 1 then
    return words[1];
  end if;

  select min(i)
    into particle_pos
  from generate_subscripts(words, 1) as i
  where i > 1
    and lower(words[i]) in ('van', 'de', 'den', 'der', 'del', 'da', 'di', 'dos', 'du', 'le', 'la');

  if particle_pos is not null then
    return array_to_string(words[particle_pos:word_count], ' ');
  end if;

  return words[word_count];
end;
$$;

drop table if exists pg_temp.promoted_player_seed_2026_27;
create temp table pg_temp.promoted_player_seed_2026_27 (
  display_name text not null,
  team_name text not null,
  nationality text not null,
  height_cm integer not null check (height_cm > 0),
  norm_name text,
  primary key (display_name, team_name)
) on commit drop;

insert into pg_temp.promoted_player_seed_2026_27 (display_name, team_name, nationality, height_cm)
values
    ('Alex Palmer', 'Ipswich', 'England', 183),
    ('Leif Davis', 'Ipswich', 'England', 166),
    ('Cédric Kipré', 'Ipswich', 'Ivory Coast', 190),
    ('Azor Matusiwa', 'Ipswich', 'Netherlands', 173),
    ('Dan Neil', 'Ipswich', 'England', 178),
    ('Wes Burns', 'Ipswich', 'Wales', 173),
    ('Sindre Walle Egeli', 'Ipswich', 'Norway', 182),
    ('George Hirst', 'Ipswich', 'Scotland', 191),
    ('Jaden Philogene-Bidace', 'Ipswich', 'England', 181),
    ('Jens Cajuste', 'Ipswich', 'Sweden', 188),
    ('Jack Taylor', 'Ipswich', 'Republic of Ireland', 185),
    ('Ashley Young', 'Ipswich', 'England', 175),
    ('Ben Johnson', 'Ipswich', 'England', 175),
    ('Darnell Furlong', 'Ipswich', 'England', 180),
    ('Kasey McAteer', 'Ipswich', 'Republic of Ireland', 177),
    ('Jacob Greaves', 'Ipswich', 'England', 185),
    ('Elkan Baggott', 'Ipswich', 'Indonesia', 194),
    ('Dara O’Shea', 'Ipswich', 'Republic of Ireland', 185),
    ('Christian Walton', 'Ipswich', 'England', 182),
    ('Chuba Akpom', 'Ipswich', 'England', 183),
    ('Iván Azón', 'Ipswich', 'Spain', 181),
    ('Marcelino Núñez', 'Ipswich', 'Chile', 173),
    ('Anis Mehmeti', 'Ipswich', 'Albania', 180),
    ('Jack Clarke', 'Ipswich', 'England', 181),
    ('Jay Dasilva', 'Coventry', 'Wales', 170),
    ('Bobby Thomas', 'Coventry', 'England', 186),
    ('Jack Rudoni', 'Coventry', 'England', 186),
    ('Matt Grimes', 'Coventry', 'England', 178),
    ('Tatsuhiro Sakamoto', 'Coventry', 'Japan', 170),
    ('Jamie Allen', 'Coventry', 'England', 180),
    ('Ellis Simms', 'Coventry', 'England', 183),
    ('Ephron Mason-Clark', 'Coventry', 'England', 178),
    ('Haji Wright', 'Coventry', 'United States', 188),
    ('Ben Wilson', 'Coventry', 'England', 186),
    ('Romain Esse', 'Coventry', 'England', 178),
    ('Liam Kitching', 'Coventry', 'England', 191),
    ('Frank Onyeka', 'Coventry', 'Nigeria', 183),
    ('Yang Min-Hyeok', 'Coventry', 'South Korea', 173),
    ('Carl Rushworth', 'Coventry', 'England', 188),
    ('Kaine Kesler Hayden', 'Coventry', 'England', 175),
    ('Jake Bidwell', 'Coventry', 'England', 183),
    ('Joel Latibeaudiere', 'Coventry', 'Jamaica', 190),
    ('Brandon Thomas-Asante', 'Coventry', 'Ghana', 180),
    ('Jahnoah Markelo', 'Coventry', 'Netherlands', 171),
    ('Luke Woolfenden', 'Coventry', 'England', 183),
    ('Milan van Ewijk', 'Coventry', 'Netherlands', 175),
    ('Josh Eccles', 'Coventry', 'England', 181),
    ('Victor Torp', 'Coventry', 'Denmark', 178),
    ('Miguel Brau', 'Coventry', 'Spain', 183),
    ('Ivor Pandur', 'Hull', 'Croatia', 185),
    ('Lewis Coyle', 'Hull', 'England', 173),
    ('Ryan Giles', 'Hull', 'England', 179),
    ('Charlie Hughes', 'Hull', 'England', 185),
    ('John Lundstram', 'Hull', 'England', 181),
    ('Semi Ajayi', 'Hull', 'Nigeria', 193),
    ('Liam Millar', 'Hull', 'Canada', 176),
    ('Oliver McBurnie', 'Hull', 'Scotland', 188),
    ('Mohamed Belloumi', 'Hull', 'Algeria', 174),
    ('Babajide David Akintola', 'Hull', 'Nigeria', 178),
    ('Dillon Phillips', 'Hull', 'England', 188),
    ('Yu Hirakawa', 'Hull', 'Japan', 172),
    ('John Egan', 'Hull', 'Republic of Ireland', 185),
    ('Cody Drameh', 'Hull', 'England', 175),
    ('Amir Hadžiahmetović', 'Hull', 'Bosnia and Herzegovina', 179),
    ('Joe Gelhardt', 'Hull', 'England', 176),
    ('Kyle Joseph', 'Hull', 'Scotland', 186),
    ('Akin Famewo', 'Hull', 'England', 180),
    ('Darko Gyabi', 'Hull', 'England', 196),
    ('Matt Crooks', 'Hull', 'England', 183),
    ('Kieran Dowell', 'Hull', 'England', 175),
    ('Regan Slater', 'Hull', 'England', 173),
    ('Toby Collyer', 'Hull', 'England', 180),
    ('Lewis Koumas', 'Hull', 'Wales', 182),
    ('Paddy McNair', 'Hull', 'Northern Ireland', 183),
    ('Cathal McCarthy', 'Hull', 'Republic of Ireland', 185);

update pg_temp.promoted_player_seed_2026_27
set norm_name = pg_temp.star_man_norm(display_name);

alter table pg_temp.promoted_player_seed_2026_27
alter column norm_name set not null;

do $$
begin
  if exists (
    select 1
    from pg_temp.promoted_player_seed_2026_27 seed
    left join public.teams teams on teams.name = seed.team_name
    where teams.id is null
  ) then
    raise exception 'Some promoted player team names do not match public.teams: %',
      (
        select string_agg(distinct seed.team_name, ', ' order by seed.team_name)
        from pg_temp.promoted_player_seed_2026_27 seed
        left join public.teams teams on teams.name = seed.team_name
        where teams.id is null
      );
  end if;
end;
$$;

insert into public.players (
  display_name,
  first_name,
  last_name,
  surname,
  scrabble_name,
  team_id,
  squad_status,
  nationality,
  height_cm,
  is_active
)
select
  seed.display_name,
  pg_temp.star_man_first_name(seed.display_name),
  pg_temp.star_man_last_name(seed.display_name),
  pg_temp.star_man_last_name(seed.display_name),
  pg_temp.star_man_last_name(seed.display_name),
  teams.id,
  'squad_player',
  seed.nationality,
  seed.height_cm,
  true
from pg_temp.promoted_player_seed_2026_27 seed
join public.teams teams on teams.name = seed.team_name
where not exists (
  select 1
  from public.players players
  where pg_temp.star_man_norm(players.display_name) = seed.norm_name
);

drop table if exists pg_temp.promoted_player_canonical_2026_27;
create temp table pg_temp.promoted_player_canonical_2026_27 as
select distinct on (seed.display_name, seed.team_name)
  seed.display_name,
  seed.team_name,
  seed.nationality,
  seed.height_cm,
  seed.norm_name,
  teams.id as team_id,
  players.id as player_id
from pg_temp.promoted_player_seed_2026_27 seed
join public.teams teams
  on teams.name = seed.team_name
join public.players players
  on pg_temp.star_man_norm(players.display_name) = seed.norm_name
order by
  seed.display_name,
  seed.team_name,
  (players.team_id = teams.id) desc,
  players.is_active desc,
  players.created_at desc;

update public.players players
set
  display_name = canonical.display_name,
  first_name = pg_temp.star_man_first_name(canonical.display_name),
  last_name = pg_temp.star_man_last_name(canonical.display_name),
  surname = pg_temp.star_man_last_name(canonical.display_name),
  scrabble_name = pg_temp.star_man_last_name(canonical.display_name),
  team_id = canonical.team_id,
  squad_status = 'squad_player',
  nationality = canonical.nationality,
  height_cm = canonical.height_cm,
  is_active = true
from pg_temp.promoted_player_canonical_2026_27 canonical
where players.id = canonical.player_id;

update public.players players
set is_active = false
from pg_temp.promoted_player_canonical_2026_27 canonical
where pg_temp.star_man_norm(players.display_name) = canonical.norm_name
  and players.id <> canonical.player_id;

update public.players players
set is_active = false
from public.teams teams
where players.team_id = teams.id
  and teams.name in ('Burnley', 'West Ham', 'West Ham United', 'Wolverhampton', 'Wolverhampton Wanderers', 'Wolves')
  and not exists (
    select 1
    from pg_temp.promoted_player_canonical_2026_27 canonical
    where canonical.player_id = players.id
  );

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
)
delete from public.player_team_assignments assignments
using target_season
where assignments.season_id = target_season.id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2026-27'
  order by created_at desc
  limit 1
),
start_gameweek as (
  select gameweeks.id
  from public.gameweeks gameweeks
  join target_season on target_season.id = gameweeks.season_id
  where gameweeks.number = 1
)
insert into public.player_team_assignments (
  season_id,
  player_id,
  team_id,
  starts_gameweek_id,
  ends_gameweek_id
)
select
  target_season.id,
  players.id,
  players.team_id,
  start_gameweek.id,
  null
from public.players players
join public.teams teams on teams.id = players.team_id
join pg_temp.current_premier_league_teams current_teams on current_teams.team_name = teams.name
cross join target_season
cross join start_gameweek
where players.is_active = true
  and players.team_id is not null;

commit;

select 'private_leagues_remaining' as check_name, count(*)::integer as result
from public.competitions
union all
select 'active_2026_27_seasons', count(*)::integer
from public.seasons
where name = 'Premier League 2026-27'
  and is_active = true
union all
select 'gameweeks_2026_27', count(*)::integer
from public.gameweeks gameweeks
join public.seasons seasons on seasons.id = gameweeks.season_id
where seasons.name = 'Premier League 2026-27'
union all
select 'fixtures_2026_27', count(*)::integer
from public.fixtures fixtures
join public.seasons seasons on seasons.id = fixtures.season_id
where seasons.name = 'Premier League 2026-27'
union all
select 'promoted_players_active', count(*)::integer
from public.players players
join public.teams teams on teams.id = players.team_id
where players.is_active = true
  and teams.name in ('Coventry', 'Ipswich', 'Hull')
union all
select 'relegated_club_players_still_active', count(*)::integer
from public.players players
join public.teams teams on teams.id = players.team_id
where players.is_active = true
  and teams.name in ('Burnley', 'West Ham', 'West Ham United', 'Wolverhampton', 'Wolverhampton Wanderers', 'Wolves')
union all
select 'player_team_assignments_2026_27', count(*)::integer
from public.player_team_assignments assignments
join public.seasons seasons on seasons.id = assignments.season_id
where seasons.name = 'Premier League 2026-27'
order by check_name;
