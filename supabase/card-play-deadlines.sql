-- Prem Predics card-play timing guard.
-- Run this in Supabase once after updating the app.
--
-- Rules:
-- - Curse cards must be played at least 24 hours before the first fixture in the gameweek.
-- - Power and Super cards must be played before the 90-minute gameweek lock.
-- Global admins can still insert/admin-fix rows manually.

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
      raise exception 'Curse cards must be played at least 24 hours before the gameweek starts.';
    end if;
    raise exception 'Power and Super cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_card_play_deadline on public.active_card_effects;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();
