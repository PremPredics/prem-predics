-- Increase regular deck sizes to 30 cards per league member.
-- This keeps every exact player-count deck even, adds room for late-season
-- medal draws/Super Draw/Swap chains, and preserves the previous Power/Curse
-- weighting from the bespoke 2-player base recipe: 34 Power + 26 Curse.
-- Odd-sized leagues round half-card quantities by priority; Power of the Swap
-- deliberately rounds down on odd sizes so it does not creep upward.

begin;

update public.card_deck_variants
set description = 'Exact ' || min_members || '-player deck. Regular deck uses 30 cards per player, keeping the Power and Curse mix balanced.'
where id ~ '^players_[0-9]+$';

with base_quantities (card_id, category, base_quantity, priority) as (
  values
    ('power_goal', 'power', 3, 1),
    ('power_swap', 'power', 3, 99),
    ('power_veto', 'power', 3, 2),
    ('power_laundrette', 'power', 2, 20),
    ('power_rocket_man', 'power', 2, 21),
    ('power_pessimist', 'power', 2, 22),
    ('power_immigrants', 'power', 3, 3),
    ('power_lanky_crouch', 'power', 3, 4),
    ('power_small_and_mighty', 'power', 3, 5),
    ('power_of_god', 'power', 2, 23),
    ('power_hedge', 'power', 3, 6),
    ('power_assist_king', 'power', 2, 24),
    ('power_late_scout', 'power', 2, 25),
    ('power_snow', 'power', 1, 7),

    ('curse_hated', 'curse', 2, 101),
    ('curse_gambler', 'curse', 3, 102),
    ('curse_bench_warmer', 'curse', 3, 103),
    ('curse_alphabet_15', 'curse', 2, 104),
    ('curse_scoring_drought_3', 'curse', 2, 105),
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
    bq.card_id,
    bq.category,
    bq.priority,
    (bq.base_quantity * mc.player_count / 2.0) as raw_quantity,
    floor(bq.base_quantity * mc.player_count / 2.0)::integer as floor_quantity,
    case bq.category
      when 'power' then 17 * mc.player_count
      else 13 * mc.player_count
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
    sum(floor_quantity) over (partition by deck_variant_id, category) as floor_category_total,
    count(*) over (partition by deck_variant_id, category) as category_card_count
  from regular_scaled
),
regular_final as (
  select
    deck_variant_id,
    card_id,
    floor_quantity
      + ((target_category_total - floor_category_total) / category_card_count)
      + case
          when remainder_rank <= ((target_category_total - floor_category_total) % category_card_count) then 1
          else 0
        end as quantity
  from regular_ranked
)
insert into public.card_deck_cards (deck_variant_id, card_id, quantity)
select deck_variant_id, card_id, quantity
from regular_final
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;

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

commit;
