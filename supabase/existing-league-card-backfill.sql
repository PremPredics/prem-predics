-- Prem Predics existing league card backfill.
-- Run after exact-player-count-decks.sql and replace-bench-rocket-cards.sql.
-- It keeps owned/played/discarded cards intact, then tops up active league decks
-- to the correct player-count deck.

update public.card_definitions
set
  name = 'Power Of The Clean Sweep',
  effect_key = 'power_clean_sweep',
  description = 'Valid for 1 Gameweek. If you score a point in every game, earn bonus +5 UC pts. Must be played at least 90 minutes before the gameweek''s first KO time.',
  category = 'power',
  deck_type = 'regular',
  is_active = true
where id = 'power_rocket_man';

update public.card_definitions
set
  name = 'Curse of the Furious',
  effect_key = 'curse_furious',
  description = 'Valid for 1 Gameweek. If your opponent''s Star Man gets a yellow or red card, those minus points are doubled. Must be played at least 24 hours before the gameweek''s first KO time.',
  category = 'curse',
  deck_type = 'regular',
  is_active = true
where id = 'curse_bench_warmer';

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

  delete from public.league_cards lc
  using public.card_definitions cd
  where cd.id = lc.card_id
    and lc.competition_id = target_competition_id
    and lc.owner_user_id is null
    and lc.zone in ('regular_deck', 'premium_deck', 'game_deck')
    and cd.is_active = false;

  with desired as (
    select cdc.card_id, cdc.quantity
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    where cdc.deck_variant_id = target_deck_variant
      and cd.deck_type in ('regular', 'premium')
      and cd.is_active = true
  ),
  existing as (
    select lc.card_id, count(*) as current_count
    from public.league_cards lc
    join public.card_definitions cd on cd.id = lc.card_id
    where lc.competition_id = target_competition_id
      and cd.deck_type in ('regular', 'premium')
      and cd.is_active = true
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
      and cd.is_active = true
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
      when target_competition.locked_deck_variant_id is null then 'deck_sync_' || target_deck_variant
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
      and cd.is_active = true
    group by cdc.card_id, cd.deck_type, cdc.quantity
  ) desired
  cross join lateral generate_series(1, desired.missing_count)
  where desired.missing_count > 0;
end;
$$;

grant execute on function public.ensure_league_card_decks(uuid) to authenticated;

with member_counts as (
  select
    c.id,
    count(cm.user_id)::integer as member_count
  from public.competitions c
  left join public.competition_members cm on cm.competition_id = c.id
  group by c.id
)
update public.competitions c
set
  max_members = mc.member_count,
  deck_variant_id = public.deck_variant_for_member_count(mc.member_count),
  locked_member_count = mc.member_count,
  locked_deck_variant_id = public.deck_variant_for_member_count(mc.member_count),
  accepts_new_members = false,
  started_at = coalesce(c.started_at, now())
from member_counts mc
where mc.id = c.id
  and c.locked_member_count is null
  and c.member_lock_at <= now()
  and mc.member_count between 2 and 10;

do $$
declare
  competition_row record;
begin
  for competition_row in
    select id
    from public.competitions
  loop
    perform public.ensure_league_card_decks(competition_row.id);
  end loop;
end;
$$;

with member_counts as (
  select
    c.id,
    c.name,
    c.locked_member_count,
    c.locked_deck_variant_id,
    count(cm.user_id)::integer as current_member_count
  from public.competitions c
  left join public.competition_members cm on cm.competition_id = c.id
  group by c.id
),
card_counts as (
  select
    lc.competition_id,
    count(*) filter (where cd.deck_type = 'regular' and cd.is_active = true)::integer as regular_cards,
    count(*) filter (where cd.deck_type = 'premium' and cd.is_active = true)::integer as premium_cards,
    count(*) filter (where cd.deck_type = 'game' and cd.is_active = true)::integer as game_cards,
    count(*) filter (where cd.is_active = true)::integer as total_cards,
    count(*) filter (where cd.is_active = false)::integer as inactive_card_instances
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  group by lc.competition_id
)
select
  mc.name,
  mc.current_member_count,
  mc.locked_member_count,
  coalesce(
    mc.locked_deck_variant_id,
    public.deck_variant_for_member_count(least(10, greatest(2, mc.current_member_count)))
  ) as active_deck_variant,
  coalesce(cc.regular_cards, 0) as regular_cards,
  coalesce(cc.premium_cards, 0) as premium_cards,
  coalesce(cc.game_cards, 0) as game_cards,
  coalesce(cc.total_cards, 0) as total_cards,
  coalesce(cc.inactive_card_instances, 0) as inactive_card_instances
from member_counts mc
left join card_counts cc on cc.competition_id = mc.id
order by mc.name;
