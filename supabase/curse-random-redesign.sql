-- Prem Predics Curse of the Random redesign.
-- Run this once in Supabase after deploying the app changes.
--
-- The internal id/effect key/table name stay as curse_gambler for compatibility
-- with existing played cards and scoring views. The player-facing card is now
-- "Curse of the Random".

update public.card_definitions
set
  name = 'Curse of the Hated',
  description = 'Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this gameweek. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_hated';

update public.card_definitions
set
  name = 'Curse of the Random',
  description = 'Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_gambler';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent Star Man must have been benched in the previous gameweek. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_bench_warmer';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent Star Man surname must have Scrabble score of 15+. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_alphabet_15';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent Star Man surname must have Scrabble score of 20+. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_alphabet_20';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent Star Man must have 0 goals in their last 3 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_scoring_drought_3';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent Star Man must have 0 goals in their last 5 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_scoring_drought_5';

update public.card_definitions
set
  name = 'Curse Of The Microstate',
  description = 'Valid for 1 Gameweek. Opponent Star Man nationality must be from a Country with a population of less than 1 million. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_random_roulette';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent 0-0 predictions score nothing. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_glasses';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Choose one opponent prediction; opponent cannot earn points from that game. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_deleted_match';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent may not pick a Star Man from a top-10 club. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_tiny_club';

update public.card_definitions
set description = 'Steal a card from an opponent; cannot steal Super Cards. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_thief';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent can only predict even team goal totals. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'
where id = 'curse_even_number';

update public.card_definitions
set description = 'Valid for 1 Gameweek. Opponent can only predict odd team goal totals. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'
where id = 'curse_odd_number';

alter table public.curse_gambler_rolls
  drop constraint if exists curse_gambler_rolls_home_die_roll_check;

alter table public.curse_gambler_rolls
  drop constraint if exists curse_gambler_rolls_away_die_roll_check;

update public.curse_gambler_rolls
set
  home_die_roll = case when home_die_roll = 6 then 0 else home_die_roll end,
  away_die_roll = case when away_die_roll = 6 then 0 else away_die_roll end;

create or replace function public.set_curse_gambler_roll_goals()
returns trigger
language plpgsql
as $$
begin
  new.home_goals = new.home_die_roll;
  new.away_goals = new.away_die_roll;
  return new;
end;
$$;

update public.curse_gambler_rolls
set
  home_goals = home_die_roll,
  away_goals = away_die_roll;

alter table public.curse_gambler_rolls
  add constraint curse_gambler_rolls_home_die_roll_check
  check (home_die_roll between 0 and 5);

alter table public.curse_gambler_rolls
  add constraint curse_gambler_rolls_away_die_roll_check
  check (away_die_roll between 0 and 5);

create or replace function public.set_player_scrabble_score()
returns trigger
language plpgsql
as $$
declare
  fallback_name text;
begin
  fallback_name := regexp_replace(coalesce(new.display_name, ''), '^.*[[:space:]]', '');
  new.scrabble_name := coalesce(nullif(new.last_name, ''), nullif(new.surname, ''), nullif(new.scrabble_name, ''), nullif(fallback_name, ''), new.display_name);
  new.surname_scrabble_score := public.scrabble_score(new.scrabble_name);
  return new;
end;
$$;

drop trigger if exists players_set_scrabble_score on public.players;

create trigger players_set_scrabble_score
before insert or update of display_name, first_name, last_name, surname, scrabble_name on public.players
for each row execute function public.set_player_scrabble_score();

update public.players
set
  scrabble_name = coalesce(nullif(last_name, ''), nullif(surname, ''), nullif(scrabble_name, ''), nullif(regexp_replace(display_name, '^.*[[:space:]]', ''), ''), display_name),
  surname_scrabble_score = public.scrabble_score(coalesce(nullif(last_name, ''), nullif(surname, ''), nullif(scrabble_name, ''), nullif(regexp_replace(display_name, '^.*[[:space:]]', ''), ''), display_name));

create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
begin
  select category, effect_key
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.category = 'curse' then
    play_deadline := first_kickoff - interval '24 hours';
  else
    play_deadline := coalesce(
      public.star_man_lock_at_for_gameweek(new.season_id, target_gameweek_id),
      first_kickoff - interval '90 minutes'
    );
  end if;

  if now() >= play_deadline and not public.is_admin() then
    if card_row.category = 'curse' then
      raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
    end if;
    raise exception 'Power and Super cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_card_play_deadline on public.active_card_effects;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();
