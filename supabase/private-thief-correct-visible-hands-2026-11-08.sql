-- Only render cards actually in hand, preserving face-down premium backs.
-- Exclude previously used cards whose Gameweek has started.

CREATE OR REPLACE FUNCTION public.list_masked_league_hand_cards_v2(target_competition_id uuid, target_pending_thief_effect_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(owner_user_id uuid, card_instance_id uuid, card_position integer, is_used boolean, can_steal boolean, card_back_type text, used_gameweek_number integer)
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
           (select gw.number::integer from public.active_card_effects ue
             left join public.gameweeks gw on gw.id = coalesce(ue.start_gameweek_id,ue.gameweek_id)
             where ue.competition_id = target_competition_id and ue.card_instance_id=lc.id
               and ue.status in ('active','resolved','vetoed')
             order by ue.played_at desc, ue.id desc limit 1) as used_week,
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
      -- Used cards disappear from the hand once their Gameweek starts, as before.
      and not exists (
        select 1 from public.active_card_effects oe
        where oe.competition_id = target_competition_id
          and oe.card_instance_id = lc.id
          and oe.status in ('active','resolved','vetoed')
          and (oe.status = 'vetoed' or exists (
            select 1 from public.fixtures f
            where f.season_id = oe.season_id
              and f.gameweek_id = coalesce(oe.start_gameweek_id,oe.gameweek_id)
              and lower(coalesce(f.status,'')) <> 'postponed'
              and f.kickoff_at <= now()
          ))
      )
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
         e.eligible_to_steal,
         case when e.deck_type = 'premium' or e.category = 'super' then 'premium' else 'regular' end::text,
         e.used_week
  from eligible e
  order by e.owner_id, e.position_in_hand;
end;
$function$;

revoke all on function public.list_masked_league_hand_cards_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.list_masked_league_hand_cards_v2(uuid,uuid) to authenticated;
