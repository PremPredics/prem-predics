-- Manual Premier League portrait top-ups for player photos.
-- Run this after supabase/generated-player-photo-fpl-update.sql.
--
-- These rows intentionally update by exact player name + team, so duplicate names
-- such as Harvey Elliott or Eberechi Eze only get the intended club row updated.

alter table public.players
  add column if not exists photo_url text;

drop table if exists pg_temp.player_photo_topup_seed;
create temp table player_photo_topup_seed (
  display_name text not null,
  team_name text not null,
  photo_url text not null,
  note text
);

insert into pg_temp.player_photo_topup_seed (display_name, team_name, photo_url, note)
values
  ('Jørgen Strand Larsen', 'Wolverhampton Wanderers', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/247412.png', 'Premier League portrait supplied by user'),
  ('James Ward-Prowse', 'West Ham United', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/101178.png', 'Premier League portrait supplied by user'),
  ('Igor Julio', 'West Ham United', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/223434.png', 'Premier League portrait supplied by user'),
  ('Brennan Johnson', 'Tottenham Hotspur', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/242898.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Marc Guiu', 'Sunderland', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/499309.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Felipe', 'Nottingham Forest', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/116404.png', 'Premier League player profile portrait'),
  ('Douglas Luiz', 'Nottingham Forest', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/230046.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Rodri', 'Manchester City', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/220566.png', 'Premier League portrait from FPL code'),
  ('Oscar Bobb', 'Manchester City', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/477555.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Wataru Endo', 'Liverpool', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/158983.png', 'Premier League portrait from FPL code'),
  ('Harvey Elliott', 'Liverpool', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/444884.png', 'Same player, Liverpool row kept for future loan return'),
  ('Alisson', 'Liverpool', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/116535.png', 'Premier League portrait from FPL code'),
  ('Ao Tanaka', 'Leeds United', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/248056.png', 'Premier League portrait from FPL code'),
  ('Adama Traoré', 'Fulham', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/159533.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Marc Guéhi', 'Crystal Palace', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/209036.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Eberechi Eze', 'Crystal Palace', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/232413.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Tyrique George', 'Chelsea', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/550615.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Facundo Buonanotte', 'Chelsea', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/536916.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Kaoru Mitoma', 'Brighton & Hove Albion', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/451340.png', 'Premier League portrait from FPL code'),
  ('Eli Junior Kroupi', 'Bournemouth', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/560262.png', 'Premier League portrait from FPL code'),
  ('Antoine Semenyo', 'Bournemouth', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/437730.png', 'Same player, current FPL club differs from Prem Predics roster'),
  ('Evann Guessand', 'Aston Villa', 'https://resources.premierleague.com/premierleague25/photos/players/110x140/485337.png', 'Same player, current FPL club differs from Prem Predics roster');

with normalised_seed as (
  select
    trim(display_name) as display_name,
    case trim(team_name)
      when 'Brighton & Hove Albion' then 'Brighton'
      when 'Leeds United' then 'Leeds'
      when 'Newcastle United' then 'Newcastle'
      when 'Tottenham Hotspur' then 'Tottenham'
      when 'West Ham United' then 'West Ham'
      when 'Wolverhampton Wanderers' then 'Wolverhampton'
      else trim(team_name)
    end as team_name,
    nullif(trim(photo_url), '') as photo_url,
    note
  from pg_temp.player_photo_topup_seed
),
updated_rows as (
  update public.players player
  set photo_url = normalised_seed.photo_url
  from normalised_seed
  join public.teams team
    on team.name = normalised_seed.team_name
  where player.team_id = team.id
    and lower(player.display_name) = lower(normalised_seed.display_name)
    and normalised_seed.photo_url is not null
  returning player.display_name, normalised_seed.team_name, normalised_seed.note
)
select *
from updated_rows
order by team_name, display_name;

-- These are the names that still need manual review if they remain blank after
-- both photo scripts have been run.
select
  player.display_name,
  team.name as team_name
from public.players player
join public.teams team
  on team.id = player.team_id
where player.is_active = true
  and nullif(trim(coalesce(player.photo_url, '')), '') is null
order by team.name, player.display_name;
