-- Prem Predics live migration: Power of the Swap eligibility.
-- Installs validation only; it does not alter leagues, hands or existing card effects.

begin;

update public.card_definitions
set description = 'Discard this card and one other unused card from your hand, then draw 3 Regular Deck cards and keep 2. It cannot be played unless that other unused card is available.'
where effect_key = 'power_swap';

create or replace function public.enforce_power_swap_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_effect_key text;
  swap_card_id uuid;
  eligible_discard_card_id uuid;
  regular_deck_count integer;
begin
  if coalesce(new.status, 'active') <> 'active' then
    return new;
  end if;

  select cd.effect_key
    into target_effect_key
  from public.card_definitions cd
  where cd.id = new.card_id;

  if target_effect_key is distinct from 'power_swap' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'power-swap-eligibility:' || new.competition_id::text || ':' || new.played_by_user_id::text,
      0
    )
  );

  if new.card_instance_id is null then
    raise exception 'Power of the Swap must be played from a card in your hand.';
  end if;

  select lc.id
    into swap_card_id
  from public.league_cards lc
  where lc.id = new.card_instance_id
    and lc.competition_id = new.competition_id
    and lc.owner_user_id = new.played_by_user_id
    and lc.card_id = new.card_id
    and lc.zone = 'hand'
  for update of lc;

  if swap_card_id is null then
    raise exception 'Power of the Swap is no longer unused in your hand.';
  end if;

  if exists (
    select 1
    from public.active_card_effects ace
    where ace.id is distinct from new.id
      and ace.competition_id = new.competition_id
      and ace.card_instance_id = new.card_instance_id
      and ace.status in ('active', 'resolved', 'vetoed')
  ) then
    raise exception 'Power of the Swap has already been used.';
  end if;

  select lc.id
    into eligible_discard_card_id
  from public.league_cards lc
  where lc.competition_id = new.competition_id
    and lc.owner_user_id = new.played_by_user_id
    and lc.zone = 'hand'
    and lc.id <> new.card_instance_id
    and not exists (
      select 1
      from public.active_card_effects ace
      where ace.competition_id = new.competition_id
        and ace.card_instance_id = lc.id
        and ace.status in ('active', 'resolved', 'vetoed')
    )
  order by lc.updated_at, lc.id
  limit 1
  for update of lc;

  if eligible_discard_card_id is null then
    raise exception 'You need at least one other unused card in your hand to play Power of the Swap.';
  end if;

  select count(*)::integer
    into regular_deck_count
  from public.league_cards lc
  where lc.competition_id = new.competition_id
    and lc.owner_user_id is null
    and lc.zone = 'regular_deck';

  if regular_deck_count < 3 then
    raise exception 'The Regular Deck needs at least 3 cards for Power of the Swap.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_power_swap_eligibility() from public;

drop trigger if exists active_card_effects_enforce_power_swap_eligibility
on public.active_card_effects;

create trigger active_card_effects_enforce_power_swap_eligibility
before insert or update of competition_id, card_instance_id, card_id, played_by_user_id, status
on public.active_card_effects
for each row execute function public.enforce_power_swap_eligibility();

notify pgrst, 'reload schema';
commit;

select
  t.tgname as installed_trigger,
  p.proname as installed_function
from pg_catalog.pg_trigger t
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.active_card_effects'::regclass
  and not t.tgisinternal
  and t.tgname = 'active_card_effects_enforce_power_swap_eligibility';
