-- Allows private leagues to keep accepting members until 90 minutes before the
-- first kickoff of their starting gameweek, then freezes member count and deck.

with first_fixture as (
  select
    c.id as competition_id,
    min(f.kickoff_at) - interval '90 minutes' as member_lock_at
  from public.competitions c
  join public.fixtures f
    on f.season_id = c.season_id
   and f.gameweek_id = c.starts_gameweek_id
  where c.locked_member_count is null
  group by c.id
)
update public.competitions c
set
  member_lock_at = ff.member_lock_at,
  accepts_new_members = case
    when now() < ff.member_lock_at then true
    else c.accepts_new_members
  end
from first_fixture ff
where c.id = ff.competition_id
  and c.member_lock_at is distinct from ff.member_lock_at;

create or replace function public.enforce_competition_max_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_members integer;
  allowed_members integer;
  league_accepts_new_members boolean;
  league_member_lock_at timestamptz;
begin
  select
    case
      when c.member_lock_at is not null and now() < c.member_lock_at then 10
      else c.max_members
    end,
    c.accepts_new_members,
    c.member_lock_at
    into allowed_members, league_accepts_new_members, league_member_lock_at
  from public.competitions c
  where c.id = new.competition_id;

  if new.role <> 'owner' and (
    not coalesce(league_accepts_new_members, false)
    or (league_member_lock_at is not null and now() >= league_member_lock_at)
  ) then
    raise exception 'This private league has already started.';
  end if;

  select count(*)
    into current_members
  from public.competition_members cm
  where cm.competition_id = new.competition_id;

  if current_members >= allowed_members then
    raise exception 'This private league is already full.';
  end if;

  return new;
end;
$$;

create or replace function public.join_competition_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition_id uuid;
  target_max_members integer;
  target_accepts_new_members boolean;
  target_member_lock_at timestamptz;
  existing_member boolean;
  current_members integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a league.';
  end if;

  select
    c.id,
    case
      when c.member_lock_at is not null and now() < c.member_lock_at then 10
      else c.max_members
    end,
    c.accepts_new_members,
    c.member_lock_at
    into target_competition_id, target_max_members, target_accepts_new_members, target_member_lock_at
  from public.competitions c
  where lower(c.join_code) = lower(trim(invite_code))
  limit 1;

  if target_competition_id is null then
    raise exception 'League invite code not found.';
  end if;

  select exists (
    select 1
    from public.competition_members cm
    where cm.competition_id = target_competition_id
      and cm.user_id = auth.uid()
  )
    into existing_member;

  if existing_member then
    return target_competition_id;
  end if;

  if not coalesce(target_accepts_new_members, false)
    or (target_member_lock_at is not null and now() >= target_member_lock_at) then
    raise exception 'This private league has already started.';
  end if;

  select count(*)
    into current_members
  from public.competition_members cm
  where cm.competition_id = target_competition_id;

  if current_members >= target_max_members then
    raise exception 'This private league is already full.';
  end if;

  insert into public.competition_members (competition_id, user_id, role)
  values (target_competition_id, auth.uid(), 'member')
  on conflict (competition_id, user_id) do nothing;

  return target_competition_id;
end;
$$;

create or replace function public.sync_competition_member_lock(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  final_deck_variant_id text;
  target_lock_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to sync a league.';
  end if;

  if not public.is_competition_member(target_competition_id)
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_global_admin = true
    ) then
    raise exception 'You cannot access this league.';
  end if;

  select c.member_lock_at
    into target_lock_at
  from public.competitions c
  where c.id = target_competition_id;

  if target_lock_at is null or now() < target_lock_at then
    return;
  end if;

  select count(*)
    into member_count
  from public.competition_members
  where competition_id = target_competition_id;

  if member_count < 2 then
    raise exception 'A league needs at least two players before it can start.';
  end if;

  final_deck_variant_id := public.deck_variant_for_member_count(member_count);

  update public.competitions
  set
    max_members = member_count,
    deck_variant_id = final_deck_variant_id,
    locked_member_count = member_count,
    locked_deck_variant_id = final_deck_variant_id,
    accepts_new_members = false,
    started_at = coalesce(started_at, now())
  where id = target_competition_id
    and locked_member_count is null;
end;
$$;

grant execute on function public.sync_competition_member_lock(uuid) to authenticated;

update public.card_definitions
set description = 'Draw 3, 4, or 5 Regular Deck cards depending on league size.'
where id = 'super_draw';

with base_quantities (card_id, quantity) as (
  values
    ('power_goal', 2),
    ('power_swap', 3),
    ('power_veto', 3),
    ('power_laundrette', 2),
    ('power_rocket_man', 3),
    ('power_pessimist', 1),
    ('power_immigrants', 2),
    ('power_lanky_crouch', 2),
    ('power_small_and_mighty', 2),
    ('power_of_god', 2),
    ('power_hedge', 2),
    ('power_assist_king', 1),
    ('power_late_scout', 3),
    ('power_snow', 2),
    ('curse_hated', 2),
    ('curse_gambler', 2),
    ('curse_bench_warmer', 2),
    ('curse_alphabet_15', 1),
    ('curse_alphabet_20', 1),
    ('curse_scoring_drought_3', 1),
    ('curse_scoring_drought_5', 1),
    ('curse_random_roulette', 2),
    ('curse_glasses', 2),
    ('curse_deleted_match', 2),
    ('curse_tiny_club', 2),
    ('curse_thief', 2),
    ('curse_even_number', 1),
    ('curse_odd_number', 1),
    ('super_star_man', 1),
    ('super_golden_gameweek', 1),
    ('super_sub', 1),
    ('super_score', 1),
    ('super_draw', 1),
    ('super_duo', 1),
    ('super_pen', 1),
    ('game_goals', 1),
    ('game_corners', 1),
    ('game_underdog', 1),
    ('game_goalhanger', 1),
    ('game_war', 1),
    ('game_early_worm', 1),
    ('game_time', 1)
),
variant_scale (deck_variant_id, regular_multiplier) as (
  values
    ('players_2_3', 1),
    ('players_4_6', 2),
    ('players_7_10', 3)
)
insert into public.card_deck_cards (deck_variant_id, card_id, quantity)
select
  vs.deck_variant_id,
  bq.card_id,
  case
    when cd.deck_type = 'regular' then bq.quantity * vs.regular_multiplier
    else bq.quantity
  end as quantity
