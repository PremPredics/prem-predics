-- Resolve the one legacy GW37 protected player left after replacing the Star Man pool.
--
-- First run the report query below. If Felipe is protected because of a Star Man pick
-- or non-zero GW37 stats, choose whether he should:
-- 1) be mapped to a current player in the new roster, or
-- 2) remain as a historical GW37 player.
--
-- If you want to map Felipe to a current player, edit the two variables in the DO block
-- near the bottom, then run that block.

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
gw37 as (
  select gameweeks.id as gameweek_id, target_season.id as season_id
  from target_season
  join public.gameweeks gameweeks
    on gameweeks.season_id = target_season.id
   and gameweeks.number = 37
),
felipe as (
  select players.id, players.display_name, teams.name as team_name
  from public.players
  left join public.teams teams
    on teams.id = players.team_id
  where lower(players.display_name) = 'felipe'
    and teams.name in ('Nottingham Forest', 'Nott''m Forest')
)
select
  'star_man_pick' as protected_by,
  profiles.display_name as user_name,
  competitions.name as league_name,
  felipe.display_name as player_name,
  felipe.team_name,
  null::integer as goals,
  null::integer as assists,
  null::integer as yellow_cards,
  null::integer as red_cards
from felipe
join public.star_man_picks picks
  on picks.player_id = felipe.id
join gw37
  on gw37.season_id = picks.season_id
 and gw37.gameweek_id = picks.gameweek_id
join public.profiles profiles
  on profiles.id = picks.user_id
join public.competitions competitions
  on competitions.id = picks.competition_id

union all

select
  'non_zero_gw37_stats' as protected_by,
  null::text as user_name,
  null::text as league_name,
  felipe.display_name as player_name,
  felipe.team_name,
  stats.goals,
  stats.assists,
  stats.yellow_cards,
  stats.red_cards
from felipe
join public.player_gameweek_stats stats
  on stats.player_id = felipe.id
join gw37
  on gw37.season_id = stats.season_id
 and gw37.gameweek_id = stats.gameweek_id
where coalesce(stats.goals, 0) <> 0
   or coalesce(stats.assists, 0) <> 0
   or coalesce(stats.outside_box_goals, 0) <> 0
   or coalesce(stats.outside_box_assists, 0) <> 0
   or coalesce(stats.yellow_cards, 0) <> 0
   or coalesce(stats.red_cards, 0) <> 0
   or coalesce(stats.minutes_played, 0) <> 0
   or coalesce(stats.started, false) = true
   or coalesce(stats.was_benched, false) = true
order by protected_by, user_name nulls last;

-- OPTIONAL MAPPING FIX:
-- Only run this block after replacing the target player/team values below.
-- Example target_team_name values use the database names, such as:
-- Arsenal, Brentford, Manchester City, Nottingham Forest, Wolverhampton

do $$
declare
  run_mapping_fix boolean := false;
  target_player_name text := 'PUT TARGET PLAYER NAME HERE';
  target_team_name text := 'PUT TARGET TEAM NAME HERE';
  target_season_id uuid;
  target_gameweek_id bigint;
  felipe_player_id uuid;
  replacement_player_id uuid;
begin
  if run_mapping_fix is not true then
    raise notice 'Mapping fix skipped. Set run_mapping_fix := true after choosing the replacement player/team.';
    return;
  end if;

  if target_player_name = 'PUT TARGET PLAYER NAME HERE'
     or target_team_name = 'PUT TARGET TEAM NAME HERE' then
    raise exception 'Edit target_player_name and target_team_name before running the optional mapping fix.';
  end if;

  select id
    into target_season_id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1;

  select id
    into target_gameweek_id
  from public.gameweeks
  where season_id = target_season_id
    and number = 37;

  select players.id
    into felipe_player_id
  from public.players
  join public.teams teams
    on teams.id = players.team_id
  where lower(players.display_name) = 'felipe'
    and teams.name in ('Nottingham Forest', 'Nott''m Forest')
  limit 1;

  if felipe_player_id is null then
    raise exception 'Felipe at Nottingham Forest was not found.';
  end if;

  select players.id
    into replacement_player_id
  from public.players
  join public.teams teams
    on teams.id = players.team_id
  where players.display_name = target_player_name
    and teams.name = target_team_name
    and players.is_active = true
  limit 1;

  if replacement_player_id is null then
    raise exception 'Replacement player % at % was not found as an active player.', target_player_name, target_team_name;
  end if;

  if exists (
    select 1
    from public.star_man_picks source_pick
    join public.star_man_picks replacement_pick
      on replacement_pick.competition_id = source_pick.competition_id
     and replacement_pick.season_id = source_pick.season_id
     and replacement_pick.user_id = source_pick.user_id
     and replacement_pick.player_id = replacement_player_id
     and replacement_pick.id <> source_pick.id
    where source_pick.player_id = felipe_player_id
  ) then
    raise exception 'This user has already picked the replacement player in this competition/season. Choose another replacement or resolve manually.';
  end if;

  if exists (
    select 1
    from public.player_gameweek_stats felipe_stats
    join public.player_gameweek_stats replacement_stats
      on replacement_stats.season_id = felipe_stats.season_id
     and replacement_stats.gameweek_id = felipe_stats.gameweek_id
     and replacement_stats.player_id = replacement_player_id
    where felipe_stats.season_id = target_season_id
      and felipe_stats.gameweek_id = target_gameweek_id
      and felipe_stats.player_id = felipe_player_id
  ) then
    raise exception 'Replacement already has GW37 stats. Merge those manually before repointing Felipe.';
  end if;

  update public.star_man_picks
  set player_id = replacement_player_id,
      updated_at = now()
  where season_id = target_season_id
    and gameweek_id = target_gameweek_id
    and player_id = felipe_player_id;

  update public.player_gameweek_stats
  set player_id = replacement_player_id,
      updated_at = now()
  where season_id = target_season_id
    and gameweek_id = target_gameweek_id
    and player_id = felipe_player_id;

  update public.players
  set is_active = false
  where id = felipe_player_id;

  raise notice 'Felipe GW37 references were moved to % (%). Felipe was deactivated.', target_player_name, target_team_name;
end;
$$;
