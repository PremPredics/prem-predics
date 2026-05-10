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

    ('curse_hated', 'Curse of the Hated', 'curse', 'regular', 'curse_hated', 'Opponent must predict 8-2 in at least one game this gameweek.'),
    ('curse_gambler', 'Curse of the Gambler', 'curse', 'regular', 'curse_gambler', 'Opponent rolls dice for three game predictions.'),
    ('curse_bench_warmer', 'Curse of the Bench Warmer', 'curse', 'regular', 'curse_bench_warmer', 'Opponent Star Man must have been benched in the previous gameweek.'),
    ('curse_alphabet_15', 'Curse of the Alphabet (15+)', 'curse', 'regular', 'curse_alphabet_15', 'Opponent Star Man surname must have Scrabble score of 15+.'),
    ('curse_alphabet_20', 'Curse of the Alphabet (20+)', 'curse', 'regular', 'curse_alphabet_20', 'Opponent Star Man surname must have Scrabble score of 20+.'),
    ('curse_scoring_drought_3', 'Curse of the Scoring Drought (3)', 'curse', 'regular', 'curse_scoring_drought_3', 'Opponent Star Man must have 0 goals in their last 3 Premier League games.'),
    ('curse_scoring_drought_5', 'Curse of the Scoring Drought (5)', 'curse', 'regular', 'curse_scoring_drought_5', 'Opponent Star Man must have 0 goals in their last 5 Premier League games.'),
    ('curse_random_roulette', 'Curse of the Random Roulette', 'curse', 'regular', 'curse_random_roulette', 'Opponent Star Man squad number is chosen by roulette from 1 to 36.'),
    ('curse_glasses', 'Curse of the Glasses', 'curse', 'regular', 'curse_glasses', 'Opponent 0-0 predictions score nothing.'),
    ('curse_deleted_match', 'Curse of the Deleted Match', 'curse', 'regular', 'curse_deleted_match', 'Choose one opponent prediction; opponent cannot earn points from that game.'),
    ('curse_tiny_club', 'Curse of the Tiny Club', 'curse', 'regular', 'curse_tiny_club', 'Opponent may not pick a Star Man from a top-10 club.'),
    ('curse_thief', 'Curse of the Thief', 'curse', 'regular', 'curse_thief', 'Steal a card from an opponent; cannot steal Super Cards.'),
    ('curse_even_number', 'Curse of the Even Number', 'curse', 'regular', 'curse_even_number', 'Opponent can only predict even team goal totals.'),
    ('curse_odd_number', 'Curse of the Odd Number', 'curse', 'regular', 'curse_odd_number', 'Opponent can only predict odd team goal totals.'),

    ('super_star_man', 'Super Star Man', 'super', 'premium', 'super_star_man', 'Star Man points are tripled; yellow and red cards are 0 points.'),
    ('super_golden_gameweek', 'Super Golden Gameweek', 'super', 'premium', 'super_golden_gameweek', 'Prediction League points for all games are doubled.'),
    ('super_sub', 'Super Sub', 'super', 'premium', 'super_sub', 'Star Man can be swapped before the new player fixture kicks off.'),
    ('super_score', 'Super Score', 'super', 'premium', 'super_score', 'Choose one exact scoreline; each matching real fixture earns +3 UC points.'),
    ('super_draw', 'Super Draw', 'super', 'premium', 'super_draw', 'Draw 3 cards from the Regular Deck.'),
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

with quantities (card_id, quantity) as (
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
)
insert into public.card_deck_cards (deck_variant_id, card_id, quantity)
select cdv.id, q.card_id, q.quantity
from public.card_deck_variants cdv
cross join quantities q
where cdv.id in ('players_2_3', 'players_4_6', 'players_7_10')
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;
