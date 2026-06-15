-- Test helper: give Vas one of each Super Card in TEST 15.
-- Safe to re-run: it only inserts cards from this exact manual grant once.

begin;

with target_player as (
  select
    c.id as competition_id,
    p.id as user_id
  from public.competitions c
  join public.competition_members cm on cm.competition_id = c.id
  join public.profiles p on p.id = cm.user_id
  where c.name = 'TEST 15'
    and lower(p.display_name) = 'vas'
  limit 1
),
super_cards as (
  select
    cd.id as card_id,
    row_number() over (order by cd.name) as card_number
  from public.card_definitions cd
  where cd.category = 'super'
    and cd.is_active = true
),
base_sort as (
  select coalesce(max(lc.sort_order), 0) as sort_order
  from public.league_cards lc
  join target_player tp
    on tp.competition_id = lc.competition_id
   and tp.user_id = lc.owner_user_id
)
insert into public.league_cards (
  competition_id,
  card_id,
  owner_user_id,
  zone,
  sort_order,
  source
)
select
  tp.competition_id,
  sc.card_id,
  tp.user_id,
  'hand',
  bs.sort_order + sc.card_number,
  'manual_test_grant:test15_vas_one_super_each'
from target_player tp
cross join super_cards sc
cross join base_sort bs
where not exists (
  select 1
  from public.league_cards existing
  where existing.competition_id = tp.competition_id
    and existing.owner_user_id = tp.user_id
    and existing.card_id = sc.card_id
    and existing.source = 'manual_test_grant:test15_vas_one_super_each'
);

commit;