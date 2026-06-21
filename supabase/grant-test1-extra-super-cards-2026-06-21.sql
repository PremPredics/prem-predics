-- Test helper: give Vas and Abby three extra copies of each Super Card in TEST 1.
-- Safe to re-run: each copy has a unique manual grant source key.

begin;

with target_players as (
  select
    c.id as competition_id,
    p.id as user_id,
    lower(p.display_name) as username_key
  from public.competitions c
  join public.competition_members cm on cm.competition_id = c.id
  join public.profiles p on p.id = cm.user_id
  where lower(c.name) = 'test 1'
    and lower(p.display_name) in ('vas', 'abby')
),
super_cards as (
  select
    cd.id as card_id,
    row_number() over (order by cd.name) as card_number
  from public.card_definitions cd
  where cd.category = 'super'
    and cd.is_active = true
),
grant_copies as (
  select generate_series(1, 3) as copy_number
),
grants as (
  select
    tp.competition_id,
    tp.user_id,
    tp.username_key,
    sc.card_id,
    gc.copy_number,
    row_number() over (
      partition by tp.user_id
      order by gc.copy_number, sc.card_number
    ) as grant_order,
    'manual_test_grant:test1_' || tp.username_key || '_three_extra_super_each_2026_06_21_copy_' || gc.copy_number::text as source_key
  from target_players tp
  cross join super_cards sc
  cross join grant_copies gc
),
base_sort as (
  select
    tp.user_id,
    coalesce(max(lc.sort_order), 0) as sort_order
  from target_players tp
  left join public.league_cards lc
    on lc.competition_id = tp.competition_id
   and lc.owner_user_id = tp.user_id
  group by tp.user_id
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
  g.competition_id,
  g.card_id,
  g.user_id,
  'hand',
  bs.sort_order + g.grant_order,
  g.source_key
from grants g
join base_sort bs on bs.user_id = g.user_id
where not exists (
  select 1
  from public.league_cards existing
  where existing.competition_id = g.competition_id
    and existing.owner_user_id = g.user_id
    and existing.card_id = g.card_id
    and existing.source = g.source_key
);

commit;

select
  p.display_name,
  cd.name,
  count(*) filter (
    where lc.source like 'manual_test_grant:test1_%_three_extra_super_each_2026_06_21_copy_%'
  ) as extra_test_copies
from public.competitions c
join public.competition_members cm on cm.competition_id = c.id
join public.profiles p on p.id = cm.user_id
join public.league_cards lc on lc.competition_id = c.id and lc.owner_user_id = p.id
join public.card_definitions cd on cd.id = lc.card_id
where lower(c.name) = 'test 1'
  and lower(p.display_name) in ('vas', 'abby')
  and cd.category = 'super'
group by p.display_name, cd.name
order by p.display_name, cd.name;
