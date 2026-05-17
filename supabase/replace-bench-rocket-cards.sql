update public.card_definitions
set
  name = 'Power Of The Clean Sweep',
  effect_key = 'power_clean_sweep',
  description = 'Valid for 1 Gameweek. If you score a point in every game, earn bonus +5 UC pts. Must be played at least 90 minutes before the gameweek''s first KO time.'
where id = 'power_rocket_man';

update public.card_definitions
set
  name = 'Curse of the Furious',
  effect_key = 'curse_furious',
  description = 'Valid for 1 Gameweek. If your opponent''s Star Man gets a yellow or red card, those minus points are doubled. Must be played at least 24 hours before the gameweek''s first KO time.'
where id = 'curse_bench_warmer';

create or replace view public.star_man_score_details
with (security_invoker = true)
as
with effect_windows as (
  select
    ace.*,
    cd.effect_key,
    coalesce(sgw.number, direct_gw.number, 1) as start_number,
    coalesce(egw.number, sgw.number, direct_gw.number, 38) as end_number
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  left join public.gameweeks direct_gw on direct_gw.id = ace.gameweek_id
  left join public.gameweeks sgw on sgw.id = ace.start_gameweek_id
  left join public.gameweeks egw on egw.id = ace.end_gameweek_id
  where ace.status = 'active'
),
star_rows as (
  select
    smp.id as star_man_pick_id,
    smp.competition_id,
    smp.season_id,
    smp.gameweek_id,
    gw.number as gameweek_number,
    smp.user_id,
    smp.player_id,
    smp.pick_slot,
    coalesce(pgs.goals, 0) as goals,
    coalesce(pgs.assists, 0) as assists,
    coalesce(pgs.yellow_cards, 0) as yellow_cards,
    coalesce(pgs.red_cards, 0) as red_cards,
    p.nationality,
    p.height_cm,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_goal'
        and gw.number between ew.start_number and ew.end_number
    ) as power_goal_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.target_user_id = smp.user_id
        and ew.effect_key = 'curse_furious'
        and gw.number between ew.start_number and ew.end_number
    ) as furious_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_immigrants'
        and gw.number between ew.start_number and ew.end_number
        and p.nationality is not null
        and p.nationality <> 'England'
    ) as immigrants_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_lanky_crouch'
        and gw.number between ew.start_number and ew.end_number
        and coalesce(p.height_cm, 0) >= 185
    ) as lanky_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_small_and_mighty'
        and gw.number between ew.start_number and ew.end_number
        and coalesce(p.height_cm, 999) <= 175
    ) as small_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_assist_king'
        and gw.number between ew.start_number and ew.end_number
    ) as assist_king_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'super_star_man'
        and gw.number between ew.start_number and ew.end_number
    ) as super_star_man_applies
  from public.star_man_picks smp
  join public.gameweeks gw on gw.id = smp.gameweek_id
  left join public.player_gameweek_stat_totals pgs
    on pgs.season_id = smp.season_id
    and pgs.gameweek_id = smp.gameweek_id
    and pgs.player_id = smp.player_id
  left join public.players p on p.id = smp.player_id
)
select
  star_man_pick_id,
  competition_id,
  season_id,
  gameweek_id,
  gameweek_number,
  user_id,
  player_id,
  pick_slot,
  goals,
  assists,
  yellow_cards,
  red_cards,
  (
    (
      (goals * 3)
      + assists
      + case when power_goal_applies then 3 else 0 end
      + case when assist_king_applies then assists else 0 end
      - case when super_star_man_applies then 0 else yellow_cards * case when furious_applies then 2 else 1 end end
      - case when super_star_man_applies then 0 else red_cards * 3 * case when furious_applies then 2 else 1 end end
    )
    * case when immigrants_applies then 2 else 1 end
    * case when lanky_applies then 2 else 1 end
    * case when small_applies then 2 else 1 end
    * case when super_star_man_applies then 3 else 1 end
  )::integer as points
from star_rows;

create or replace view public.clean_sweep_bonus_points_by_user_gameweek
with (security_invoker = true)
as
with effect_windows as (
  select
    ace.*,
    cd.effect_key,
    coalesce(sgw.number, direct_gw.number, 1) as start_number,
    coalesce(egw.number, sgw.number, direct_gw.number, 38) as end_number
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  left join public.gameweeks direct_gw on direct_gw.id = ace.gameweek_id
  left join public.gameweeks sgw on sgw.id = ace.start_gameweek_id
  left join public.gameweeks egw on egw.id = ace.end_gameweek_id
  where ace.status = 'active'
    and cd.effect_key = 'power_clean_sweep'
),
scheduled_fixtures as (
  select season_id, gameweek_id, count(*)::integer as fixture_count
  from public.fixtures
  where status <> 'postponed'
  group by season_id, gameweek_id
),
completed_fixtures as (
  select f.season_id, f.gameweek_id, count(*)::integer as fixture_count
  from public.fixtures f
  join public.match_results mr on mr.fixture_id = f.id
  where f.status <> 'postponed'
  group by f.season_id, f.gameweek_id
),
positive_scores as (
  select
    competition_id,
    season_id,
    gameweek_id,
    user_id,
    count(distinct fixture_id) filter (where points > 0)::integer as positive_fixture_count
  from public.prediction_fixture_scores
  group by competition_id, season_id, gameweek_id, user_id
)
select
  ew.competition_id,
  ew.season_id,
  gw.id as gameweek_id,
  gw.number as gameweek_number,
  ew.played_by_user_id as user_id,
  5::integer as clean_sweep_bonus_points
