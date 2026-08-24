-- One-account repair: restore Vas's undrawn Power of the Swap in PREM PREDICS 26/27.
-- Safe to rerun. This does not delete anything and does not touch any Curse Card.

begin;

do $repair$
declare
  target_count integer;
  prior_repair_count integer;
  target_effect_id uuid;
  updated_count integer;
begin
  select count(*)::integer
    into target_count
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.effect_key = 'power_swap'
  join public.competitions c
    on c.id = ace.competition_id
  join public.profiles p
    on p.id = ace.played_by_user_id
  join public.competition_members cm
    on cm.competition_id = c.id
   and cm.user_id = p.id
  join public.league_cards lc
    on lc.id = ace.card_instance_id
   and lc.competition_id = c.id
   and lc.owner_user_id = p.id
   and lc.zone = 'hand'
  where lower(btrim(c.name)) = lower('PREM PREDICS 26/27')
    and lower(btrim(p.display_name)) = lower('Vas')
    and ace.status = 'active'
    and (ace.target_user_id is null or ace.target_user_id = p.id)
    and not exists (
      select 1
      from public.card_draw_events cde
      where cde.competition_id = ace.competition_id
        and cde.source_card_effect_id = ace.id
    );

  select count(*)::integer
    into prior_repair_count
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.effect_key = 'power_swap'
  join public.competitions c
    on c.id = ace.competition_id
  join public.profiles p
    on p.id = ace.played_by_user_id
  where lower(btrim(c.name)) = lower('PREM PREDICS 26/27')
    and lower(btrim(p.display_name)) = lower('Vas')
    and ace.status = 'cancelled'
    and ace.payload ->> 'admin_repair' = 'restore_unused_power_swap_2026_08_24';

  if target_count = 0 and prior_repair_count = 1 then
    raise notice 'Vas Power of the Swap repair was already applied; no further change was made.';
    return;
  end if;

  if target_count = 0 then
    raise exception 'Repair stopped: no matching active, undrawn Power of the Swap was found for Vas in PREM PREDICS 26/27.';
  end if;

  if target_count <> 1 or prior_repair_count <> 0 then
    raise exception 'Repair stopped: found % active target(s) and % prior repair(s); expected exactly 1 and 0.', target_count, prior_repair_count;
  end if;

  select ace.id
    into target_effect_id
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.effect_key = 'power_swap'
  join public.competitions c
    on c.id = ace.competition_id
  join public.profiles p
    on p.id = ace.played_by_user_id
  join public.competition_members cm
    on cm.competition_id = c.id
   and cm.user_id = p.id
  join public.league_cards lc
    on lc.id = ace.card_instance_id
   and lc.competition_id = c.id
   and lc.owner_user_id = p.id
   and lc.zone = 'hand'
  where lower(btrim(c.name)) = lower('PREM PREDICS 26/27')
    and lower(btrim(p.display_name)) = lower('Vas')
    and ace.status = 'active'
    and (ace.target_user_id is null or ace.target_user_id = p.id)
    and not exists (
      select 1
      from public.card_draw_events cde
      where cde.competition_id = ace.competition_id
        and cde.source_card_effect_id = ace.id
    )
  for update of ace;

  update public.active_card_effects ace
  set status = 'cancelled',
      resolved_at = now(),
      payload = coalesce(ace.payload, '{}'::jsonb) || jsonb_build_object(
        'admin_repair', 'restore_unused_power_swap_2026_08_24',
        'admin_repair_at', now(),
        'admin_repair_reason', 'Swap was activated without another unused hand card'
      )
  where ace.id = target_effect_id
    and ace.status = 'active';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Repair stopped: the matching Swap changed before it could be repaired.';
  end if;
end;
$repair$;

commit;

select
  c.name as league,
  p.display_name as username,
  cd.name as card,
  ace.status as repaired_effect_status,
  lc.zone as card_zone,
  count(cde.id)::integer as swap_draw_events,
  case
    when ace.status = 'cancelled' and lc.zone = 'hand' and count(cde.id) = 0
      then 'REPAIRED: card is unused in Vas''s hand'
    else 'REVIEW REQUIRED'
  end as repair_result
from public.active_card_effects ace
join public.card_definitions cd on cd.id = ace.card_id
join public.competitions c on c.id = ace.competition_id
join public.profiles p on p.id = ace.played_by_user_id
join public.league_cards lc on lc.id = ace.card_instance_id
left join public.card_draw_events cde
  on cde.competition_id = ace.competition_id
 and cde.source_card_effect_id = ace.id
where ace.payload ->> 'admin_repair' = 'restore_unused_power_swap_2026_08_24'
  and lower(btrim(c.name)) = lower('PREM PREDICS 26/27')
  and lower(btrim(p.display_name)) = lower('Vas')
group by c.name, p.display_name, cd.name, ace.status, lc.zone, ace.id, ace.resolved_at
order by ace.resolved_at desc
limit 1;
