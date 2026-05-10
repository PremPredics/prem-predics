-- Adds optional squad metadata for full squad player/U21 player imports.
-- Run this before importing the full player list.

alter table public.players
add column if not exists squad_status text
  check (squad_status is null or squad_status in ('squad_player', 'u21')),
add column if not exists is_homegrown boolean not null default false,
add column if not exists position text,
add column if not exists date_of_birth date;

comment on column public.players.squad_status is
  'Optional player pool grouping: squad_player or u21.';

comment on column public.players.is_homegrown is
  'Whether the player was marked as home grown in the Premier League squad list.';

comment on column public.players.position is
  'Optional broad playing position, for admin filtering only.';

comment on column public.players.date_of_birth is
  'Optional date of birth, useful for U21/scholar reference.';
