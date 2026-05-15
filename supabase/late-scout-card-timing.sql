create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
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

  if card_row.effect_key = 'power_late_scout' then
    if exists (
      select 1
      from public.star_man_picks smp
      where smp.competition_id = new.competition_id
        and smp.season_id = new.season_id
        and smp.gameweek_id = target_gameweek_id
        and smp.user_id = new.played_by_user_id
        and smp.pick_slot = 'primary'
    ) then
      raise exception 'Power of the Late Scout can only be played if you have not already chosen a Star Man for this gameweek.';
    end if;

    if not exists (
      select 1
      from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = target_gameweek_id
        and f.status <> 'postponed'
        and now() < f.kickoff_at
    ) then
      raise exception 'Power of the Late Scout can only be played while at least one current gameweek match has not kicked off.';
    end if;

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
    raise exception 'Power and Super cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;
