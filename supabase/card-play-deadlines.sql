-- Prem Predics card-play timing guard.
-- Run this in Supabase once after updating the app.
--
-- Rules:
-- - Curse cards must be played at least 24 hours before the first fixture in the gameweek.
-- - Most Power and Super cards must be played before the 90-minute gameweek lock,
--   except Swap, Veto, Power of God, and Late Scout, which have their own timing.
-- Global admins can still insert/admin-fix rows manually.

with canonical_card_descriptions (id, description) as (
  values
    ('power_goal', 'Valid for 1 Gameweek. +1 Goal for Star Man this week. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_swap', 'Discard this card and one other card, then Draw 3 cards from the Regular Deck and pick 2 to keep in your hand.'),
    ('power_veto', 'Veto a Curse played by your opponent.'),
    ('power_laundrette', 'Valid for 1 Gameweek. DOUBLE points for any Correct Result with a Clean Sheet. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_rocket_man', 'Valid for 1 Gameweek. If you score a point in every game this Gameweek, earn bonus +5 UC pts. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_pessimist', 'Valid for 1 Gameweek. DOUBLE points for all Predictions if no team scores 3+ goals. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_immigrants', 'Valid for 1 Gameweek. Non-English Star Men score DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_lanky_crouch', 'Valid for 1 Gameweek. Star Men 6ft1 (185cm) or taller score DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_small_and_mighty', 'Valid for 1 Gameweek. Star Men 5ft9 (175cm) or shorter score DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_of_god', 'Valid for 1 Gameweek. Change ONE match prediction before the start of the 2nd Half.'),
    ('power_hedge', 'Valid for 1 Gameweek. Predict TWO scorelines for one match, best result counts. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_assist_king', 'Valid for 1 Gameweek. Star Man assists score DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('power_late_scout', 'Valid for 1 Gameweek. Play at any time. Choose your Star Man after line-ups are announced; each player remains available until their team''s first match in the Gameweek kicks off.'),
    ('power_snow', 'Valid for 1 Gameweek. Any Predicted match played in heavy snow scores DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'),
    ('curse_hated', 'Valid for 1 Gameweek. Opponent must predict 8-2 in at least one game this Gameweek. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_gambler', 'Valid for 1 Gameweek. For 3 games, roll a dice to determine the score predictions of an opponent. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_bench_warmer', 'Valid for 1 Gameweek. If your opponent''s Star Man gets a Yellow or Red card, those -pts are doubled. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_alphabet_15', 'Valid for 1 Gameweek. Opponent''s Star Man surname must have a Scrabble score of 15+. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_alphabet_20', 'Valid for 1 Gameweek. Opponent''s Star Man surname must have a Scrabble score of 20+. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_scoring_drought_3', 'Valid for 1 Gameweek. Opponent''s Star Man must have 0 goals in their last 3 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_scoring_drought_5', 'Valid for 1 Gameweek. Opponent''s Star Man must have 0 goals in their last 5 Premier League games. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_random_roulette', 'Valid for 1 Gameweek. Opponent''s Star Man''s nationality must be from a Country with a population of less than 1 million. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_glasses', 'Valid for 1 Gameweek. Any 0-0 prediction that the Opponent makes scores NOTHING. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_deleted_match', 'Valid for 1 Gameweek. Choose ONE of the Opponent''s Predictions, Opponent cannot earn points from this game. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_tiny_club', 'Valid for 1 Gameweek. Opponent may NOT pick a Star Man from a Top 10 club. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_thief', 'Steal a card from your Opponent. Cannot steal Super Cards. Must be played at least 24 hours before the gameweek''s first KO time.'),
    ('curse_even_number', 'Valid for 1 Gameweek. Opponent can only Predict an Even number of goals for all teams. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'),
    ('curse_odd_number', 'Valid for 1 Gameweek. Opponent can only Predict an Odd number of goals for all teams. Must be played at least 24 hours before the gameweek''s first KO time. Cannot be picked whilst Curse of The Random is active.'),
    ('super_star_man', 'Star Man points are TRIPLED. Yellow and Red cards are 0pts. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('super_golden_gameweek', 'Prediction League points for all games are DOUBLED. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('super_sub', 'Star Man can be swapped at any time for any other Star Man whose match has not kicked off within the same Gameweek. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('super_score', 'Choose one scoreline, for example 0-0, 1-0, or 1-2. Each time that exact scoreline happens, earn +3 UC pts. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('super_draw', 'Draw Regular Deck cards. Draw count: 3 cards in 2-3 player leagues, 4 cards in 4-6 player leagues, and 5 cards in 7-10 player leagues.'),
    ('super_duo', 'Two Star Men can be chosen during the active range. Must choose both players before the relevant Gameweek starts. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('super_pen', 'Draw a card from the Regular Deck any time a penalty is scored in the active range. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'),
    ('game_goals', 'Best of 5 Gameweeks, closest answer wins, predict the Total Goals in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_corners', 'Best of 5 Gameweeks, closest answer wins, predict the Total Corners in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_underdog', 'Best of 5 Gameweeks, closest answer wins, predict how many teams will beat a team above them in the league in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_goalhanger', 'Best of 5 Gameweeks, closest answer wins, predict how many players score 2+ goals in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_war', 'Best of 5 Gameweeks, closest answer wins, predict Total Yellow Cards in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_early_worm', 'Best of 5 Gameweeks, closest answer wins, predict in which minute the earliest goal in each Gameweek is scored. Winner gets +1 UC point and earns 1 Super Medal.'),
    ('game_time', 'Best of 5 Gameweeks, closest answer wins, predict Total 90''+ min goals in each Gameweek. Winner gets +1 UC point and earns 1 Super Medal.')
)
update public.card_definitions cd
set description = canonical_card_descriptions.description
from canonical_card_descriptions
where cd.id = canonical_card_descriptions.id;

create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
  league_start_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
  non_stacking_effect_keys text[] := array[
    'power_laundrette',
    'power_clean_sweep',
    'power_pessimist',
    'power_immigrants',
    'power_lanky_crouch',
    'power_small_and_mighty',
    'power_assist_king',
    'power_late_scout',
    'power_snow',
    'super_star_man',
    'super_golden_gameweek',
    'super_sub',
    'super_score',
    'super_duo',
    'super_pen'
  ];
begin
  select category, effect_key, name
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  select starts_gameweek_id
    into league_start_gameweek_id
  from public.competitions
  where id = new.competition_id;

  if league_start_gameweek_id is not null
    and exists (
      select 1
      from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = league_start_gameweek_id
        and lower(coalesce(f.status, '')) not in ('completed', 'finished', 'full_time', 'ft')
        and (f.kickoff_at is null or now() < f.kickoff_at + interval '3 hours')
    )
    and not public.is_admin()
  then
    raise exception 'Cards can be played after the first gameweek in this private league is completed.';
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  if card_row.effect_key = any(non_stacking_effect_keys)
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = card_row.effect_key
    )
    and not public.is_admin()
  then
    raise exception '% cannot be played more than once within a Gameweek', coalesce(card_row.name, 'This card');
  end if;

  if card_row.effect_key in ('power_lanky_crouch', 'power_small_and_mighty')
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'power_lanky_crouch' and cd.effect_key = 'power_small_and_mighty')
          or (card_row.effect_key = 'power_small_and_mighty' and cd.effect_key = 'power_lanky_crouch')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Lanky Crouch and Power of the Small and Mighty cannot be active at the same time.';
  end if;

  if card_row.effect_key in ('curse_gambler', 'curse_even_number', 'curse_odd_number')
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.target_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'curse_gambler' and cd.effect_key in ('curse_even_number', 'curse_odd_number'))
          or (card_row.effect_key in ('curse_even_number', 'curse_odd_number') and cd.effect_key = 'curse_gambler')
          or (card_row.effect_key = 'curse_even_number' and cd.effect_key = 'curse_odd_number')
          or (card_row.effect_key = 'curse_odd_number' and cd.effect_key = 'curse_even_number')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Curse of the Random cannot be combined with Curse of the Even/Odd Number.';
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.effect_key in ('power_swap', 'power_veto', 'power_of_god', 'power_late_scout') then
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
    if card_row.category = 'super' then
      raise exception 'Super cards must be played before the 90-minute gameweek deadline.';
    end if;
    raise exception 'Power cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_card_play_deadline on public.active_card_effects;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();

create or replace function public.veto_my_active_curse(
  target_competition_id uuid,
  target_card_effect_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  effect_row record;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this league.';
  end if;

  select ace.id, ace.target_user_id, ace.status, cd.category
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_card_effect_id
    and ace.competition_id = target_competition_id;

  if effect_row.id is null then
    raise exception 'Curse not found.';
  end if;

  if effect_row.category <> 'curse' or effect_row.status <> 'active' or effect_row.target_user_id <> target_user then
    raise exception 'Power of the Veto can only cancel an active Curse targeting you.';
  end if;

  update public.active_card_effects
  set status = 'vetoed',
      resolved_at = now()
  where id = target_card_effect_id
    and competition_id = target_competition_id;
end;
$$;

grant execute on function public.veto_my_active_curse(uuid, uuid) to authenticated;
