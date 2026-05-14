-- Prem Predics card seed data
-- Run after supabase/schema.sql.

with cards (id, name, category, deck_type, effect_key, description) as (
  values
    ('power_goal', 'Power of the Goal', 'power', 'regular', 'power_goal', '+1 goal for Star Man this gameweek.'),
    ('power_swap', 'Power of the Swap', 'power', 'regular', 'power_swap', 'Discard this card and one other card, then draw 3 Regular Deck cards and keep 2.'),
    ('power_veto', 'Power of the Veto', 'power', 'regular', 'power_veto', 'Cancel an opponent Curse.'),
    ('power_laundrette', 'Power of the Laundrette', 'power', 'regular', 'power_laundrette', 'Double points for correct results with a clean sheet.'),
    ('power_rocket_man', 'Power of the Rocket Man', 'power', 'regular', 'power_rocket_man', 'Outside-the-box Star Man goals and assists are doubled.'),
    ('power_pessimist', 'Power of the Pessimist', 'power', 'regular', 'power_pessimist', 'Double all prediction points if no team scores 3+ goals in the gameweek.'),
    ('power_immigrants', 'Power of the Immigrants', 'power', 'regular', 'power_immigrants', 'Non-English Star Men score double points.'),
    ('power_lanky_crouch', 'Power of the Lanky Crouch', 'power', 'regular', 'power_lanky_crouch', 'Star Men 185cm or taller score double points.'),
    ('power_small_and_mighty', 'Power of the Small and Mighty', 'power', 'regular', 'power_small_and_mighty', 'Star Men 175cm or shorter score double points.'),
    ('power_of_god', 'Power of God', 'power', 'regular', 'power_of_god', 'Change one match prediction before the second-half deadline.'),
    ('power_hedge', 'Power of the Hedge', 'power', 'regular', 'power_hedge', 'Predict two scorelines for one match; best result counts.'),
    ('power_assist_king', 'Power of the Assist King', 'power', 'regular', 'power_assist_king', 'Star Man assists score double points.'),
    ('power_late_scout', 'Power of the Late Scout', 'power', 'regular', 'power_late_scout', 'Choose Star Man after lineups until the chosen player fixture kicks off.'),
    ('power_snow', 'Power of the Snow', 'power', 'regular', 'power_snow', 'Predicted matches played in heavy snow score double points.'),

    ('curse_hated', 'Curse of the Hated', 'curse', 'regular', 'curse_hated', 'Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this gameweek. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_gambler', 'Curse of the Random', 'curse', 'regular', 'curse_gambler', 'Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_bench_warmer', 'Curse of the Bench Warmer', 'curse', 'regular', 'curse_bench_warmer', 'Valid for 1 Gameweek. Opponent Star Man must have been benched in the previous gameweek. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_alphabet_15', 'Curse of the Alphabet (15+)', 'curse', 'regular', 'curse_alphabet_15', 'Valid for 1 Gameweek. Opponent Star Man surname must have Scrabble score of 15+. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_alphabet_20', 'Curse of the Alphabet (20+)', 'curse', 'regular', 'curse_alphabet_20', 'Valid for 1 Gameweek. Opponent Star Man surname must have Scrabble score of 20+. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_scoring_drought_3', 'Curse of the Scoring Drought (3)', 'curse', 'regular', 'curse_scoring_drought_3', 'Valid for 1 Gameweek. Opponent Star Man must have 0 goals in their last 3 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_scoring_drought_5', 'Curse of the Scoring Drought (5)', 'curse', 'regular', 'curse_scoring_drought_5', 'Valid for 1 Gameweek. Opponent Star Man must have 0 goals in their last 5 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_random_roulette', 'Curse Of The Microstate', 'curse', 'regular', 'curse_random_roulette', 'Valid for 1 Gameweek. Opponent Star Man nationality must be from a Country with a population of less than 1 million. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_glasses', 'Curse of the Glasses', 'curse', 'regular', 'curse_glasses', 'Valid for 1 Gameweek. Opponent 0-0 predictions score nothing. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_deleted_match', 'Curse of the Deleted Match', 'curse', 'regular', 'curse_deleted_match', 'Valid for 1 Gameweek. Choose one opponent prediction; opponent cannot earn points from that game. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_tiny_club', 'Curse of the Tiny Club', 'curse', 'regular', 'curse_tiny_club', 'Valid for 1 Gameweek. Opponent may not pick a Star Man from a top-10 club. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_thief', 'Curse of the Thief', 'curse', 'regular', 'curse_thief', 'Steal a card from an opponent; cannot steal Super Cards. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_even_number', 'Curse of the Even Number', 'curse', 'regular', 'curse_even_number', 'Valid for 1 Gameweek. Opponent can only predict even team goal totals. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'),
    ('curse_odd_number', 'Curse of the Odd Number', 'curse', 'regular', 'curse_odd_number', 'Valid for 1 Gameweek. Opponent can only predict odd team goal totals. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'),

    ('super_star_man', 'Super Star Man', 'super', 'premium', 'super_star_man', 'Star Man points are tripled; yellow and red cards are 0 points.'),
    ('super_golden_gameweek', 'Super Golden Gameweek', 'super', 'premium', 'super_golden_gameweek', 'Prediction League points for all games are doubled.'),
    ('super_sub', 'Super Sub', 'super', 'premium', 'super_sub', 'Star Man can be swapped before the new player fixture kicks off.'),
    ('super_score', 'Super Score', 'super', 'premium', 'super_score', 'Choose one exact scoreline; each matching real fixture earns +3 UC points.'),
    ('super_draw', 'Super Draw', 'super', 'premium', 'super_draw', 'Draw 3, 4, or 5 Regular Deck cards depending on league size.'),
    ('super_duo', 'Super Duo', 'super', 'premium', 'super_duo', 'Choose a second Star Man for the active gameweek range.'),
    ('super_pen', 'Super Pen', 'super', 'premium', 'super_pen', 'Draw a Regular Deck card whenever a penalty is scored during the active gameweek range.'),

    ('game_goals', 'Game of Goals', 'game', 'game', 'game_goals', 'Best-of-5 minigame: predict total goals each gameweek. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_corners', 'Game of Corners', 'game', 'game', 'game_corners', 'Best-of-5 minigame: predict total corners each gameweek. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_underdog', 'Game of The Underdog', 'game', 'game', 'game_underdog', 'Best-of-5 minigame: predict teams beating a team above them. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_goalhanger', 'Game of The Goalhanger', 'game', 'game', 'game_goalhanger', 'Best-of-5 minigame: predict players scoring 2+ goals. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_war', 'Game of War', 'game', 'game', 'game_war', 'Best-of-5 minigame: predict total yellow cards. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_early_worm', 'Game of The Early Worm', 'game', 'game', 'game_early_worm', 'Best-of-5 minigame: predict earliest goal minute. Winner earns +1 UC point and 1 Super Medal.'),
    ('game_time', 'Game of Time', 'game', 'game', 'game_time', 'Best-of-5 minigame: predict total 90+ minute goals. Winner earns +1 UC point and 1 Super Medal.')
)
insert into public.card_definitions (id, name, category, deck_type, effect_key, description)
select id, name, category, deck_type, effect_key, description
from cards
on conflict (id) do update
set
  name = excluded.name,
  category = excluded.category,
  deck_type = excluded.deck_type,
  effect_key = excluded.effect_key,
  description = excluded.description,
  is_active = true;

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
select
  deck_variant_id,
  card_id,
  quantity
from all_quantities
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;
