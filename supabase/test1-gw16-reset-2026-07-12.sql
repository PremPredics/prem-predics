-- Test helper: reset TEST 1 to a GW16 testing state.
-- Vas and Abby must already be members. This script deliberately avoids
-- inserting competition_members so it does not trip started-league member guards.
-- GW16 starts two days from run date at 15:00 Europe/London.
-- GW17+ start one day apart. GW1-GW15 are final with random test data.

begin;

do $$
declare
  target_competition_id uuid;
  target_season_id uuid;
  target_deck_variant text;
  vas_user_id uuid;
  abby_user_id uuid;
  gw1_id bigint;
  gw16_base_date date := current_date + 2;
begin
  select c.id, c.season_id
    into target_competition_id, target_season_id
  from public.competitions c
  where lower(c.name) = lower('TEST 1')
  order by c.created_at desc
  limit 1;

  if target_competition_id is null then
    raise exception 'TEST 1 league was not found.';
  end if;

  select p.id into vas_user_id
  from public.profiles p
  join public.competition_members cm on cm.user_id = p.id
  where cm.competition_id = target_competition_id
    and lower(p.display_name) = lower('Vas')
  limit 1;

  select p.id into abby_user_id
  from public.profiles p
  join public.competition_members cm on cm.user_id = p.id
  where cm.competition_id = target_competition_id
    and lower(p.display_name) = lower('Abby')
  limit 1;

  if vas_user_id is null or abby_user_id is null then
    raise exception 'Vas and Abby must already be members of TEST 1 before running this reset.';
  end if;

  select id into gw1_id
  from public.gameweeks
  where season_id = target_season_id
    and number = 1;

  if gw1_id is null then
    raise exception 'GW1 was not found for TEST 1 season.';
  end if;

  update public.competitions
  set
    starts_gameweek_id = gw1_id,
    max_members = 2,
    deck_variant_id = 'players_2',
    locked_member_count = 2,
    locked_deck_variant_id = 'players_2',
    accepts_new_members = false,
    started_at = coalesce(started_at, now()),
    starts_at = make_timestamptz(
      extract(year from gw16_base_date)::integer,
      extract(month from gw16_base_date)::integer,
      extract(day from gw16_base_date)::integer,
      15, 0, 0,
      'Europe/London'
    ) - interval '15 days',
    member_lock_at = make_timestamptz(
      extract(year from gw16_base_date)::integer,
      extract(month from gw16_base_date)::integer,
      extract(day from gw16_base_date)::integer,
      15, 0, 0,
      'Europe/London'
    ) - interval '15 days' - interval '90 minutes'
  where id = target_competition_id;

  delete from public.card_draw_events
  where competition_id = target_competition_id;

  delete from public.card_draw_tokens
  where competition_id = target_competition_id;

  delete from public.curse_gambler_rolls
  where competition_id = target_competition_id;

  delete from public.game_card_round_tiebreaks t
  using public.game_card_rounds r
  where t.round_id = r.id
    and r.competition_id = target_competition_id;

  delete from public.game_card_predictions p
  using public.game_card_rounds r
  where p.round_id = r.id
    and r.competition_id = target_competition_id;

  delete from public.game_card_results gr
  using public.game_card_rounds r
  where gr.round_id = r.id
    and r.competition_id = target_competition_id;

  delete from public.game_card_rounds
  where competition_id = target_competition_id;

  delete from public.predictions
  where competition_id = target_competition_id;

  delete from public.star_man_picks
  where competition_id = target_competition_id;

  delete from public.active_card_effects
  where competition_id = target_competition_id;

  delete from public.league_cards
  where competition_id = target_competition_id;

  delete from public.player_fixture_stats
  where season_id = target_season_id;

  delete from public.player_gameweek_stats
  where season_id = target_season_id;

  delete from public.match_results mr
  using public.fixtures f
  where mr.fixture_id = f.id
    and f.season_id = target_season_id;

  delete from public.fixture_game_stats fgs
  using public.fixtures f
  where fgs.fixture_id = f.id
    and f.season_id = target_season_id;

  delete from public.game_card_actual_results
  where season_id = target_season_id;

  update public.fixtures f
  set
    kickoff_at = case
      when gw.number <= 15 then make_timestamptz(
        extract(year from (current_date - (16 - gw.number)))::integer,
        extract(month from (current_date - (16 - gw.number)))::integer,
        extract(day from (current_date - (16 - gw.number)))::integer,
        15, 0, 0,
        'Europe/London'
      )
      else make_timestamptz(
        extract(year from (gw16_base_date + (gw.number - 16)))::integer,
        extract(month from (gw16_base_date + (gw.number - 16)))::integer,
        extract(day from (gw16_base_date + (gw.number - 16)))::integer,
        15, 0, 0,
        'Europe/London'
      )
    end,
    status = case when gw.number <= 15 then 'final' else 'scheduled' end
  from public.gameweeks gw
  where f.gameweek_id = gw.id
    and f.season_id = gw.season_id
    and f.season_id = target_season_id;

  update public.gameweeks gw
  set star_man_locks_at = x.first_kickoff_at - interval '90 minutes'
  from (
    select gameweek_id, min(kickoff_at) as first_kickoff_at
    from public.fixtures
    where season_id = target_season_id
      and status <> 'postponed'
    group by gameweek_id
  ) x
  where gw.id = x.gameweek_id
    and gw.season_id = target_season_id;
  insert into public.match_results (fixture_id, home_goals, away_goals, entered_by)
  select
    f.id,
    floor(random() * 5)::integer,
    floor(random() * 4)::integer,
    vas_user_id
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  where f.season_id = target_season_id
    and gw.number between 1 and 15;

  insert into public.fixture_game_stats (
    fixture_id,
    home_corners,
    away_corners,
    home_yellow_cards,
    away_yellow_cards,
    home_red_cards,
    away_red_cards,
    earliest_goal_minute,
    stoppage_time_goals,
    penalties_scored,
    played_in_heavy_snow,
    entered_by
  )
  select
    f.id,
    floor(random() * 12)::integer,
    floor(random() * 12)::integer,
    floor(random() * 5)::integer,
    floor(random() * 5)::integer,
    floor(random() * 2)::integer,
    floor(random() * 2)::integer,
    1 + floor(random() * 90)::integer,
    floor(random() * 4)::integer,
    floor(random() * 3)::integer,
    (random() < 0.12),
    vas_user_id
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  where f.season_id = target_season_id
    and gw.number between 1 and 15;

  insert into public.predictions (
    competition_id,
    season_id,
    fixture_id,
    user_id,
    prediction_slot,
    home_goals,
    away_goals
  )
  select
    target_competition_id,
    target_season_id,
    f.id,
    members.user_id,
    'primary',
    floor(random() * 5)::integer,
    floor(random() * 4)::integer
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  cross join (values (vas_user_id), (abby_user_id)) as members(user_id)
  where f.season_id = target_season_id
    and gw.number between 1 and 15
  on conflict (competition_id, fixture_id, user_id, prediction_slot)
  do update set
    home_goals = excluded.home_goals,
    away_goals = excluded.away_goals,
    submitted_at = now(),
    updated_at = now();

  insert into public.player_fixture_stats (
    season_id,
    fixture_id,
    gameweek_id,
    player_id,
    team_id,
    opponent_team_id,
    was_home_team,
    goals,
    assists,
    outside_box_goals,
    outside_box_assists,
    yellow_cards,
    red_cards,
    started,
    was_benched,
    was_in_matchday_squad,
    minutes_played,
    entered_by
  )
  select
    f.season_id,
    f.id,
    f.gameweek_id,
    p.id,
    p.team_id,
    case when p.team_id = f.home_team_id then f.away_team_id else f.home_team_id end,
    p.team_id = f.home_team_id,
    floor(random() * 3)::integer,
    floor(random() * 2)::integer,
    case when random() < 0.08 then 1 else 0 end,
    case when random() < 0.08 then 1 else 0 end,
    case when random() < 0.16 then 1 else 0 end,
    case when random() < 0.04 then 1 else 0 end,
    true,
    false,
    true,
    60 + floor(random() * 31)::integer,
    vas_user_id
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  cross join lateral (
    select players.id, players.team_id
    from public.players players
    where players.is_active = true
      and players.team_id in (f.home_team_id, f.away_team_id)
    order by random()
    limit 4
  ) p
  where f.season_id = target_season_id
    and gw.number between 1 and 15;

  insert into public.player_gameweek_stats (
    season_id,
    gameweek_id,
    player_id,
    goals,
    assists,
    outside_box_goals,
    outside_box_assists,
    yellow_cards,
    red_cards,
    started,
    was_benched,
    minutes_played,
    entered_by
  )
  select
    season_id,
    gameweek_id,
    player_id,
    sum(goals)::integer,
    sum(assists)::integer,
    sum(outside_box_goals)::integer,
    sum(outside_box_assists)::integer,
    sum(yellow_cards)::integer,
    sum(red_cards)::integer,
    bool_or(coalesce(started, false)),
    bool_or(coalesce(was_benched, false)),
    sum(coalesce(minutes_played, 0))::integer,
    vas_user_id
  from public.player_fixture_stats
  where season_id = target_season_id
  group by season_id, gameweek_id, player_id
  on conflict (season_id, gameweek_id, player_id)
  do update set
    goals = excluded.goals,
    assists = excluded.assists,
    outside_box_goals = excluded.outside_box_goals,
    outside_box_assists = excluded.outside_box_assists,
    yellow_cards = excluded.yellow_cards,
    red_cards = excluded.red_cards,
    started = excluded.started,
    was_benched = excluded.was_benched,
    minutes_played = excluded.minutes_played,
    entered_by = excluded.entered_by,
    updated_at = now();
  insert into public.game_card_rounds (
    competition_id,
    season_id,
    card_id,
    round_number,
    start_gameweek_id,
    end_gameweek_id,
    status,
    finalized_at
  )
  select
    target_competition_id,
    target_season_id,
    game_cards.card_id,
    scheduled.round_number,
    scheduled.start_gameweek_id,
    scheduled.end_gameweek_id,
    case
      when scheduled.round_number <= 3 then 'complete'
      when scheduled.round_number = 4 then 'active'
      else 'scheduled'
    end,
    case when scheduled.round_number <= 3 then now() else null end
  from (
    select
      row_number() over (order by start_gw.number)::integer as round_number,
      start_gw.id as start_gameweek_id,
      end_gw.id as end_gameweek_id
    from unnest(array[1,6,11,16,21,26,31]) as schedule(start_number)
    join public.gameweeks start_gw
      on start_gw.season_id = target_season_id
     and start_gw.number = schedule.start_number
    join public.gameweeks end_gw
      on end_gw.season_id = target_season_id
     and end_gw.number = least(schedule.start_number + 4, 38)
  ) scheduled
  join (
    select
      cd.id as card_id,
      row_number() over (order by md5(target_competition_id::text || cd.id))::integer as round_number
    from public.card_definitions cd
    where cd.deck_type = 'game'
      and cd.is_active = true
  ) game_cards
    on game_cards.round_number = scheduled.round_number;

  insert into public.game_card_actual_results (
    season_id,
    gameweek_id,
    card_id,
    actual_value,
    entered_by
  )
  select
    target_season_id,
    gw.id,
    r.card_id,
    case r.card_id
      when 'game_goals' then 18 + floor(random() * 18)
      when 'game_corners' then 70 + floor(random() * 70)
      when 'game_underdog' then floor(random() * 6)
      when 'game_goalhanger' then floor(random() * 8)
      when 'game_war' then 20 + floor(random() * 30)
      when 'game_early_worm' then 1 + floor(random() * 30)
      when 'game_time' then floor(random() * 10)
      else floor(random() * 20)
    end,
    vas_user_id
  from public.game_card_rounds r
  join public.gameweeks start_gw on start_gw.id = r.start_gameweek_id
  join public.gameweeks end_gw on end_gw.id = r.end_gameweek_id
  join public.gameweeks gw
    on gw.season_id = r.season_id
   and gw.number between start_gw.number and end_gw.number
   and gw.number between 1 and 15
  where r.competition_id = target_competition_id
    and r.round_number <= 3;

  insert into public.game_card_results (
    round_id,
    gameweek_id,
    actual_value,
    entered_by
  )
  select
    r.id,
    gcar.gameweek_id,
    gcar.actual_value,
    vas_user_id
  from public.game_card_rounds r
  join public.game_card_actual_results gcar
    on gcar.season_id = r.season_id
   and gcar.card_id = r.card_id
  join public.gameweeks gw on gw.id = gcar.gameweek_id
  join public.gameweeks start_gw on start_gw.id = r.start_gameweek_id
  join public.gameweeks end_gw on end_gw.id = r.end_gameweek_id
  where r.competition_id = target_competition_id
    and gw.number between start_gw.number and end_gw.number
  on conflict (round_id, gameweek_id)
  do update set
    actual_value = excluded.actual_value,
    entered_by = excluded.entered_by,
    updated_at = now();

  insert into public.game_card_predictions (
    round_id,
    gameweek_id,
    user_id,
    predicted_value
  )
  select
    r.id,
    gw.id,
    members.user_id,
    case r.card_id
      when 'game_goals' then 15 + floor(random() * 25)
      when 'game_corners' then 60 + floor(random() * 90)
      when 'game_underdog' then floor(random() * 8)
      when 'game_goalhanger' then floor(random() * 10)
      when 'game_war' then 18 + floor(random() * 35)
      when 'game_early_worm' then 1 + floor(random() * 45)
      when 'game_time' then floor(random() * 12)
      else floor(random() * 20)
    end
  from public.game_card_rounds r
  join public.gameweeks start_gw on start_gw.id = r.start_gameweek_id
  join public.gameweeks end_gw on end_gw.id = r.end_gameweek_id
  join public.gameweeks gw
    on gw.season_id = r.season_id
   and gw.number between start_gw.number and end_gw.number
   and gw.number between 1 and 15
  cross join (values (vas_user_id), (abby_user_id)) as members(user_id)
  where r.competition_id = target_competition_id
    and r.round_number <= 3
  on conflict (round_id, gameweek_id, user_id)
  do update set
    predicted_value = excluded.predicted_value,
    submitted_at = now(),
    updated_at = now();

  select coalesce(locked_deck_variant_id, deck_variant_id, 'players_2')
    into target_deck_variant
  from public.competitions
  where id = target_competition_id;

  insert into public.league_cards (
    competition_id,
    card_id,
    zone,
    sort_order,
    source
  )
  select
    target_competition_id,
    deck.card_id,
    case deck.deck_type
      when 'premium' then 'premium_deck'
      when 'game' then 'game_deck'
      else 'regular_deck'
    end,
    row_number() over (order by random()),
    'test_gw16_reset_deck_2026_07_12'
  from (
    select cdc.card_id, cd.deck_type
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    cross join lateral generate_series(1, cdc.quantity)
    where cdc.deck_variant_id = target_deck_variant
  ) deck;
  insert into public.league_cards (
    competition_id,
    card_id,
    owner_user_id,
    zone,
    sort_order,
    source
  )
  select
    target_competition_id,
    super_cards.id,
    members.user_id,
    'hand',
    100000 + row_number() over (order by members.user_id, super_cards.id, copies.copy_number),
    'test_gw16_reset_five_super_each_2026_07_12'
  from (values (vas_user_id), (abby_user_id)) as members(user_id)
  cross join (
    select id
    from public.card_definitions
    where category = 'super'
      and deck_type = 'premium'
      and is_active = true
  ) super_cards
  cross join generate_series(1, 5) as copies(copy_number);

  insert into public.league_cards (
    competition_id,
    card_id,
    owner_user_id,
    zone,
    sort_order,
    source
  )
  select
    target_competition_id,
    starter.card_id,
    starter.user_id,
    'hand',
    200000 + row_number() over (order by starter.user_id, random()),
    starter.source
  from (
    select members.user_id, power_card.id as card_id, 'test_gw16_reset_starter_power_2026_07_12' as source
    from (values (vas_user_id), (abby_user_id)) as members(user_id)
    cross join lateral (
      select id
      from public.card_definitions
      where category = 'power'
        and deck_type = 'regular'
        and is_active = true
      order by random()
      limit 1
    ) power_card

    union all

    select members.user_id, curse_card.id as card_id, 'test_gw16_reset_starter_curse_2026_07_12' as source
    from (values (vas_user_id), (abby_user_id)) as members(user_id)
    cross join lateral (
      select id
      from public.card_definitions
      where category = 'curse'
        and deck_type = 'regular'
        and is_active = true
      order by random()
      limit 1
    ) curse_card
  ) starter;
