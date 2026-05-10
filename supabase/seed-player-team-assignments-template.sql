-- Player and team assignment import template.
--
-- Copy this file, replace the sample rows in the insert into player_team_seed
-- section, then run it.
--
-- It creates any missing players, links them to teams for a gameweek range,
-- and updates players.team_id for rows where ends_gameweek_number is null.
--
-- Columns:
-- - display_name: the exact player name shown in the website
-- - surname: optional; used for Curse of the Alphabet scrabble score
-- - scrabble_name: optional; overrides surname for scrabble scoring
-- - team_name: must match public.teams.name exactly
-- - squad_status: optional; squad_player or u21
-- - is_homegrown: optional true/false flag from the squad list asterisk
-- - position: optional; broad admin/filtering label
-- - date_of_birth: optional; yyyy-mm-dd
-- - starts_gameweek_number: usually 1
-- - ends_gameweek_number: null unless the player transfers/leaves mid-season

create temporary table player_team_seed (
  display_name text not null,
  surname text,
  scrabble_name text,
  team_name text not null,
  squad_status text check (squad_status is null or squad_status in ('squad_player', 'u21')),
  is_homegrown boolean not null default false,
  position text,
  date_of_birth date,
  starts_gameweek_number integer not null check (starts_gameweek_number between 1 and 38),
  ends_gameweek_number integer check (ends_gameweek_number between 1 and 38),
  check (ends_gameweek_number is null or ends_gameweek_number >= starts_gameweek_number)
) on commit drop;

insert into player_team_seed (
  display_name,
  surname,
  scrabble_name,
  team_name,
  squad_status,
  is_homegrown,
  position,
  date_of_birth,
  starts_gameweek_number,
  ends_gameweek_number
)
values
  -- Replace these sample rows with the real player list before running.
  ('Mohamed Salah', 'Salah', null, 'Liverpool', 'squad_player', false, 'Forward', null, 1, null),
  ('Erling Haaland', 'Haaland', null, 'Manchester City', 'squad_player', false, 'Forward', null, 1, null),
  ('Bukayo Saka', 'Saka', null, 'Arsenal', 'squad_player', true, 'Forward', null, 1, null);

insert into public.players (display_name, surname, scrabble_name, squad_status, is_homegrown, position, date_of_birth, team_id)
select distinct
  seed.display_name,
  seed.surname,
  seed.scrabble_name,
  seed.squad_status,
  seed.is_homegrown,
  seed.position,
  seed.date_of_birth,
  t.id
from player_team_seed seed
join public.teams t
  on t.name = seed.team_name
where not exists (
  select 1
  from public.players existing
  where existing.display_name = seed.display_name
    and existing.team_id = t.id
);

update public.players existing
set
  surname = coalesce(seed.surname, existing.surname),
  scrabble_name = coalesce(seed.scrabble_name, existing.scrabble_name),
  squad_status = coalesce(seed.squad_status, existing.squad_status),
  is_homegrown = seed.is_homegrown,
  position = coalesce(seed.position, existing.position),
  date_of_birth = coalesce(seed.date_of_birth, existing.date_of_birth)
from player_team_seed seed
join public.teams t
  on t.name = seed.team_name
where existing.display_name = seed.display_name
  and existing.team_id = t.id;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
resolved_seed as (
  select
    p.id as player_id,
    t.id as team_id,
    target_season.id as season_id,
    start_gw.id as starts_gameweek_id,
    end_gw.id as ends_gameweek_id
  from player_team_seed seed
  cross join target_season
  join public.teams t
    on t.name = seed.team_name
  join public.players p
    on p.display_name = seed.display_name
   and p.team_id = t.id
  join public.gameweeks start_gw
    on start_gw.season_id = target_season.id
   and start_gw.number = seed.starts_gameweek_number
  left join public.gameweeks end_gw
    on end_gw.season_id = target_season.id
   and end_gw.number = seed.ends_gameweek_number
)
insert into public.player_team_assignments (
  season_id,
  player_id,
  team_id,
  starts_gameweek_id,
  ends_gameweek_id
)
select
  resolved_seed.season_id,
  resolved_seed.player_id,
  resolved_seed.team_id,
  resolved_seed.starts_gameweek_id,
  resolved_seed.ends_gameweek_id
from resolved_seed
where not exists (
  select 1
  from public.player_team_assignments existing
  where existing.season_id = resolved_seed.season_id
    and existing.player_id = resolved_seed.player_id
    and existing.team_id = resolved_seed.team_id
    and existing.starts_gameweek_id = resolved_seed.starts_gameweek_id
    and coalesce(existing.ends_gameweek_id, -1) = coalesce(resolved_seed.ends_gameweek_id, -1)
);

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
update public.players p
set team_id = t.id
from player_team_seed seed
cross join target_season
join public.teams t
  on t.name = seed.team_name
where p.display_name = seed.display_name
  and seed.ends_gameweek_number is null;

select
  count(*) as total_players,
  count(*) filter (where team_id is null) as players_without_current_team
from public.players;
