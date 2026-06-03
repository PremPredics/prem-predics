-- Fix Game Card weekly ranks and final winner ordering.
-- Run this once in Supabase SQL Editor.
--
-- Weekly ranks are competition-style ranks: tied closest guesses share the
-- same rank, and the next rank skips ahead. Final round ranking is lowest
-- total weekly-rank score first, then lowest total absolute difference, then
-- highest UC points at tiebreak, then the stored random tiebreak.

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
  ranked.weekly_rank = 1 as is_weekly_winner
from ranked;

create or replace view public.game_card_round_standings
with (security_invoker = true)
as
with scored_with_ranks as (
  select
    gcs.*,
    rank() over (
      partition by gcs.round_id, gcs.gameweek_id
      order by gcs.difference asc
    ) as weekly_rank
  from public.game_card_week_scores gcs
),
standings as (
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
  from scored_with_ranks
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
    row_number() over (
      partition by standings.round_id
      order by
        standings.rank_points asc,
        standings.total_difference asc,
        coalesce(gcrt.uc_points_at_tiebreak, 0) desc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc,
        standings.user_id asc
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

commit;