end $$;

commit;

with target_competition as (
  select id, season_id
  from public.competitions
  where lower(name) = lower('TEST 1')
  order by created_at desc
  limit 1
),
target_members as (
  select p.id, p.display_name
  from public.competition_members cm
  join public.profiles p on p.id = cm.user_id
  join target_competition tc on tc.id = cm.competition_id
  where lower(p.display_name) in ('vas', 'abby')
)
select 'members' as check_name, string_agg(display_name, ', ' order by display_name) as result
from target_members
union all
select 'hand_cards', count(*)::text
from public.league_cards lc
join target_competition tc on tc.id = lc.competition_id
where lc.zone = 'hand'
union all
select 'super_hand_cards', count(*)::text
from public.league_cards lc
join target_competition tc on tc.id = lc.competition_id
join public.card_definitions cd on cd.id = lc.card_id
where lc.zone = 'hand'
  and cd.category = 'super'
union all
select 'deck_cards', count(*)::text
from public.league_cards lc
join target_competition tc on tc.id = lc.competition_id
where lc.zone in ('regular_deck', 'premium_deck', 'game_deck')
union all
select 'predictions_gw1_to_gw15', count(*)::text
from public.predictions p
join public.fixtures f on f.id = p.fixture_id
join public.gameweeks gw on gw.id = f.gameweek_id
join target_competition tc on tc.id = p.competition_id
where gw.number between 1 and 15
union all
select 'final_results_gw1_to_gw15', count(*)::text
from public.match_results mr
join public.fixtures f on f.id = mr.fixture_id
join public.gameweeks gw on gw.id = f.gameweek_id
join target_competition tc on tc.season_id = f.season_id
where gw.number between 1 and 15;

with target_competition as (
  select season_id
  from public.competitions
  where lower(name) = lower('TEST 1')
  order by created_at desc
  limit 1
)
select
  gw.number as gameweek,
  count(f.id) as fixtures,
  min(f.status) as min_status,
  max(f.status) as max_status,
  min(f.kickoff_at at time zone 'Europe/London') as first_kickoff_london,
  max(f.kickoff_at at time zone 'Europe/London') as last_kickoff_london
from public.gameweeks gw
join target_competition tc on tc.season_id = gw.season_id
join public.fixtures f on f.gameweek_id = gw.id and f.season_id = gw.season_id
where gw.number between 14 and 18
group by gw.number
order by gw.number;
