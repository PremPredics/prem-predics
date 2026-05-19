-- Clear player photo URLs while keeping the column available for future licensed assets.
-- Run this once in Supabase if any player.photo_url values were imported.

alter table public.players
  add column if not exists photo_url text;

update public.players
set photo_url = null
where photo_url is not null;

select count(*) as players_with_photo_url
from public.players
where photo_url is not null;
