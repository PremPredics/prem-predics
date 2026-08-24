-- Power of the Veto integrity fix.
-- Enforces the first-kick-off cutoff and atomically consumes a real unused Veto card.

begin;

drop function if exists public.veto_my_active_curse(uuid, uuid);
drop function if exists public.veto_my_active_curse(uuid, uuid, uuid);

create function public.veto_my_active_curse(
  target_competition_id uuid,
  target_card_effect_id uuid,
  target_veto_card_instance_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_user uuid := auth.uid();
  curse_effect record;
  veto_card record;
  target_gameweek_id bigint;
  first_kickoff timestamptz;
  veto_effect_id uuid;
  changed_count integer;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if target_competition_id is null
    or target_card_effect_id is null
    or target_veto_card_instance_id is null
  then
    raise exception 'The league, Curse and Veto card are required.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this league.';
  end if;

  select
    ace.id,
    ace.card_id,
    ace.season_id,
    ace.gameweek_id,
    ace.start_gameweek_id,
    ace.end_gameweek_id,
    ace.target_user_id,
    ace.status,
    ace.card_instance_id,
    ace.played_by_user_id,
    cd.category
    into curse_effect
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_card_effect_id
    and ace.competition_id = target_competition_id
  for update of ace;

  if not found then
    raise exception 'Curse not found.';
  end if;

  if curse_effect.category <> 'curse'
    or curse_effect.status <> 'active'
    or curse_effect.target_user_id <> target_user
  then
    raise exception 'Power of the Veto can only cancel an active Curse targeting you.';
  end if;

  target_gameweek_id := coalesce(curse_effect.start_gameweek_id, curse_effect.gameweek_id);
  if target_gameweek_id is null then
    raise exception 'The Curse has no Gameweek, so its Veto deadline cannot be verified.';
  end if;

  first_kickoff := public.first_fixture_kickoff_at_for_gameweek(
    curse_effect.season_id,
    target_gameweek_id
  );

  if first_kickoff is null then
    raise exception 'The Gameweek first kick-off could not be found, so the Curse cannot be vetoed.';
  end if;

  if clock_timestamp() >= first_kickoff then
    raise exception 'Power of the Veto must be played before the Gameweek''s first kick-off.';
  end if;

  select lc.id, lc.card_id, cd.effect_key
    into veto_card
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = target_veto_card_instance_id
    and lc.competition_id = target_competition_id
    and lc.owner_user_id = target_user
    and lc.zone = 'hand'
  for update of lc;

  if not found or veto_card.effect_key is distinct from 'power_veto' then
    raise exception 'An unused Power of the Veto from your hand is required.';
  end if;

  if exists (
    select 1
    from public.active_card_effects ace
    where ace.competition_id = target_competition_id
      and ace.card_instance_id = target_veto_card_instance_id
      and ace.status in ('active', 'resolved', 'vetoed')
  ) then
    raise exception 'This Power of the Veto has already been used.';
  end if;

  -- Recheck after both rows are locked so waiting on another play cannot cross the deadline.
  first_kickoff := public.first_fixture_kickoff_at_for_gameweek(
    curse_effect.season_id,
    target_gameweek_id
  );
  if first_kickoff is null or clock_timestamp() >= first_kickoff then
    raise exception 'Power of the Veto must be played before the Gameweek''s first kick-off.';
  end if;

  insert into public.active_card_effects (
    competition_id,
    card_instance_id,
    card_id,
    season_id,
    gameweek_id,
    start_gameweek_id,
    end_gameweek_id,
    played_by_user_id,
    target_user_id,
    deadline_at,
    payload,
    status,
    resolved_at
  ) values (
    target_competition_id,
    veto_card.id,
    veto_card.card_id,
    curse_effect.season_id,
    target_gameweek_id,
    target_gameweek_id,
    target_gameweek_id,
    target_user,
    curse_effect.played_by_user_id,
    first_kickoff,
    jsonb_build_object(
      'effect_key', 'power_veto',
      'vetoed_card_effect_id', curse_effect.id,
      'vetoed_card_id', curse_effect.card_id
    ),
    'resolved',
    clock_timestamp()
  )
  returning id into veto_effect_id;

  update public.active_card_effects
  set status = 'vetoed',
      resolved_at = clock_timestamp()
  where id = curse_effect.id
    and competition_id = target_competition_id
    and status = 'active';

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'The Curse changed before it could be vetoed.';
  end if;

  update public.league_cards
  set zone = 'discard',
      updated_at = clock_timestamp()
  where id = curse_effect.card_instance_id
    and competition_id = target_competition_id
    and owner_user_id = curse_effect.played_by_user_id
    and zone in ('hand', 'active');

  update public.league_cards
  set zone = 'discard',
      updated_at = clock_timestamp()
  where id = veto_card.id
    and competition_id = target_competition_id
    and owner_user_id = target_user
    and zone = 'hand';

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'The Power of the Veto changed before it could be used.';
  end if;

  return veto_effect_id;
end;
$$;

revoke all on function public.veto_my_active_curse(uuid, uuid, uuid) from public;
grant execute on function public.veto_my_active_curse(uuid, uuid, uuid) to authenticated;

update public.card_definitions
set description = 'Veto an active Curse targeting you after it is played and before that Gameweek''s first kick-off. Both cards are discarded immediately.'
where effect_key = 'power_veto';

notify pgrst, 'reload schema';

commit;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'veto_my_active_curse';
