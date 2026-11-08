-- Keep opponent hands private; Curse of the Thief picks a face-down Regular Card.
-- Migration: 2026-11-08, Prem Predics. Run on the existing public schema.
-- Admins retain authorised backend access, but the game UI filters hidden hands.

CREATE OR REPLACE FUNCTION public.list_masked_league_hand_cards(target_competition_id uuid, target_pending_thief_effect_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(owner_user_id uuid, card_instance_id uuid, card_position integer, is_used boolean, can_steal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  viewer_id uuid := (select auth.uid());
  thief_pending boolean := false;
begin
  if viewer_id is null or not public.is_competition_member(target_competition_id) then
    raise exception 'You must belong to this league to view its hidden hand slots.';
  end if;

  if target_pending_thief_effect_id is not null then
    select exists (
      select 1
      from public.active_card_effects e
      where e.id = target_pending_thief_effect_id
        and e.competition_id = target_competition_id
        and e.played_by_user_id = viewer_id
        and e.card_id = 'curse_thief'
        and e.status = 'active'
        and e.target_user_id is null
        and e.deadline_at > now()
    ) into thief_pending;
  end if;

  return query
  with hand_cards as (
    select lc.id, lc.owner_user_id as owner_id, lc.sort_order, lc.created_at,
           cd.category, cd.deck_type,
           exists(
             select 1 from public.active_card_effects e
             where e.competition_id = target_competition_id
               and e.card_instance_id = lc.id
               and e.status in ('active', 'resolved', 'vetoed')
           ) as already_used,
           exists(
             select 1
             from public.active_card_effects swap
             join public.card_definitions sc on sc.id = swap.card_id
             where swap.competition_id = target_competition_id
               and swap.played_by_user_id = lc.owner_user_id
               and swap.status = 'active'
               and sc.effect_key = 'power_swap'
               and not exists (
                 select 1 from public.card_draw_events ce
                 where ce.competition_id = target_competition_id
                   and ce.user_id = lc.owner_user_id
                   and ce.source_card_effect_id = swap.id
               )
               and (
                 select count(*) from public.league_cards other
                 where other.competition_id = target_competition_id
                   and other.owner_user_id = lc.owner_user_id
                   and other.zone = 'hand'
                   and other.id is distinct from swap.card_instance_id
               ) <= 1
           ) as swap_reserve_block
    from public.league_cards lc
    join public.card_definitions cd on cd.id = lc.card_id
    join public.competition_members cm
      on cm.competition_id = lc.competition_id
      and cm.user_id = lc.owner_user_id
    where lc.competition_id = target_competition_id
      and lc.zone = 'hand'
      and lc.owner_user_id <> viewer_id
  ),
  eligible as (
    select h.*,
      (h.deck_type = 'regular' and h.category in ('power', 'curse')
         and not h.already_used and not h.swap_reserve_block) as eligible_to_steal,
      row_number() over (
        partition by h.owner_id
        order by h.sort_order, h.created_at, h.id
      )::integer as position_in_hand
    from hand_cards h
  )
  select e.owner_id,
         case when thief_pending and e.eligible_to_steal then e.id else null::uuid end,
         e.position_in_hand,
         e.already_used,
         e.eligible_to_steal
  from eligible e
  order by e.owner_id, e.position_in_hand;
end;
$function$;

revoke all on function public.list_masked_league_hand_cards(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_masked_league_hand_cards(uuid,uuid) to authenticated;

drop policy if exists "league cards visible to league members" on public.league_cards;
drop policy if exists "league managers manage league cards" on public.league_cards;
drop policy if exists "league members read only own hand and shared deck zones" on public.league_cards;
drop policy if exists "league managers insert league cards" on public.league_cards;
drop policy if exists "league managers update league cards" on public.league_cards;
drop policy if exists "league managers delete league cards" on public.league_cards;

create policy "league members read only own hand and shared deck zones"
on public.league_cards for select to authenticated
using (public.is_admin() or (
  public.is_competition_member(competition_id)
  and (zone <> 'hand' or owner_user_id = (select auth.uid()))
));

create policy "league managers insert league cards"
on public.league_cards for insert to authenticated
with check (public.can_manage_competition(competition_id));

create policy "league managers update league cards"
on public.league_cards for update to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

create policy "league managers delete league cards"
on public.league_cards for delete to authenticated
using (public.can_manage_competition(competition_id));

-- A card draw event records the secret card_id, so the history is private too.
drop policy if exists "card draw events visible to league members" on public.card_draw_events;
drop policy if exists "admins and league managers manage card draw events" on public.card_draw_events;
drop policy if exists "card draw history readable by own user or admin" on public.card_draw_events;
drop policy if exists "league managers insert card draw events" on public.card_draw_events;
drop policy if exists "league managers update card draw events" on public.card_draw_events;
drop policy if exists "league managers delete card draw events" on public.card_draw_events;

create policy "card draw history readable by own user or admin"
on public.card_draw_events for select to authenticated
using (public.is_admin() or (
  user_id = (select auth.uid()) and public.is_competition_member(competition_id)
));

create policy "league managers insert card draw events"
on public.card_draw_events for insert to authenticated
with check (public.can_manage_competition(competition_id));

create policy "league managers update card draw events"
on public.card_draw_events for update to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

create policy "league managers delete card draw events"
on public.card_draw_events for delete to authenticated
using (public.can_manage_competition(competition_id));
