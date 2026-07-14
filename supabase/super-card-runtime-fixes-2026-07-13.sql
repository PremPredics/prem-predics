-- Super card runtime fixes.
-- Run this once in Supabase SQL Editor before testing the updated website/app.
--
-- 1. Super Sub may be completed after the standard 90-minute deadline, provided
--    the replacement player's first match in the Gameweek has not kicked off.
-- 2. Super Sub activation, Star Man replacement, audit payload, and card discard
--    are committed atomically. This also repairs an older half-played Super Sub
--    whose active effect exists while its card is still in the user's hand.
-- 3. Super Draw uses the canonical five-card wording.

begin;

update public.card_definitions
set description = 'Draw 5 Regular Cards from the Regular Deck.'
where effect_key = 'super_draw';

create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
  league_start_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
  non_stacking_effect_keys text[] := array[
    'power_laundrette',
    'power_clean_sweep',
    'power_pessimist',
    'power_immigrants',
    'power_lanky_crouch',
    'power_small_and_mighty',
    'power_assist_king',
    'power_late_scout',
    'power_snow',
    'super_star_man',
    'super_golden_gameweek',
    'super_sub',
    'super_score',
    'super_duo',
    'super_pen'
  ];
begin
  select category, effect_key, name
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  select starts_gameweek_id
    into league_start_gameweek_id
  from public.competitions
  where id = new.competition_id;

  if league_start_gameweek_id is not null
    and exists (
      select 1
      from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = league_start_gameweek_id
        and lower(coalesce(f.status, '')) not in ('completed', 'finished', 'full_time', 'ft')
        and (f.kickoff_at is null or now() < f.kickoff_at + interval '3 hours')
    )
    and not public.is_admin()
  then
    raise exception 'Cards can only be played once the first week in your private league has ended.';
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  if card_row.effect_key = any(non_stacking_effect_keys)
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = card_row.effect_key
    )
    and not public.is_admin()
  then
    raise exception '% cannot be played more than once within a Gameweek', coalesce(card_row.name, 'This card');
  end if;

  if card_row.effect_key in ('power_lanky_crouch', 'power_small_and_mighty')
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'power_lanky_crouch' and cd.effect_key = 'power_small_and_mighty')
          or (card_row.effect_key = 'power_small_and_mighty' and cd.effect_key = 'power_lanky_crouch')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Lanky Crouch and Power of the Small and Mighty cannot be active at the same time.';
  end if;

  if card_row.effect_key in ('curse_gambler', 'curse_even_number', 'curse_odd_number')
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.target_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'curse_gambler' and cd.effect_key in ('curse_even_number', 'curse_odd_number'))
          or (card_row.effect_key in ('curse_even_number', 'curse_odd_number') and cd.effect_key = 'curse_gambler')
          or (card_row.effect_key = 'curse_even_number' and cd.effect_key = 'curse_odd_number')
          or (card_row.effect_key = 'curse_odd_number' and cd.effect_key = 'curse_even_number')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Curse of the Random cannot be combined with Curse of the Even/Odd Number.';
  end if;

  if card_row.effect_key = 'curse_deleted_match'
    and new.fixture_id is not null
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.target_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'power_hedge'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  if card_row.effect_key = 'power_hedge'
    and new.fixture_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.played_by_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'curse_deleted_match'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.effect_key in (
    'power_swap',
    'power_veto',
    'power_of_god',
    'power_late_scout',
    'super_draw',
    'super_golden_gameweek',
    'super_pen',
    'super_sub'
  ) then
    return new;
  end if;

  if card_row.category = 'curse' then
    play_deadline := first_kickoff - interval '24 hours';
  else
    play_deadline := coalesce(
      public.star_man_lock_at_for_gameweek(new.season_id, target_gameweek_id),
      first_kickoff - interval '90 minutes'
    );
  end if;

  if now() >= play_deadline and not public.is_admin() then
    if card_row.category = 'curse' then
      raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
    end if;
    if card_row.category = 'super' then
      raise exception 'Super cards must be played before the 90-minute gameweek deadline.';
    end if;
    raise exception 'Power cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_card_play_deadline on public.active_card_effects;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();

