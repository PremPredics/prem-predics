-- Prem Predics exact player-count deck migration
-- Uses the existing 52-card regular deck as the 2-player baseline.
-- Regular deck size becomes 26 cards per player:
-- 2=52, 3=78, 4=104, 5=130, 6=156, 7=182, 8=208, 9=234, 10=260.

insert into public.card_deck_variants (id, name, min_members, max_members, description, is_active)
select
  'players_' || player_count,
  player_count || ' Player Deck',
  player_count,
  player_count,
  'Exact ' || player_count || '-player deck. Regular deck uses 26 cards per player, scaled from the original 52-card 2-player deck.',
  true
from generate_series(2, 10) as counts(player_count)
on conflict (id) do update
set
  name = excluded.name,
  min_members = excluded.min_members,
  max_members = excluded.max_members,
  description = excluded.description,
  is_active = true;

update public.card_deck_variants
set is_active = false
where id in ('players_2_3', 'players_4_6', 'players_7_10');

create or replace function public.deck_variant_for_member_count(member_count integer)
returns text
language sql
immutable
as $$
  select case
    when member_count between 2 and 10 then 'players_' || member_count::text
    else null
  end;
$$;

-- Remove old broad bucket deck constraints before replacing them with exact size constraints.
do $$
declare
  target_constraint text;
begin
  for target_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.competitions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%deck_variant_id%'
  loop
    execute format('alter table public.competitions drop constraint %I', target_constraint);
  end loop;
end $$;

-- Unlocked leagues can keep accepting up to 10 members. Their final exact deck locks later.
update public.competitions
set
  max_members = 10,
  deck_variant_id = 'players_10'
where locked_member_count is null;

-- Locked leagues use the exact deck matching their locked player count.
update public.competitions
set
  max_members = locked_member_count,
  deck_variant_id = public.deck_variant_for_member_count(locked_member_count),
  locked_deck_variant_id = public.deck_variant_for_member_count(locked_member_count)
where locked_member_count is not null;

alter table public.competitions
add constraint competitions_deck_variant_matches_size
check (
  (max_members = 2 and deck_variant_id = 'players_2')
  or (max_members = 3 and deck_variant_id = 'players_3')
  or (max_members = 4 and deck_variant_id = 'players_4')
  or (max_members = 5 and deck_variant_id = 'players_5')
  or (max_members = 6 and deck_variant_id = 'players_6')
  or (max_members = 7 and deck_variant_id = 'players_7')
  or (max_members = 8 and deck_variant_id = 'players_8')
  or (max_members = 9 and deck_variant_id = 'players_9')
  or (max_members = 10 and deck_variant_id = 'players_10')
);

alter table public.competitions
add constraint competitions_locked_deck_variant_matches_size
check (
  (locked_member_count is null and locked_deck_variant_id is null)
  or (
    locked_member_count is not null
    and locked_deck_variant_id = public.deck_variant_for_member_count(locked_member_count)
  )
);

