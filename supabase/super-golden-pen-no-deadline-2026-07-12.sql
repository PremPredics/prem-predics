-- Super Golden Gameweek and Super Pen no-deadline patch.
-- Run once in Supabase SQL Editor so live card plays match the website/app rule.
-- Super Draw, Super Golden Gameweek, and Super Pen remain blocked before a private league's first week has ended,
-- but have no 90-minute gameweek card-play deadline after that.

begin;

create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
  league_start_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
  non_stacking_effect_keys text[] := array[
    'power_laundrette',
    'power_clean_sweep',
    'power_pessimist',
    'power_immigrants',
    'power_lanky_crouch',
    'power_small_and_mighty',
    'power_assist_king',
    'power_late_scout',
    'power_snow',
    'super_star_man',
    'super_golden_gameweek',
    'super_sub',
    'super_score',
    'super_duo',
    'super_pen'
  ];
begin
  select category, effect_key, name
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  select starts_gameweek_id
    into league_start_gameweek_id
  from public.competitions
  where id = new.competition_id;

  if league_start_gameweek_id is not null
    and exists (
      select 1
      from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = league_start_gameweek_id
        and lower(coalesce(f.status, '')) not in ('completed', 'finished', 'full_time', 'ft')
        and (f.kickoff_at is null or now() < f.kickoff_at + interval '3 hours')
    )
    and not public.is_admin()
  then
    raise exception 'Cards can only be played once the first week in your private league has ended.';
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  if card_row.effect_key = any(non_stacking_effect_keys)
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = card_row.effect_key
    )
    and not public.is_admin()
  then
    raise exception '% cannot be played more than once within a Gameweek', coalesce(card_row.name, 'This card');
  end if;

  if card_row.effect_key in ('power_lanky_crouch', 'power_small_and_mighty')
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'power_lanky_crouch' and cd.effect_key = 'power_small_and_mighty')
          or (card_row.effect_key = 'power_small_and_mighty' and cd.effect_key = 'power_lanky_crouch')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Lanky Crouch and Power of the Small and Mighty cannot be active at the same time.';
  end if;

  if card_row.effect_key in ('curse_gambler', 'curse_even_number', 'curse_odd_number')
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.target_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'curse_gambler' and cd.effect_key in ('curse_even_number', 'curse_odd_number'))
          or (card_row.effect_key in ('curse_even_number', 'curse_odd_number') and cd.effect_key = 'curse_gambler')
          or (card_row.effect_key = 'curse_even_number' and cd.effect_key = 'curse_odd_number')
          or (card_row.effect_key = 'curse_odd_number' and cd.effect_key = 'curse_even_number')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Curse of the Random cannot be combined with Curse of the Even/Odd Number.';
  end if;

  if card_row.effect_key = 'curse_deleted_match'
    and new.fixture_id is not null
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.target_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'power_hedge'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  if card_row.effect_key = 'power_hedge'
    and new.fixture_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.played_by_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'curse_deleted_match'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.effect_key in ('power_swap', 'power_veto', 'power_of_god', 'power_late_scout', 'super_draw', 'super_golden_gameweek', 'super_pen') then
    return new;
  end if;

  if card_row.category = 'curse' then
    play_deadline := first_kickoff - interval '24 hours';
  else
    play_deadline := coalesce(
      public.star_man_lock_at_for_gameweek(new.season_id, target_gameweek_id),
      first_kickoff - interval '90 minutes'
    );
  end if;

  if now() >= play_deadline and not public.is_admin() then
    if card_row.category = 'curse' then
      raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
    end if;
    if card_row.category = 'super' then
      raise exception 'Super cards must be played before the 90-minute gameweek deadline.';
    end if;
    raise exception 'Power cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_card_play_deadline on public.active_card_effects;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();

commit;
