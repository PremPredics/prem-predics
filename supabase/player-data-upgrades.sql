-- Player data upgrades: structured names, home-nation flag, substitution storage, and clean-sheet flag.
-- Run after the base schema and player seed.

alter table public.players
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists first_initial text,
  add column if not exists last_initial text,
  add column if not exists is_home_nation boolean not null default false;

create or replace function public.clean_player_name_part(input_text text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(input_text, '')), '[[:space:]]+', ' ', 'g'), '');
$$;

create or replace function public.set_player_name_details()
returns trigger
language plpgsql
as $$
declare
  cleaned_display_name text;
  derived_first_name text;
  derived_last_name text;
begin
  cleaned_display_name := public.clean_player_name_part(new.display_name);

  derived_first_name := public.clean_player_name_part(new.first_name);
  if derived_first_name is null and cleaned_display_name is not null then
    derived_first_name := split_part(cleaned_display_name, ' ', 1);
  end if;

  derived_last_name := public.clean_player_name_part(new.last_name);
  if derived_last_name is null then
    derived_last_name := public.clean_player_name_part(new.surname);
  end if;
  if derived_last_name is null and cleaned_display_name is not null then
    derived_last_name := regexp_replace(cleaned_display_name, '^.*[[:space:]]', '');
  end if;

  new.first_name := derived_first_name;
  new.last_name := derived_last_name;
  new.first_initial := upper(left(coalesce(derived_first_name, ''), 1));
  new.last_initial := upper(left(coalesce(derived_last_name, ''), 1));
  new.surname := coalesce(derived_last_name, new.surname);
  new.scrabble_name := coalesce(nullif(new.scrabble_name, ''), derived_last_name, new.surname, cleaned_display_name);
  new.is_home_nation := coalesce(new.nationality in ('England', 'Wales', 'Scotland', 'Northern Ireland'), false);

  return new;
end;
$$;

drop trigger if exists players_set_name_details on public.players;
create trigger players_set_name_details
before insert or update of display_name, surname, first_name, last_name, nationality on public.players
for each row execute function public.set_player_name_details();

with normalized as (
  select
    id,
    public.clean_player_name_part(split_part(display_name, ' ', 1)) as derived_first_name,
    coalesce(
      public.clean_player_name_part(surname),
      public.clean_player_name_part(regexp_replace(display_name, '^.*[[:space:]]', ''))
    ) as derived_last_name
  from public.players
)
update public.players p
set
  first_name = n.derived_first_name,
  last_name = n.derived_last_name,
  first_initial = upper(left(coalesce(n.derived_first_name, ''), 1)),
  last_initial = upper(left(coalesce(n.derived_last_name, ''), 1)),
  display_name = case
    when n.derived_first_name is null then p.display_name
    when n.derived_last_name is null or n.derived_last_name = n.derived_first_name then n.derived_first_name
    else n.derived_first_name || ' ' || n.derived_last_name
  end,
  surname = coalesce(n.derived_last_name, p.surname),
  scrabble_name = coalesce(n.derived_last_name, p.scrabble_name, p.surname),
  is_home_nation = coalesce(p.nationality in ('England', 'Wales', 'Scotland', 'Northern Ireland'), false)
from normalized n
where p.id = n.id;

comment on column public.players.first_name is
  'Football display first name with middle names removed.';

comment on column public.players.last_name is
  'Football display surname/family name. Double-barrelled and multi-part surnames should remain intact.';

comment on column public.players.first_initial is
  'Uppercase first letter of first_name.';

comment on column public.players.last_initial is
  'Uppercase first letter of last_name.';

comment on column public.players.is_home_nation is
  'True when nationality is England, Wales, Scotland, or Northern Ireland.';

alter table public.player_fixture_stats
  add column if not exists was_substituted boolean,
  add column if not exists substituted_on_minute integer check (substituted_on_minute is null or substituted_on_minute >= 0),
  add column if not exists substituted_off_minute integer check (substituted_off_minute is null or substituted_off_minute >= 0);

create or replace view public.player_gameweek_stat_totals
with (security_invoker = true)
as
select
  season_id,
  gameweek_id,
  player_id,
  sum(goals)::integer as goals,
  sum(assists)::integer as assists,
  sum(outside_box_goals)::integer as outside_box_goals,
  sum(outside_box_assists)::integer as outside_box_assists,
  sum(yellow_cards)::integer as yellow_cards,
  sum(red_cards)::integer as red_cards,
  bool_or(started) as started,
  bool_or(was_benched) as was_benched,
  sum(coalesce(minutes_played, 0))::integer as minutes_played,
  bool_or(was_substituted) as was_substituted
from public.player_fixture_stats
group by season_id, gameweek_id, player_id;

comment on column public.player_fixture_stats.started is
  'True when the player was in the starting 11 for this fixture.';

comment on column public.player_fixture_stats.was_substituted is
  'True when the player was substituted on or off in this fixture.';

alter table public.match_results
  add column if not exists had_clean_sheet boolean not null default false;

create or replace function public.set_match_result_flags()
returns trigger
language plpgsql
as $$
begin
  new.had_clean_sheet := (new.home_goals = 0 or new.away_goals = 0);
  return new;
end;
$$;

drop trigger if exists match_results_set_flags on public.match_results;
create trigger match_results_set_flags
before insert or update of home_goals, away_goals on public.match_results
for each row execute function public.set_match_result_flags();

update public.match_results
set had_clean_sheet = (home_goals = 0 or away_goals = 0);
