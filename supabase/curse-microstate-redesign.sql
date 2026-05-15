-- Replaces the old Curse of the Random Roulette card with Curse Of The Microstate.
-- The id/effect_key stay as curse_random_roulette so existing hands and played effects keep working.

update public.card_definitions
set
  name = 'Curse Of The Microstate',
  description = 'Valid for 1 Gameweek. Opponent Star Man nationality must be from a Country with a population of less than 1 million. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_random_roulette';

-- Previous roulette numbers are no longer part of this card's effect.
do $$
begin
  if to_regclass('public.curse_random_roulette_inputs') is not null then
    delete from public.curse_random_roulette_inputs
    where card_effect_id in (
      select id
      from public.active_card_effects
      where card_id = 'curse_random_roulette'
    );
  end if;
end $$;