create or replace function public.play_super_sub_and_save_pick(
  target_competition_id uuid,
  target_card_instance_id uuid,
  target_gameweek_id bigint,
  target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  target_season_id uuid;
  target_card record;
  target_effect_id uuid;
  target_existing_pick_id uuid;
  target_old_player_id uuid;
  target_old_player_name text := 'N/A';
  target_new_player_name text;
  target_discard_order integer;
begin
  if target_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  select c.season_id
    into target_season_id
  from public.competitions c
  where c.id = target_competition_id;

  if target_season_id is null then
    raise exception 'Private league not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  if not exists (
    select 1
    from public.gameweeks gw
    where gw.id = target_gameweek_id
      and gw.season_id = target_season_id
  ) then
    raise exception 'The active Gameweek could not be found.';
  end if;

  select
    lc.id,
    lc.card_id,
    lc.owner_user_id,
    lc.zone,
    cd.effect_key,
    cd.name as card_name
  into target_card
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = target_card_instance_id
    and lc.competition_id = target_competition_id
  for update of lc;

  if not found then
    raise exception 'Super Sub card not found.';
  end if;

  if target_card.owner_user_id is distinct from target_user_id then
    raise exception 'You can only play a Super Sub from your own hand.';
  end if;

  if target_card.effect_key <> 'super_sub' then
    raise exception 'The selected card is not Super Sub.';
  end if;

  select p.display_name
    into target_new_player_name
  from public.players p
  where p.id = target_player_id
    and p.is_active = true;

  if target_new_player_name is null then
    raise exception 'Choose an active replacement Star Man.';
  end if;

  select smp.id, smp.player_id, coalesce(p.display_name, 'N/A')
    into target_existing_pick_id, target_old_player_id, target_old_player_name
  from public.star_man_picks smp
  left join public.players p on p.id = smp.player_id
  where smp.competition_id = target_competition_id
    and smp.season_id = target_season_id
    and smp.gameweek_id = target_gameweek_id
    and smp.user_id = target_user_id
    and smp.pick_slot = 'primary'
  limit 1;

  if target_old_player_id is not null and target_old_player_id = target_player_id then
    raise exception 'Choose a different player from your current Star Man.';
  end if;

  if exists (
    select 1
    from public.star_man_picks smp
    where smp.competition_id = target_competition_id
      and smp.season_id = target_season_id
      and smp.user_id = target_user_id
      and smp.player_id = target_player_id
      and smp.id is distinct from target_existing_pick_id
  ) then
    raise exception '% has already been used as your Star Man this season.', target_new_player_name;
  end if;

  select ace.id
    into target_effect_id
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.competition_id = target_competition_id
    and ace.season_id = target_season_id
    and ace.card_instance_id = target_card_instance_id
    and ace.played_by_user_id = target_user_id
    and ace.status = 'active'
    and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
    and cd.effect_key = 'super_sub'
  order by ace.played_at desc
  limit 1
  for update of ace;

  if target_effect_id is null then
    if target_card.zone <> 'hand' then
      raise exception 'Super Sub is no longer available in your hand.';
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
      payload,
      status
    ) values (
      target_competition_id,
      target_card_instance_id,
      target_card.card_id,
      target_season_id,
      target_gameweek_id,
      target_gameweek_id,
      target_gameweek_id,
      target_user_id,
      target_user_id,
      jsonb_build_object(
        'replacement_player_id', target_player_id,
        'replacement_player_name', target_new_player_name,
        'pending', true
      ),
      'active'
    )
    returning id into target_effect_id;
  elsif target_card.zone not in ('hand', 'discard') then
    raise exception 'Super Sub is not in a state that can be completed.';
  end if;

  if not public.can_submit_star_man_pick(
    target_competition_id,
    target_season_id,
    target_gameweek_id,
    target_user_id,
    target_player_id,
    'primary',
    target_effect_id
  ) then
    raise exception '% cannot be selected because their team has already kicked off or they have no fixture in this Gameweek.', target_new_player_name;
  end if;

  insert into public.star_man_picks (
    competition_id,
    season_id,
    gameweek_id,
    user_id,
    player_id,
    pick_slot,
    source_card_effect_id,
    picked_at,
    updated_at
  ) values (
    target_competition_id,
    target_season_id,
    target_gameweek_id,
    target_user_id,
    target_player_id,
    'primary',
    target_effect_id,
    now(),
    now()
  )
  on conflict (competition_id, gameweek_id, user_id, pick_slot)
  do update set
    player_id = excluded.player_id,
    source_card_effect_id = excluded.source_card_effect_id,
    picked_at = now(),
    updated_at = now();

  update public.active_card_effects
  set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'previous_player_id', target_old_player_id,
    'previous_player_name', coalesce(target_old_player_name, 'N/A'),
    'replacement_player_id', target_player_id,
    'replacement_player_name', target_new_player_name,
    'pending', false,
    'completed_at', now()
  )
  where id = target_effect_id;

  select coalesce(max(lc.sort_order), 0) + 1
    into target_discard_order
  from public.league_cards lc
  where lc.competition_id = target_competition_id
    and lc.zone = 'discard';

  update public.league_cards
  set zone = 'discard',
      sort_order = target_discard_order,
      updated_at = now()
  where id = target_card_instance_id
    and competition_id = target_competition_id
    and owner_user_id = target_user_id;

  if not found then
    raise exception 'Super Sub could not be moved to the used/discard pile.';
  end if;

  return jsonb_build_object(
    'effect_id', target_effect_id,
    'old_player_name', coalesce(target_old_player_name, 'N/A'),
    'new_player_name', target_new_player_name
  );
end;
$$;

revoke all on function public.play_super_sub_and_save_pick(uuid, uuid, bigint, uuid) from public;
grant execute on function public.play_super_sub_and_save_pick(uuid, uuid, bigint, uuid) to authenticated;

commit;

