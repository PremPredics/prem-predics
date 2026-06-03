-- Increase regular deck sizes to 28 cards per league member.
-- This keeps every exact player-count deck even, adds room for late-season
-- medal draws/Super Draw/Swap chains, and preserves the previous Power/Curse
-- weighting as closely as possible: 16 Power + 12 Curse cards per player.

begin;

update public.card_deck_variants
set description = 'Exact ' || min_members || '-player deck. Regular deck uses 28 cards per player, keeping the Power and Curse mix balanced.'
where id ~ '^players_[0-9]+$';

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
    bq.card_id,
    bq.category,
    bq.priority,
    (bq.base_quantity * mc.player_count / 2.0) as raw_quantity,
    floor(bq.base_quantity * mc.player_count / 2.0)::integer as floor_quantity,
    case bq.category
      when 'power' then 16 * mc.player_count
      else 12 * mc.player_count
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
