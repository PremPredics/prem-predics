-- One-account repair: restore Vas's undrawn Power of the Swap in PREM PREDICS 26/27.
-- Safe to rerun. This is one atomic statement, deletes nothing and touches no Curse Card.

with candidates as materialized (
  select
    ace.id as effect_id,
    ace.card_instance_id,
    c.name as league_name,
    p.display_name as username,
    cd.name as card_name,
    lc.zone as card_zone
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
),
prior_repairs as materialized (
  select
    ace.id as effect_id,
    ace.card_instance_id,
    c.name as league_name,
    p.display_name as username,
    cd.name as card_name,
    lc.zone as card_zone,
    ace.resolved_at
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.effect_key = 'power_swap'
  join public.competitions c
    on c.id = ace.competition_id
  join public.profiles p
    on p.id = ace.played_by_user_id
  join public.league_cards lc
    on lc.id = ace.card_instance_id
  where lower(btrim(c.name)) = lower('PREM PREDICS 26/27')
    and lower(btrim(p.display_name)) = lower('Vas')
    and ace.status = 'cancelled'
    and ace.payload ->> 'admin_repair' = 'restore_unused_power_swap_2026_08_24'
),
repair as (
  update public.active_card_effects ace
  set status = 'cancelled',
      resolved_at = now(),
      payload = coalesce(ace.payload, '{}'::jsonb) || jsonb_build_object(
        'admin_repair', 'restore_unused_power_swap_2026_08_24',
        'admin_repair_at', now(),
        'admin_repair_reason', 'Swap was activated without another unused hand card'
      )
  from candidates candidate
  where ace.id = candidate.effect_id
    and ace.status = 'active'
    and (select count(*) from candidates) = 1
    and (select count(*) from prior_repairs) = 0
  returning ace.id as effect_id
),
summary as (
  select
    (select count(*)::integer from candidates) as candidate_count,
    (select count(*)::integer from prior_repairs) as prior_repair_count,
    (select count(*)::integer from repair) as repaired_count
)
select
  coalesce(
    (select candidate.league_name from candidates candidate limit 1),
    (select prior.league_name from prior_repairs prior order by prior.resolved_at desc limit 1),
    'PREM PREDICS 26/27'
  ) as league,
  coalesce(
    (select candidate.username from candidates candidate limit 1),
    (select prior.username from prior_repairs prior order by prior.resolved_at desc limit 1),
    'Vas'
  ) as username,
  coalesce(
    (select candidate.card_name from candidates candidate limit 1),
    (select prior.card_name from prior_repairs prior order by prior.resolved_at desc limit 1),
    'Power of the Swap'
  ) as card,
  coalesce(
    (select repair.effect_id from repair limit 1),
    (select prior.effect_id from prior_repairs prior order by prior.resolved_at desc limit 1),
    (select candidate.effect_id from candidates candidate limit 1)
  ) as effect_id,
  coalesce(
    (select candidate.card_zone from candidates candidate limit 1),
    (select prior.card_zone from prior_repairs prior order by prior.resolved_at desc limit 1)
  ) as card_zone,
  summary.candidate_count,
  summary.prior_repair_count,
  summary.repaired_count,
  case
    when summary.repaired_count = 1
      then 'REPAIRED: card is unused in Vas''s hand'
    when summary.candidate_count = 0 and summary.prior_repair_count = 1
      then 'ALREADY REPAIRED: no further change was made'
    when summary.candidate_count = 0 and summary.prior_repair_count = 0
      then 'STOPPED: no matching active, undrawn Swap was found'
    when summary.candidate_count <> 1
      then 'STOPPED: multiple matching active, undrawn Swaps were found'
    when summary.prior_repair_count <> 0
      then 'STOPPED: an unexpected prior repair record was found'
    else 'STOPPED: no change was made; review required'
  end as repair_result
from summary;
