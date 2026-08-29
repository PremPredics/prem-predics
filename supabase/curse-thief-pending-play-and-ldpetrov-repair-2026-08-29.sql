-- Curse of the Thief pending-play lifecycle + one exact live repair.
-- Run this whole file once in Supabase SQL Editor (Ctrl+A, then Run).
-- This is one atomic statement and is safe to run again.
--
-- Future lifecycle:
--   1. Play validates the live Curse deadline and marks the Thief pending/Used.
--   2. No target or opponent card changes yet.
--   3. Confirming one specific eligible opponent card atomically assigns the
--      target, transfers that card, resolves the effect and discards the Thief.
--   4. An incomplete pending Thief is cancelled at the Curse deadline, making
--      its still-in-hand card unused again on the next live refresh.
--
-- Exact repair scope (no guessing): ldpetrov in PREM PREDICS 26/27. It only
-- cancels one incomplete active targetless Thief whose linked card is still in
-- that user's hand. No card/effect row is deleted and no unrelated data changes.

do $thief_pending_migration$
declare
  repair_competition_id uuid;
  repair_competition_match_count integer;
  repair_user_id uuid;
  repair_user_match_count integer;
  repair_effect_id uuid;
  repair_match_count integer;
begin
  update public.card_definitions
  set description = 'Play before the Curse deadline, then select one eligible Regular Card directly from another user''s hand. The card stays Used while the steal is pending, is discarded when the steal succeeds, and returns unused if the deadline passes. Cannot steal Super Cards.'
  where effect_key = 'curse_thief'
    and description is distinct from 'Play before the Curse deadline, then select one eligible Regular Card directly from another user''s hand. The card stays Used while the steal is pending, is discarded when the steal succeeds, and returns unused if the deadline passes. Cannot steal Super Cards.';

  create or replace function public.enforce_curse_target_rules()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  as $trigger_function$
  declare
    card_category text;
    card_effect_key text;
    target_gameweek_id bigint;
    target_gameweek_number integer;
    member_count integer;
    active_curse_count integer;
    previous_target_user_id uuid;
    trusted_thief_target_completion boolean := false;
  begin
    if tg_op = 'UPDATE' and new.target_user_id is distinct from old.target_user_id then
      select cd.effect_key
        into card_effect_key
      from public.card_definitions cd
      where cd.id = old.card_id;

      trusted_thief_target_completion :=
        card_effect_key = 'curse_thief'
        and old.status = 'active'
        and new.status = 'active'
        and old.target_user_id is null
        and new.target_user_id is not null
        and current_setting('app.curse_thief_completion_effect_id', true) = old.id::text;
    end if;

    if tg_op = 'UPDATE' then
      if auth.uid() is not null
        and not public.is_admin()
        and (
          new.competition_id is distinct from old.competition_id
          or new.card_instance_id is distinct from old.card_instance_id
          or new.card_id is distinct from old.card_id
          or new.season_id is distinct from old.season_id
          or new.gameweek_id is distinct from old.gameweek_id
          or new.start_gameweek_id is distinct from old.start_gameweek_id
          or new.end_gameweek_id is distinct from old.end_gameweek_id
          or new.played_by_user_id is distinct from old.played_by_user_id
          or (
            new.target_user_id is distinct from old.target_user_id
            and not trusted_thief_target_completion
          )
        )
      then
        raise exception 'A played card''s owner, target and Gameweek cannot be changed.';
      end if;
    end if;

    if coalesce(new.status, 'active') <> 'active' or new.target_user_id is null then
      return new;
    end if;

    select cd.category
      into card_category
    from public.card_definitions cd
    where cd.id = new.card_id;

    if card_category is distinct from 'curse'
      or new.target_user_id = new.played_by_user_id
    then
      return new;
    end if;

    target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
    if target_gameweek_id is null then
      raise exception 'A Curse Card must have a Gameweek.';
    end if;

    select gw.number
      into target_gameweek_number
    from public.gameweeks gw
    where gw.id = target_gameweek_id
      and gw.season_id = new.season_id;

    if target_gameweek_number is null then
      raise exception 'The Curse Card Gameweek does not belong to this season.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'curse-target-cap:' || new.competition_id::text || ':' || new.target_user_id::text || ':' || target_gameweek_id::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'curse-target-order:' || new.competition_id::text || ':' || new.played_by_user_id::text || ':' || target_gameweek_id::text,
        0
      )
    );

    select count(*)::integer
      into active_curse_count
    from public.active_card_effects ace
    join public.card_definitions cd
      on cd.id = ace.card_id
     and cd.category = 'curse'
    join public.gameweeks start_gw
      on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
     and start_gw.season_id = ace.season_id
    join public.gameweeks end_gw
      on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
     and end_gw.season_id = ace.season_id
    where ace.id is distinct from new.id
      and ace.competition_id = new.competition_id
      and ace.season_id = new.season_id
      and ace.target_user_id = new.target_user_id
      and ace.target_user_id is distinct from ace.played_by_user_id
      and ace.status = 'active'
      and target_gameweek_number between start_gw.number and end_gw.number;

    if active_curse_count >= 3 then
      raise exception 'This player already has the maximum of 3 active Curse Cards.';
    end if;

    select count(*)::integer
      into member_count
    from public.competition_members cm
    where cm.competition_id = new.competition_id;

    if member_count >= 3 then
      select ace.target_user_id
        into previous_target_user_id
      from public.active_card_effects ace
      join public.card_definitions cd
        on cd.id = ace.card_id
       and cd.category = 'curse'
      where ace.id is distinct from new.id
        and ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.target_user_id is not null
        and ace.target_user_id is distinct from ace.played_by_user_id
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and lower(coalesce(ace.status, '')) not in ('cancelled', 'removed')
      order by ace.played_at desc, ace.id desc
      limit 1;

      if previous_target_user_id = new.target_user_id then
        raise exception 'Your next Curse this Gameweek must target a different player.';
      end if;
    end if;

    return new;
  end;
  $trigger_function$;

  drop trigger if exists active_card_effects_enforce_curse_target_rules
  on public.active_card_effects;
  create trigger active_card_effects_enforce_curse_target_rules
  before insert or update of competition_id, card_instance_id, card_id, season_id,
    gameweek_id, start_gameweek_id, end_gameweek_id, played_by_user_id,
    target_user_id, status
  on public.active_card_effects
  for each row execute function public.enforce_curse_target_rules();

  create or replace function public.begin_curse_thief_play(
    target_competition_id uuid,
    target_thief_card_instance_id uuid,
    target_gameweek_id bigint
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  as $begin_function$
  declare
    target_user uuid := auth.uid();
    competition_row record;
    thief_row record;
    first_kickoff timestamptz;
    curse_deadline timestamptz;
    created_effect_id uuid;
  begin
    if target_user is null then
      raise exception 'You must be logged in.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('curse-thief-play:' || target_competition_id::text, 0)
    );

    select c.id, c.season_id
      into competition_row
    from public.competitions c
    where c.id = target_competition_id;

    if competition_row.id is null then
      raise exception 'Private league not found.';
    end if;

    if not exists (
      select 1 from public.competition_members cm
      where cm.competition_id = target_competition_id and cm.user_id = target_user
    ) then
      raise exception 'You are not a member of this private league.';
    end if;

    if not exists (
      select 1 from public.gameweeks gw
      where gw.id = target_gameweek_id and gw.season_id = competition_row.season_id
    ) then
      raise exception 'The selected Gameweek does not belong to this private league season.';
    end if;

    select min(f.kickoff_at) filter (where lower(coalesce(f.status, '')) <> 'postponed')
      into first_kickoff
    from public.fixtures f
    where f.season_id = competition_row.season_id
      and f.gameweek_id = target_gameweek_id;

    if first_kickoff is null then
      raise exception 'The Gameweek first kick-off could not be found.';
    end if;
    curse_deadline := first_kickoff - interval '24 hours';
    if now() >= curse_deadline and not public.is_admin() then
      raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
    end if;

    select lc.id, lc.card_id, lc.owner_user_id, lc.zone, cd.effect_key
      into thief_row
    from public.league_cards lc
    join public.card_definitions cd on cd.id = lc.card_id
    where lc.id = target_thief_card_instance_id
      and lc.competition_id = target_competition_id
    for update of lc;

    if thief_row.id is null
      or thief_row.owner_user_id is distinct from target_user
      or thief_row.zone is distinct from 'hand'
      or thief_row.effect_key is distinct from 'curse_thief'
    then
      raise exception 'Curse of the Thief is no longer unused in your hand.';
    end if;

    if exists (
      select 1 from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id and cd.effect_key = 'curse_thief'
      where ace.competition_id = target_competition_id
        and ace.played_by_user_id = target_user
        and ace.status = 'active'
        and ace.target_user_id is null
    ) then
      raise exception 'Finish your pending Curse of the Thief before playing another card.';
    end if;

    insert into public.active_card_effects (
      competition_id, card_instance_id, card_id, season_id, gameweek_id,
      start_gameweek_id, end_gameweek_id, played_by_user_id, target_user_id,
      deadline_at, status, payload
    ) values (
      target_competition_id, thief_row.id, thief_row.card_id,
      competition_row.season_id, target_gameweek_id, target_gameweek_id,
      target_gameweek_id, target_user, null, curse_deadline, 'active',
      jsonb_build_object('effect_key', 'curse_thief', 'steal_pending', true)
    ) returning id into created_effect_id;

    return jsonb_build_object(
      'id', created_effect_id,
      'card_instance_id', thief_row.id,
      'card_id', thief_row.card_id,
      'played_by_user_id', target_user,
      'target_user_id', null,
      'gameweek_id', target_gameweek_id,
      'start_gameweek_id', target_gameweek_id,
      'status', 'active',
      'deadline_at', curse_deadline,
      'first_fixture_kickoff_at', first_kickoff
    );
  end;
  $begin_function$;

  create or replace function public.complete_curse_thief_steal(
    target_competition_id uuid,
    target_source_card_effect_id uuid,
    target_stolen_card_instance_id uuid
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  as $complete_function$
  declare
    target_user uuid := auth.uid();
    effect_row record;
    stolen_row record;
    pending_swap_row record;
    effective_deadline timestamptz;
    remaining_swap_cards integer;
    discard_order integer;
    changed_count integer;
  begin
    if target_user is null then
      raise exception 'You must be logged in.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('curse-thief-play:' || target_competition_id::text, 0)
    );

    select ace.*, cd.effect_key
      into effect_row
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = target_source_card_effect_id
      and ace.competition_id = target_competition_id
      and ace.played_by_user_id = target_user
    for update of ace;

    if effect_row.id is null
      or effect_row.effect_key is distinct from 'curse_thief'
      or effect_row.status is distinct from 'active'
      or effect_row.target_user_id is not null
    then
      raise exception 'Curse of the Thief is not pending.';
    end if;

    effective_deadline := coalesce(effect_row.deadline_at, (
      select min(f.kickoff_at) filter (where lower(coalesce(f.status, '')) <> 'postponed') - interval '24 hours'
      from public.fixtures f
      where f.season_id = effect_row.season_id
        and f.gameweek_id = coalesce(effect_row.start_gameweek_id, effect_row.gameweek_id)
    ));

    if effective_deadline is null or now() >= effective_deadline then
      update public.active_card_effects
      set status = 'cancelled',
          resolved_at = now(),
          payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
            'steal_pending', false,
            'expired_uncompleted', true
          )
      where id = effect_row.id and status = 'active' and target_user_id is null;

      return jsonb_build_object(
        'expired', true,
        'id', effect_row.id,
        'card_instance_id', effect_row.card_instance_id,
        'deadline_at', effective_deadline
      );
    end if;

    select lc.id, lc.card_id, lc.owner_user_id, lc.zone,
           cd.name, cd.category, cd.deck_type
      into stolen_row
    from public.league_cards lc
    join public.card_definitions cd on cd.id = lc.card_id
    where lc.id = target_stolen_card_instance_id
      and lc.competition_id = target_competition_id
    for update of lc;

    if stolen_row.id is null or stolen_row.zone is distinct from 'hand' then
      raise exception 'The selected card is no longer available to steal.';
    end if;
    if stolen_row.owner_user_id is null
      or stolen_row.owner_user_id = target_user
      or not exists (
        select 1 from public.competition_members cm
        where cm.competition_id = target_competition_id
          and cm.user_id = stolen_row.owner_user_id
      )
    then
      raise exception 'You must select another league member''s card.';
    end if;
    if stolen_row.deck_type = 'premium' or stolen_row.category = 'super' then
      raise exception 'Curse of the Thief cannot steal Super Cards.';
    end if;
    if exists (
      select 1
      from public.active_card_effects ace
      where ace.competition_id = target_competition_id
        and ace.card_instance_id = stolen_row.id
        and ace.status = 'active'
    ) then
      raise exception 'That card is already Used or committed to another active card effect.';
    end if;

    select ace.id, ace.card_instance_id
      into pending_swap_row
    from public.active_card_effects ace
    join public.card_definitions cd
      on cd.id = ace.card_id and cd.effect_key = 'power_swap'
    where ace.competition_id = target_competition_id
      and ace.season_id = effect_row.season_id
      and ace.played_by_user_id = stolen_row.owner_user_id
      and ace.status = 'active'
    order by ace.played_at desc, ace.id desc
    limit 1;

    if pending_swap_row.id is not null
      and not exists (
        select 1 from public.card_draw_events cde
        where cde.competition_id = target_competition_id
          and cde.user_id = stolen_row.owner_user_id
          and cde.source_card_effect_id = pending_swap_row.id
      )
    then
      select count(*)::integer into remaining_swap_cards
      from public.league_cards lc
      where lc.competition_id = target_competition_id
        and lc.owner_user_id = stolen_row.owner_user_id
        and lc.zone = 'hand'
        and lc.id is distinct from pending_swap_row.card_instance_id;
      if remaining_swap_cards <= 1 then
        raise exception 'That player is completing Power of the Swap and must keep one card available to discard.';
      end if;
    end if;

    perform set_config('app.curse_thief_completion_effect_id', effect_row.id::text, true);
    update public.active_card_effects
    set target_user_id = stolen_row.owner_user_id
    where id = effect_row.id and status = 'active' and target_user_id is null;
    get diagnostics changed_count = row_count;
    if changed_count <> 1 then
      raise exception 'Curse of the Thief changed before the steal could be confirmed.';
    end if;

    update public.league_cards
    set owner_user_id = target_user, updated_at = now()
    where id = stolen_row.id
      and competition_id = target_competition_id
      and owner_user_id = stolen_row.owner_user_id
      and zone = 'hand';
    get diagnostics changed_count = row_count;
    if changed_count <> 1 then
      raise exception 'The selected card changed before it could be stolen.';
    end if;

    update public.active_card_effects
    set status = 'resolved',
        resolved_at = now(),
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'steal_pending', false,
          'stolen_card_instance_id', stolen_row.id,
          'stolen_card_id', stolen_row.card_id
        )
    where id = effect_row.id and status = 'active';
    get diagnostics changed_count = row_count;
    if changed_count <> 1 then
      raise exception 'Curse of the Thief could not be completed.';
    end if;

    select coalesce(max(lc.sort_order), 0) + 1 into discard_order
    from public.league_cards lc
    where lc.competition_id = target_competition_id and lc.zone = 'discard';

    update public.league_cards
    set zone = 'discard', sort_order = discard_order, updated_at = now()
    where id = effect_row.card_instance_id
      and competition_id = target_competition_id
      and owner_user_id = target_user
      and zone = 'hand';
    get diagnostics changed_count = row_count;
    if changed_count <> 1 then
      raise exception 'Curse of the Thief changed before it could be discarded.';
    end if;

    return jsonb_build_object(
      'expired', false,
      'id', effect_row.id,
      'card_instance_id', effect_row.card_instance_id,
      'card_id', effect_row.card_id,
      'played_by_user_id', target_user,
      'target_user_id', stolen_row.owner_user_id,
      'gameweek_id', effect_row.gameweek_id,
      'start_gameweek_id', effect_row.start_gameweek_id,
      'status', 'resolved',
      'deadline_at', effective_deadline,
      'stolen_card_instance_id', stolen_row.id,
      'stolen_card_id', stolen_row.card_id,
      'stolen_card_name', stolen_row.name,
      'previous_owner_user_id', stolen_row.owner_user_id
    );
  end;
  $complete_function$;

  create or replace function public.expire_my_incomplete_curse_thief_plays(
    target_competition_id uuid
  )
  returns integer
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  as $expire_function$
  declare
    target_user uuid := auth.uid();
    expired_count integer;
  begin
    if target_user is null then
      raise exception 'You must be logged in.';
    end if;
    if not exists (
      select 1 from public.competition_members cm
      where cm.competition_id = target_competition_id and cm.user_id = target_user
    ) then
      raise exception 'You are not a member of this private league.';
    end if;

    update public.active_card_effects ace
    set status = 'cancelled',
        resolved_at = now(),
        payload = coalesce(ace.payload, '{}'::jsonb) || jsonb_build_object(
          'steal_pending', false,
          'expired_uncompleted', true
        )
    from public.card_definitions cd
    where ace.card_id = cd.id
      and cd.effect_key = 'curse_thief'
      and ace.competition_id = target_competition_id
      and ace.played_by_user_id = target_user
      and ace.status = 'active'
      and ace.target_user_id is null
      and now() >= coalesce(ace.deadline_at, (
        select min(f.kickoff_at) filter (where lower(coalesce(f.status, '')) <> 'postponed') - interval '24 hours'
        from public.fixtures f
        where f.season_id = ace.season_id
          and f.gameweek_id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
      ));

    get diagnostics expired_count = row_count;
    return expired_count;
  end;
  $expire_function$;

  revoke all on function public.enforce_curse_target_rules() from public;
  revoke all on function public.begin_curse_thief_play(uuid, uuid, bigint) from public;
  revoke all on function public.complete_curse_thief_steal(uuid, uuid, uuid) from public;
  revoke all on function public.expire_my_incomplete_curse_thief_plays(uuid) from public;
  grant execute on function public.begin_curse_thief_play(uuid, uuid, bigint) to authenticated;
  grant execute on function public.complete_curse_thief_steal(uuid, uuid, uuid) to authenticated;
  grant execute on function public.expire_my_incomplete_curse_thief_plays(uuid) to authenticated;

  select count(*)::integer, (array_agg(c.id order by c.id))[1]
    into repair_competition_match_count, repair_competition_id
  from public.competitions c
  where lower(btrim(c.name)) = lower('PREM PREDICS 26/27');
  if repair_competition_match_count = 0 then
    raise exception 'Repair stopped: private league PREM PREDICS 26/27 was not found.';
  elsif repair_competition_match_count > 1 then
    raise exception 'Repair stopped: multiple private leagues named PREM PREDICS 26/27 were found; nothing was changed.';
  end if;

  select count(*)::integer, (array_agg(p.id order by p.id))[1]
    into repair_user_match_count, repair_user_id
  from public.profiles p
  where lower(btrim(p.display_name)) = lower('ldpetrov');
  if repair_user_match_count = 0 then
    raise exception 'Repair stopped: profile ldpetrov was not found.';
  elsif repair_user_match_count > 1 then
    raise exception 'Repair stopped: multiple profiles named ldpetrov were found; nothing was changed.';
  end if;
  if not exists (
    select 1 from public.competition_members cm
    where cm.competition_id = repair_competition_id and cm.user_id = repair_user_id
  ) then
    raise exception 'Repair stopped: ldpetrov is not a member of PREM PREDICS 26/27.';
  end if;

  select count(*)::integer, (array_agg(ace.id order by ace.id))[1]
    into repair_match_count, repair_effect_id
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id and cd.effect_key = 'curse_thief'
  join public.league_cards lc on lc.id = ace.card_instance_id and lc.competition_id = ace.competition_id
  where ace.competition_id = repair_competition_id
    and ace.played_by_user_id = repair_user_id
    and ace.status = 'active'
    and ace.target_user_id is null
    and lc.owner_user_id = repair_user_id
    and lc.zone = 'hand';

  if repair_match_count > 1 then
    raise exception 'Repair stopped: multiple incomplete ldpetrov Thief effects matched; nothing was changed.';
  elsif repair_match_count = 1 then
    update public.active_card_effects
    set status = 'cancelled', resolved_at = now(),
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'repair_key', 'ldpetrov_thief_pending_20260829',
          'repair_reason', 'Returned incomplete Thief play to unused hand state'
        )
    where id = repair_effect_id and status = 'active' and target_user_id is null;
    if not found then
      raise exception 'Repair stopped: the incomplete Thief changed while being repaired.';
    end if;
    raise notice 'Repaired ldpetrov Curse of the Thief effect %; linked card is unused in hand.', repair_effect_id;
  elsif exists (
    select 1 from public.active_card_effects ace
    where ace.competition_id = repair_competition_id
      and ace.played_by_user_id = repair_user_id
      and ace.status = 'cancelled'
      and ace.payload ->> 'repair_key' = 'ldpetrov_thief_pending_20260829'
  ) then
    raise notice 'ldpetrov Curse of the Thief was already repaired; no data changed.';
  else
    raise exception 'Repair stopped: no exact incomplete ldpetrov Thief effect matched; nothing was changed.';
  end if;

  perform pg_notify('pgrst', 'reload schema');
end
$thief_pending_migration$;

-- Read-only verification after success:
-- select c.name, p.display_name, lc.id as card_instance_id, lc.zone,
--        ace.id as effect_id, ace.status, ace.target_user_id, ace.deadline_at, ace.payload
-- from public.competitions c
-- join public.profiles p on lower(p.display_name) = lower('ldpetrov')
-- join public.league_cards lc on lc.competition_id = c.id and lc.owner_user_id = p.id
-- join public.card_definitions cd on cd.id = lc.card_id and cd.effect_key = 'curse_thief'
-- left join public.active_card_effects ace on ace.card_instance_id = lc.id
-- where lower(c.name) = lower('PREM PREDICS 26/27')
-- order by ace.played_at desc nulls last;
