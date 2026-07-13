-- Keep curse cards in their owner's hand while active, then move them into the
-- used/discard pile when Curse of the Thief completes or a curse is vetoed.

begin;

create or replace function public.steal_regular_card_from_opponent(
  target_competition_id uuid,
  target_source_card_effect_id uuid,
  target_card_instance_id uuid
)
returns table (
  card_instance_id uuid,
  card_id text,
  card_name text,
  previous_owner_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  effect_row record;
  stolen_row record;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select ace.*, cd.effect_key
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_source_card_effect_id
    and ace.competition_id = target_competition_id
    and ace.played_by_user_id = target_user
    and ace.status = 'active';

  if effect_row.id is null or effect_row.effect_key <> 'curse_thief' then
    raise exception 'Curse of the Thief is not active.';
  end if;

  select lc.id, lc.card_id, lc.owner_user_id, cd.name, cd.deck_type, cd.category
    into stolen_row
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = target_card_instance_id
    and lc.competition_id = target_competition_id
    and lc.zone = 'hand'
  for update;

  if stolen_row.id is null then
    raise exception 'Card not found.';
  end if;

  if stolen_row.owner_user_id = target_user then
    raise exception 'You cannot steal your own card.';
  end if;

  if stolen_row.deck_type = 'premium' or stolen_row.category = 'super' then
    raise exception 'Curse of the Thief cannot steal Super Cards.';
  end if;

  update public.league_cards
  set owner_user_id = target_user,
      updated_at = now()
  where id = stolen_row.id;

  update public.active_card_effects
  set target_user_id = stolen_row.owner_user_id,
      status = 'resolved',
      resolved_at = now()
  where id = target_source_card_effect_id;

  update public.league_cards
  set zone = 'discard',
      updated_at = now()
  where id = effect_row.card_instance_id
    and competition_id = target_competition_id
    and owner_user_id = target_user
    and zone in ('hand', 'active');

  card_instance_id := stolen_row.id;
  card_id := stolen_row.card_id;
  card_name := stolen_row.name;
  previous_owner_user_id := stolen_row.owner_user_id;
  return next;
end;
$$;

grant execute on function public.steal_regular_card_from_opponent(uuid, uuid, uuid) to authenticated;

create or replace function public.veto_my_active_curse(
  target_competition_id uuid,
  target_card_effect_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  effect_row record;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this league.';
  end if;

  select ace.id, ace.target_user_id, ace.status, ace.card_instance_id, ace.played_by_user_id, cd.category
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_card_effect_id
    and ace.competition_id = target_competition_id;

  if effect_row.id is null then
    raise exception 'Curse not found.';
  end if;

  if effect_row.category <> 'curse' or effect_row.status <> 'active' or effect_row.target_user_id <> target_user then
    raise exception 'Power of the Veto can only cancel an active Curse targeting you.';
  end if;

  update public.active_card_effects
  set status = 'vetoed',
      resolved_at = now()
  where id = target_card_effect_id
    and competition_id = target_competition_id;

  update public.league_cards
  set zone = 'discard',
      updated_at = now()
  where id = effect_row.card_instance_id
    and competition_id = target_competition_id
    and owner_user_id = effect_row.played_by_user_id
    and zone in ('hand', 'active');
end;
$$;

grant execute on function public.veto_my_active_curse(uuid, uuid) to authenticated;

commit;