from variant_scale vs
cross join base_quantities bq
join public.card_definitions cd on cd.id = bq.card_id
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;

create or replace function public.ensure_league_card_decks(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_deck_variant text;
  member_count integer;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if auth.uid() is not null
    and not (public.is_admin() or public.is_competition_member(target_competition_id)) then
    raise exception 'You are not a member of this private league.';
  end if;

  select count(*)
    into member_count
  from public.competition_members
  where competition_id = target_competition_id;

  target_deck_variant := coalesce(
    target_competition.locked_deck_variant_id,
    public.deck_variant_for_member_count(least(10, greatest(2, member_count))),
    'players_2'
  );

  with desired as (
    select cdc.card_id, cdc.quantity
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    where cdc.deck_variant_id = target_deck_variant
      and cd.deck_type in ('regular', 'premium')
  ),
  existing as (
    select lc.card_id, count(*) as current_count
    from public.league_cards lc
    where lc.competition_id = target_competition_id
    group by lc.card_id
  ),
  removable as (
    select
      lc.id,
      row_number() over (partition by lc.card_id order by lc.created_at desc, lc.id) as removable_rank,
      greatest(coalesce(e.current_count, 0) - coalesce(d.quantity, 0), 0) as surplus_count
    from public.league_cards lc
    left join desired d on d.card_id = lc.card_id
    left join existing e on e.card_id = lc.card_id
    join public.card_definitions cd on cd.id = lc.card_id
    where lc.competition_id = target_competition_id
      and lc.owner_user_id is null
      and lc.zone in ('regular_deck', 'premium_deck')
      and cd.deck_type in ('regular', 'premium')
  )
  delete from public.league_cards lc
  using removable r
  where lc.id = r.id
    and r.removable_rank <= r.surplus_count;

  insert into public.league_cards (competition_id, card_id, zone, sort_order, source)
  select
    target_competition_id,
    desired.card_id,
    case desired.deck_type
      when 'premium' then 'premium_deck'
      else 'regular_deck'
    end,
    row_number() over (order by random())
      + coalesce((select max(sort_order) from public.league_cards where competition_id = target_competition_id), 0),
    case
      when target_competition.locked_deck_variant_id is null then 'deck_seed'
      else 'deck_top_up_' || target_deck_variant
    end
  from (
    select
      cdc.card_id,
      cd.deck_type,
      greatest(cdc.quantity - count(lc.id), 0) as missing_count
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    left join public.league_cards lc
      on lc.competition_id = target_competition_id
     and lc.card_id = cdc.card_id
    where cdc.deck_variant_id = target_deck_variant
      and cd.deck_type in ('regular', 'premium')
    group by cdc.card_id, cd.deck_type, cdc.quantity
  ) desired
  cross join lateral generate_series(1, desired.missing_count)
  where desired.missing_count > 0;
end;
$$;

grant execute on function public.ensure_league_card_decks(uuid) to authenticated;

create or replace function public.leave_competition_before_start(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  target_member_lock_at timestamptz;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to leave a league.';
  end if;

  select cm.role, c.member_lock_at
    into current_role, target_member_lock_at
  from public.competition_members cm
  join public.competitions c on c.id = cm.competition_id
  where cm.competition_id = target_competition_id
    and cm.user_id = auth.uid();

  if current_role is null then
    raise exception 'You are not a member of this league.';
  end if;

  if target_member_lock_at is not null and now() >= target_member_lock_at then
    raise exception 'You cannot leave a league after its first gameweek has started.';
  end if;

  select count(*)
    into member_count
  from public.competition_members
  where competition_id = target_competition_id;

  if current_role = 'owner' then
    if member_count > 1 then
      raise exception 'The owner cannot leave while other players are still in the league.';
    end if;

    delete from public.competitions
    where id = target_competition_id
      and owner_id = auth.uid();

    return;
  end if;

  update public.active_card_effects
  set status = 'removed',
      resolved_at = now()
  where competition_id = target_competition_id
    and played_by_user_id = auth.uid()
    and status = 'active';

  update public.league_cards lc
  set owner_user_id = null,
      zone = case cd.deck_type
        when 'premium' then 'premium_deck'
        else 'regular_deck'
      end,
      source = 'returned_prestart_leave',
      updated_at = now()
  from public.card_definitions cd
  where cd.id = lc.card_id
    and lc.competition_id = target_competition_id
    and lc.owner_user_id = auth.uid()
    and cd.deck_type in ('regular', 'premium');

  delete from public.competition_members
  where competition_id = target_competition_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_competition_before_start(uuid) to authenticated;
