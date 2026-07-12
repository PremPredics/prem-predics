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
begin
  select category, effect_key
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
    raise exception 'Cards can be played after the first gameweek in this private league is completed.';
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.effect_key in ('power_swap', 'power_veto', 'power_of_god', 'power_late_scout', 'super_draw') then
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
