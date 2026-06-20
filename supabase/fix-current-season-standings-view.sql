-- Fix Premier League table rows so computed standings only include teams
-- that appear in the selected season's fixtures.

create or replace view public.team_gameweek_computed_standings
with (security_invoker = true)
as
with match_rows as (
  select
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    f.home_team_id as team_id,
    1 as played,
    case when mr.home_goals > mr.away_goals then 1 else 0 end as wins,
    case when mr.home_goals = mr.away_goals then 1 else 0 end as draws,
    case when mr.home_goals < mr.away_goals then 1 else 0 end as losses,
    mr.home_goals as goals_for,
    mr.away_goals as goals_against,
    case
      when mr.home_goals > mr.away_goals then 3
      when mr.home_goals = mr.away_goals then 1
      else 0
    end as points
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  join public.match_results mr on mr.fixture_id = f.id

  union all

  select
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    f.away_team_id as team_id,
    1 as played,
    case when mr.away_goals > mr.home_goals then 1 else 0 end as wins,
    case when mr.away_goals = mr.home_goals then 1 else 0 end as draws,
    case when mr.away_goals < mr.home_goals then 1 else 0 end as losses,
    mr.away_goals as goals_for,
    mr.home_goals as goals_against,
    case
      when mr.away_goals > mr.home_goals then 3
      when mr.away_goals = mr.home_goals then 1
      else 0
    end as points
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  join public.match_results mr on mr.fixture_id = f.id
),
season_teams as (
  select distinct
    f.season_id,
    f.home_team_id as team_id
  from public.fixtures f

  union

  select distinct
    f.season_id,
    f.away_team_id as team_id
  from public.fixtures f
),
cumulative as (
  select
    gw.season_id,
    gw.id as gameweek_id,
    gw.number as gameweek_number,
    t.id as team_id,
    t.name as team_name,
    coalesce(sum(mr.played) filter (where mr.gameweek_number <= gw.number), 0)::integer as played,
    coalesce(sum(mr.wins) filter (where mr.gameweek_number <= gw.number), 0)::integer as wins,
    coalesce(sum(mr.draws) filter (where mr.gameweek_number <= gw.number), 0)::integer as draws,
    coalesce(sum(mr.losses) filter (where mr.gameweek_number <= gw.number), 0)::integer as losses,
    coalesce(sum(mr.goals_for) filter (where mr.gameweek_number <= gw.number), 0)::integer as goals_for,
    coalesce(sum(mr.goals_against) filter (where mr.gameweek_number <= gw.number), 0)::integer as goals_against,
    coalesce(sum(mr.points) filter (where mr.gameweek_number <= gw.number), 0)::integer as points
  from public.gameweeks gw
  join season_teams st
    on st.season_id = gw.season_id
  join public.teams t
    on t.id = st.team_id
  left join match_rows mr
    on mr.season_id = gw.season_id
   and mr.team_id = t.id
   and mr.gameweek_number <= gw.number
  group by gw.season_id, gw.id, gw.number, t.id, t.name
)
select
  row_number() over (
    partition by season_id, gameweek_id
    order by points desc, (goals_for - goals_against) desc, goals_for desc, team_name asc
  )::integer as league_position,
  season_id,
  gameweek_id,
  gameweek_number,
  team_id,
  team_name,
  played,
  wins,
  draws,
  losses,
  goals_for,
  goals_against,
  (goals_for - goals_against)::integer as goal_difference,
  points
from cumulative;