with base_quantities (card_id, category, base_quantity, priority) as (
  values
    ('power_goal', 'power', 2, 1),
    ('power_swap', 'power', 3, 2),
    ('power_veto', 'power', 3, 3),
    ('power_laundrette', 'power', 2, 4),
    ('power_rocket_man', 'power', 3, 5),
    ('power_pessimist', 'power', 1, 6),
    ('power_immigrants', 'power', 2, 7),
    ('power_lanky_crouch', 'power', 2, 8),
    ('power_small_and_mighty', 'power', 2, 9),
    ('power_of_god', 'power', 2, 10),
    ('power_hedge', 'power', 2, 11),
    ('power_assist_king', 'power', 1, 12),
    ('power_late_scout', 'power', 3, 13),
    ('power_snow', 'power', 2, 14),

    ('curse_hated', 'curse', 2, 101),
    ('curse_gambler', 'curse', 2, 102),
    ('curse_bench_warmer', 'curse', 2, 103),
    ('curse_alphabet_15', 'curse', 1, 104),
    ('curse_scoring_drought_3', 'curse', 1, 105),
    ('curse_even_number', 'curse', 1, 106),
    ('curse_alphabet_20', 'curse', 1, 107),
    ('curse_scoring_drought_5', 'curse', 1, 108),
    ('curse_odd_number', 'curse', 1, 109),
    ('curse_random_roulette', 'curse', 2, 110),
    ('curse_glasses', 'curse', 2, 111),
    ('curse_deleted_match', 'curse', 2, 112),
    ('curse_tiny_club', 'curse', 2, 113),
    ('curse_thief', 'curse', 2, 114)
),
member_counts as (
  select player_count, 'players_' || player_count::text as deck_variant_id
  from generate_series(2, 10) as counts(player_count)
),
regular_scaled as (
  select
    mc.deck_variant_id,
    mc.player_count,
    bq.card_id,
    bq.category,
    bq.priority,
    (bq.base_quantity * mc.player_count / 2.0) as raw_quantity,
    floor(bq.base_quantity * mc.player_count / 2.0)::integer as floor_quantity,
    case bq.category
      when 'power' then 15 * mc.player_count
      else 11 * mc.player_count
    end as target_category_total
  from member_counts mc
  cross join base_quantities bq
),
regular_ranked as (
  select
    *,
    row_number() over (
      partition by deck_variant_id, category
      order by (raw_quantity - floor_quantity) desc, priority asc
    ) as remainder_rank,
    sum(floor_quantity) over (partition by deck_variant_id, category) as floor_category_total
  from regular_scaled
),
regular_final as (
  select
    deck_variant_id,
    card_id,
    floor_quantity
      + case
          when remainder_rank <= target_category_total - floor_category_total then 1
          else 0
        end as quantity
  from regular_ranked
),
fixed_cards (card_id, quantity) as (
  values
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
all_quantities as (
  select deck_variant_id, card_id, quantity
  from regular_final
  union all
  select mc.deck_variant_id, fc.card_id, fc.quantity
  from member_counts mc
  cross join fixed_cards fc
)
insert into public.card_deck_cards (deck_variant_id, card_id, quantity)
select deck_variant_id, card_id, quantity
from all_quantities
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;

update public.card_definitions
set description = 'Draw 3, 4, or 5 Regular Deck cards depending on final league size.'
where id = 'super_draw';

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

  -- Before lock, keep the live deck aligned to the current member count.
  -- At lock time, freeze the exact deck for the final member count.
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

  perform public.ensure_league_card_decks(target_competition_id);
end;
$$;

create or replace function public.finalize_competition_start(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  final_deck_variant_id text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to start a league.';
  end if;

  if not public.can_manage_competition(target_competition_id) then
    raise exception 'You cannot manage this league.';
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
  where id = target_competition_id;

  perform public.ensure_league_card_decks(target_competition_id);
end;
$$;

grant execute on function public.deck_variant_for_member_count(integer) to authenticated;
grant execute on function public.ensure_league_card_decks(uuid) to authenticated;
grant execute on function public.sync_competition_member_lock(uuid) to authenticated;
grant execute on function public.finalize_competition_start(uuid) to authenticated;

select
  cdc.deck_variant_id,
  sum(cdc.quantity) filter (where cd.deck_type = 'regular') as regular_cards,
  sum(cdc.quantity) filter (where cd.category = 'power') as power_cards,
  sum(cdc.quantity) filter (where cd.category = 'curse') as curse_cards,
  sum(cdc.quantity) filter (where cd.deck_type = 'premium') as premium_cards,
  sum(cdc.quantity) filter (where cd.deck_type = 'game') as game_cards
from public.card_deck_cards cdc
join public.card_definitions cd on cd.id = cdc.card_id
where cdc.deck_variant_id ~ '^players_[0-9]+$'
group by cdc.deck_variant_id
order by split_part(cdc.deck_variant_id, '_', 2)::integer;
