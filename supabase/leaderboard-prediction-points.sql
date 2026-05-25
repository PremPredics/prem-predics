create or replace view public.prediction_totals
with (security_invoker = true)
as
select
  competition_id,
  user_id,
  season_id,
  count(*) filter (where is_correct_score) as correct_scores,
  count(*) filter (where is_correct_result) as correct_results,
  coalesce(sum(points), 0) as prediction_points
from public.prediction_fixture_scores
group by competition_id, user_id, season_id;

create or replace view public.leaderboard
with (security_invoker = true)
as
select
  cm.competition_id,
  c.name as competition_name,
  c.season_id,
  cm.user_id,
  pr.display_name,
  coalesce(pt.prediction_points, 0) as prediction_points,
  coalesce(smt.star_man_points, 0) as star_man_points,
  coalesce(gcb.game_card_bonus_points, 0) as game_card_bonus_points,
  coalesce(ssb.super_score_points, 0) as super_score_points,
  coalesce(pt.prediction_points, 0)
    + coalesce(smt.star_man_points, 0)
    + coalesce(gcb.game_card_bonus_points, 0)
    + coalesce(ssb.super_score_points, 0)
    + coalesce(csb.clean_sweep_bonus_points, 0) as ultimate_champion_points,
  coalesce(pt.correct_scores, 0) as correct_scores,
  coalesce(pt.correct_results, 0) as correct_results,
  coalesce(smt.star_man_goals, 0) as star_man_goals,
  coalesce(smt.star_man_assists, 0) as star_man_assists,
  coalesce(smt.star_man_yellows, 0) as star_man_yellows,
  coalesce(smt.star_man_reds, 0) as star_man_reds,
  coalesce(csb.clean_sweep_bonus_points, 0) as clean_sweep_bonus_points
from public.competition_members cm
join public.competitions c on c.id = cm.competition_id
join public.profiles pr on pr.id = cm.user_id
left join public.prediction_totals pt
  on pt.user_id = cm.user_id
  and pt.competition_id = cm.competition_id
  and pt.season_id = c.season_id
left join public.star_man_totals smt
  on smt.user_id = cm.user_id
  and smt.competition_id = cm.competition_id
  and smt.season_id = c.season_id
left join public.game_card_bonus_totals gcb
  on gcb.user_id = cm.user_id
  and gcb.competition_id = cm.competition_id
  and gcb.season_id = c.season_id
left join public.super_score_bonus_totals ssb
  on ssb.user_id = cm.user_id
  and ssb.competition_id = cm.competition_id
  and ssb.season_id = c.season_id
left join public.clean_sweep_bonus_totals csb
  on csb.user_id = cm.user_id
  and csb.competition_id = cm.competition_id
  and csb.season_id = c.season_id;

grant select on public.prediction_totals to authenticated;
grant select on public.leaderboard to authenticated;
