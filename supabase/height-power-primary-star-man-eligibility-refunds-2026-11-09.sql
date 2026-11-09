-- Prem Predics / 2026-11-09
-- Enforce primary Star Man height quotas for Power of the Small and Mighty
-- (<= 175 cm) and Power of the Lanky Crouch (>= 185 cm).
-- Switching to an ineligible player or deleting the primary pick automatically
-- cancels that active card and returns its physical league card to Unused.
-- Existing valid activations are unaffected.

begin;

CREATE OR REPLACE FUNCTION public.require_eligible_primary_star_man_for_height_card()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  chosen_height integer;
  chosen_name text;
  chosen_gameweek bigint;
begin
  if new.card_id not in ('power_small_and_mighty','power_lanky_crouch')
     or new.status is distinct from 'active' then
    return new;
  end if;

  chosen_gameweek := coalesce(new.start_gameweek_id, new.gameweek_id);
  select pl.height_cm, pl.display_name
    into chosen_height, chosen_name
  from public.star_man_picks sm
  join public.players pl on pl.id = sm.player_id
  where sm.competition_id = new.competition_id
    and sm.season_id = new.season_id
    and sm.gameweek_id = chosen_gameweek
    and sm.user_id = new.played_by_user_id
    and sm.pick_slot = 'primary'
  limit 1;

  if not found then
    raise exception 'Choose and save your primary Star Man before playing this height-based Power Card.';
  end if;

  if new.card_id = 'power_small_and_mighty'
     and (chosen_height is null or chosen_height > 175) then
    raise exception 'Power of the Small and Mighty requires your primary Star Man to be 175cm or shorter. % is %.',
      coalesce(chosen_name, 'Your Star Man'),
      coalesce(chosen_height::text || 'cm tall', 'of unknown height');
  end if;

  if new.card_id = 'power_lanky_crouch'
     and (chosen_height is null or chosen_height < 185) then
    raise exception 'Power of the Lanky Crouch requires your primary Star Man to be at least 185cm. % is %.',
      coalesce(chosen_name, 'Your Star Man'),
      coalesce(chosen_height::text || 'cm tall', 'of unknown height');
  end if;

  return new;
end;
$function$;

revoke all on function public.require_eligible_primary_star_man_for_height_card() from public, anon, authenticated;
drop trigger if exists active_card_effects_validate_height_powers on public.active_card_effects;
create trigger active_card_effects_validate_height_powers
before insert or update of status,card_id,competition_id,season_id,gameweek_id,start_gameweek_id,played_by_user_id
on public.active_card_effects
for each row execute function public.require_eligible_primary_star_man_for_height_card();

CREATE OR REPLACE FUNCTION public.refund_ineligible_height_powers_after_primary_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  chosen_competition uuid;
  chosen_season uuid;
  chosen_week bigint;
  chosen_owner uuid;
  chosen_height integer := null;
begin
  if tg_op = 'DELETE' then
    if old.pick_slot <> 'primary' then return old; end if;
    chosen_competition := old.competition_id;
    chosen_season := old.season_id;
    chosen_week := old.gameweek_id;
    chosen_owner := old.user_id;
  elsif tg_op = 'UPDATE' and old.pick_slot = 'primary'
        and new.pick_slot <> 'primary' then
    chosen_competition := old.competition_id;
    chosen_season := old.season_id;
    chosen_week := old.gameweek_id;
    chosen_owner := old.user_id;
  else
    if new.pick_slot <> 'primary' then return new; end if;
    chosen_competition := new.competition_id;
    chosen_season := new.season_id;
    chosen_week := new.gameweek_id;
    chosen_owner := new.user_id;
    select height_cm into chosen_height
    from public.players where id = new.player_id;
  end if;

  with reversed_effects as (
    update public.active_card_effects ace
    set status = 'cancelled',
        resolved_at = now(),
        payload = coalesce(ace.payload, '{}'::jsonb)
          || jsonb_build_object('cancel_reason', 'star_man_height_ineligible')
    where ace.competition_id = chosen_competition
      and ace.season_id = chosen_season
      and coalesce(ace.start_gameweek_id, ace.gameweek_id) = chosen_week
      and ace.played_by_user_id = chosen_owner
      and ace.status = 'active'
      and (
        (ace.card_id = 'power_small_and_mighty'
          and (chosen_height is null or chosen_height > 175))
        or
        (ace.card_id = 'power_lanky_crouch'
          and (chosen_height is null or chosen_height < 185))
      )
    returning ace.card_instance_id, ace.competition_id, ace.played_by_user_id, ace.card_id
  )
  update public.league_cards lc
  set zone = 'hand', updated_at = now()
  from reversed_effects effect
  where lc.id = effect.card_instance_id
    and lc.competition_id = effect.competition_id
    and lc.owner_user_id = effect.played_by_user_id
    and lc.card_id = effect.card_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.refund_ineligible_height_powers_after_primary_change() from public, anon, authenticated;
drop trigger if exists star_man_picks_refund_ineligible_height_powers on public.star_man_picks;
create trigger star_man_picks_refund_ineligible_height_powers
after insert or update or delete on public.star_man_picks
for each row execute function public.refund_ineligible_height_powers_after_primary_change();

commit;
