-- Make equal Game Card scores share their position.
-- Run or re-run this in Supabase SQL Editor.
--
-- Final ties use total absolute distance and then the stored random tiebreak.
-- Main-leaderboard UC points are deliberately not a Game Card tiebreak.
--
-- This migration changes views only. It does not delete or rewrite leagues,
-- users, predictions, results, cards, or any other saved game data.

begin;

create or replace view public.game_card_week_scores
with (security_invoker = true)
as
with scored as (
  select
    gcr.id as round_id,
    gcr.competition_id,
    gcr.season_id,
    gcr.card_id,
    gcr.round_number,
    gcp.gameweek_id,
    gw.number as gameweek_number,
    gcp.user_id,
    gcp.predicted_value,
    coalesce(gcrs.actual_value, gcar.actual_value) as actual_value,
    abs(gcp.predicted_value - coalesce(gcrs.actual_value, gcar.actual_value)) as difference
  from public.game_card_predictions gcp
  join public.game_card_rounds gcr on gcr.id = gcp.round_id
  join public.gameweeks gw on gw.id = gcp.gameweek_id
  left join public.game_card_results gcrs
    on gcrs.round_id = gcp.round_id
    and gcrs.gameweek_id = gcp.gameweek_id
  left join public.game_card_actual_results gcar
    on gcar.season_id = gcr.season_id
    and gcar.gameweek_id = gcp.gameweek_id
    and gcar.card_id = gcr.card_id
  where coalesce(gcrs.actual_value, gcar.actual_value) is not null
),
ranked as (
  select
    scored.*,
    rank() over (
      partition by round_id, gameweek_id
      order by difference asc
    ) as weekly_rank
  from scored
)
select
  ranked.round_id,
  ranked.competition_id,
  ranked.season_id,
  ranked.card_id,
  ranked.round_number,
  ranked.gameweek_id,
  ranked.gameweek_number,
  ranked.user_id,
  ranked.predicted_value,
  ranked.actual_value,
  ranked.difference,
  ranked.weekly_rank = 1 as is_weekly_winner,
  ranked.weekly_rank
from ranked;

create or replace view public.game_card_round_standings
with (security_invoker = true)
as
with standings as (
  select
    round_id,
    competition_id,
    season_id,
    card_id,
    round_number,
    user_id,
    count(distinct gameweek_id) as completed_gameweeks,
    count(*) filter (where is_weekly_winner) as weekly_wins,
    sum(difference) as total_difference,
    sum(weekly_rank) as rank_points
  from public.game_card_week_scores
  group by round_id, competition_id, season_id, card_id, round_number, user_id
),
ranked as (
  select
    standings.round_id,
    standings.competition_id,
    standings.season_id,
    standings.card_id,
    standings.round_number,
    standings.user_id,
    standings.completed_gameweeks,
    standings.weekly_wins,
    standings.total_difference,
    coalesce(gcrt.uc_points_at_tiebreak, 0) as uc_points_at_tiebreak,
    coalesce(gcrt.random_tiebreak_rank, 999999) as random_tiebreak_rank,
    rank() over (
      partition by standings.round_id
      order by
        standings.rank_points asc,
        standings.total_difference asc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc
    ) as round_rank
  from standings
  left join public.game_card_round_tiebreaks gcrt
    on gcrt.round_id = standings.round_id
    and gcrt.user_id = standings.user_id
)
select
  ranked.*,
  ranked.round_rank = 1 as earns_super_medal
from ranked;

grant select on public.game_card_week_scores to authenticated;
grant select on public.game_card_round_standings to authenticated;

notify pgrst, 'reload schema';

commit;

-- Read-only confirmation. Equal differences must have the same weekly_rank;
-- equal current ranking totals must have the same round_rank.
select
  round_id,
  gameweek_number,
  predicted_value,
  actual_value,
  difference,
  weekly_rank,
  user_id
from public.game_card_week_scores
order by round_id, gameweek_number, weekly_rank, user_id;

select
  round_id,
  round_rank,
  completed_gameweeks,
  weekly_wins,
  total_difference,
  user_id
from public.game_card_round_standings
order by round_id, round_rank, user_id;