from effect_windows ew
join public.gameweeks gw
  on gw.season_id = ew.season_id
  and gw.number between ew.start_number and ew.end_number
join scheduled_fixtures sf
  on sf.season_id = ew.season_id
  and sf.gameweek_id = gw.id
join completed_fixtures cf
  on cf.season_id = sf.season_id
  and cf.gameweek_id = sf.gameweek_id
  and cf.fixture_count = sf.fixture_count
left join positive_scores ps
  on ps.competition_id = ew.competition_id
  and ps.season_id = ew.season_id
  and ps.gameweek_id = gw.id
  and ps.user_id = ew.played_by_user_id
where sf.fixture_count > 0
  and coalesce(ps.positive_fixture_count, 0) = sf.fixture_count;

create or replace view public.clean_sweep_bonus_totals
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  user_id,
  sum(clean_sweep_bonus_points)::integer as clean_sweep_bonus_points
from public.clean_sweep_bonus_points_by_user_gameweek
group by competition_id, season_id, user_id;

grant select on public.clean_sweep_bonus_points_by_user_gameweek to authenticated;
grant select on public.clean_sweep_bonus_totals to authenticated;

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

create or replace view public.user_gameweek_stats
with (security_invoker = true)
as
select
  cm.competition_id,
  c.season_id,
  gw.id as gameweek_id,
  gw.number as gameweek_number,
  cm.user_id,
  pr.display_name,
  coalesce(pp.prediction_points, 0) as prediction_points,
  coalesce(sp.star_man_points, 0) as star_man_points,
  coalesce(gb.game_card_bonus_points, 0) as game_card_bonus_points,
  coalesce(ss.super_score_points, 0) as super_score_points,
  coalesce(pp.prediction_points, 0)
    + coalesce(sp.star_man_points, 0)
    + coalesce(gb.game_card_bonus_points, 0)
    + coalesce(ss.super_score_points, 0)
    + coalesce(cs.clean_sweep_bonus_points, 0) as ultimate_champion_points,
  coalesce(pp.correct_scores, 0) as correct_scores,
  coalesce(pp.correct_results, 0) as correct_results,
  coalesce(sp.star_man_goals, 0) as star_man_goals,
  coalesce(sp.star_man_assists, 0) as star_man_assists,
  coalesce(sp.star_man_yellows, 0) as star_man_yellows,
  coalesce(sp.star_man_reds, 0) as star_man_reds,
  coalesce(cs.clean_sweep_bonus_points, 0) as clean_sweep_bonus_points
from public.competition_members cm
join public.competitions c on c.id = cm.competition_id
join public.gameweeks gw on gw.season_id = c.season_id
join public.profiles pr on pr.id = cm.user_id
left join public.prediction_points_by_user_gameweek pp
  on pp.user_id = cm.user_id
  and pp.competition_id = cm.competition_id
  and pp.season_id = c.season_id
  and pp.gameweek_id = gw.id
left join public.star_man_points_by_user_gameweek sp
  on sp.user_id = cm.user_id
  and sp.competition_id = cm.competition_id
  and sp.season_id = c.season_id
  and sp.gameweek_id = gw.id
left join (
  select
    gcr.competition_id,
    gcr.season_id,
    gcr.end_gameweek_id as gameweek_id,
    gcs.user_id,
    count(*)::integer as game_card_bonus_points
  from public.game_card_round_standings gcs
  join public.game_card_rounds gcr on gcr.id = gcs.round_id
  where gcs.earns_super_medal = true
    and gcs.completed_gameweeks >= 5
  group by gcr.competition_id, gcr.season_id, gcr.end_gameweek_id, gcs.user_id
) gb
  on gb.user_id = cm.user_id
  and gb.competition_id = cm.competition_id
  and gb.season_id = c.season_id
  and gb.gameweek_id = gw.id
left join public.super_score_points_by_user_gameweek ss
  on ss.user_id = cm.user_id
  and ss.competition_id = cm.competition_id
  and ss.season_id = c.season_id
  and ss.gameweek_id = gw.id
left join public.clean_sweep_bonus_points_by_user_gameweek cs
  on cs.user_id = cm.user_id
  and cs.competition_id = cm.competition_id
  and cs.season_id = c.season_id
  and cs.gameweek_id = gw.id;
