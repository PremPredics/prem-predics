-- Update live card wording for Power of the Goal.
-- Run once in Supabase SQL Editor.

update public.card_definitions
set description = 'Valid for 1 Gameweek. +1 Goal for Star Man this week (+3 UC Points per copy played). Each copy stacks as a separate fixed +3 UC Points. Other Power Cards cannot multiply the points earned from Power Of The Goal. Must be played at least 90 minutes before the gameweek''s first KO time.'
where id = 'power_goal'
   or effect_key = 'power_goal';
