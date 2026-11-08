-- Restore Power of the Goal to Unused when a primary Star Man selection is removed.
-- A direct player-to-player UPDATE does not trigger the refund, preserving the bonus.
-- The AFTER DELETE trigger also catches curse-driven and automatic Star Man removals.

CREATE OR REPLACE FUNCTION public.refund_power_goal_on_primary_star_man_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  with cancelled_effects as (
    update public.active_card_effects ace
    set status = 'cancelled',
        resolved_at = now(),
        payload = coalesce(ace.payload, '{}'::jsonb)
          || jsonb_build_object('cancel_reason', 'primary_star_man_cleared')
    where ace.competition_id = old.competition_id
      and ace.season_id = old.season_id
      and ace.gameweek_id = old.gameweek_id
      and ace.played_by_user_id = old.user_id
      and ace.card_id = 'power_goal'
      and ace.status = 'active'
    returning ace.card_instance_id, ace.competition_id, ace.played_by_user_id
  )
  update public.league_cards lc
  set zone = 'hand', updated_at = now()
  from cancelled_effects e
  where lc.id = e.card_instance_id
    and lc.competition_id = e.competition_id
    and lc.owner_user_id = e.played_by_user_id
    and lc.card_id = 'power_goal'
    and lc.zone in ('discard', 'active');

  return old;
end;
$function$


revoke all on function public.refund_power_goal_on_primary_star_man_delete() from public, anon, authenticated;

drop trigger if exists star_man_picks_refund_power_goal_on_clear on public.star_man_picks;
create trigger star_man_picks_refund_power_goal_on_clear
after delete on public.star_man_picks
for each row when (old.pick_slot = 'primary')
execute function public.refund_power_goal_on_primary_star_man_delete();
