-- Prem Predics player photo support, reserved for future licensed assets only.
-- The live Star Man page currently uses nationality flags instead of player photos.
-- Keep public.players.photo_url blank unless you have permission to use the image.

alter table public.players
  add column if not exists photo_url text;

drop table if exists pg_temp.player_photo_seed;
create temp table player_photo_seed (
  display_name text not null,
  team_name text not null,
  photo_url text not null
);

-- Example:
-- insert into pg_temp.player_photo_seed (display_name, team_name, photo_url)
-- values
--   ('Bukayo Saka', 'Arsenal', 'https://example.com/bukayo-saka.png'),
--   ('Alexander Isak', 'Liverpool', 'https://example.com/alexander-isak.png');

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
    nullif(trim(photo_url), '') as photo_url
  from pg_temp.player_photo_seed
)
update public.players player
set photo_url = normalised_seed.photo_url
from normalised_seed
join public.teams team
  on team.name = normalised_seed.team_name
where player.team_id = team.id
  and lower(player.display_name) = lower(normalised_seed.display_name)
  and normalised_seed.photo_url is not null;

-- Handy check: rows returned here still need a photo URL.
select
  player.display_name,
  team.name as team_name
from public.players player
join public.teams team
  on team.id = player.team_id
where player.is_active = true
  and nullif(trim(coalesce(player.photo_url, '')), '') is null
order by team.name, player.display_name;
