-- Updates Curse Of The Microstate wording to match the up-to-5-million player pool.
-- The id/effect_key intentionally stay as curse_random_roulette so existing cards/effects keep working.

update public.card_definitions
set
  name = 'Curse Of The Microstate',
  description = 'Valid for 1 Gameweek. Opponent Star Man nationality must be from a Country with a population up to 5 million. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_random_roulette'
   or effect_key = 'curse_random_roulette'
   or name in ('Curse Of The Microstate', 'Curse of the Random Roulette');
