-- Prem Predics: Awards. Paste this WHOLE file into Supabase SQL Editor and Run.
-- Safe to run again. Creates one read-only function; no data is changed/deleted.
-- Existing leagues, results, predictions, cards, player history and scoring stay intact.
-- SECURITY INVOKER retains existing RLS. Membership is also checked explicitly.
-- No tracking tables: historical records already contain these achievements.
begin;

create or replace function public.get_league_awards(target_competition_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $awards$
with league as materialized (
  select c.* from public.competitions c
  where c.id = target_competition_id
    and (select auth.uid()) is not null
    and exists (select 1 from public.competition_members cm
      where cm.competition_id = c.id and cm.user_id = (select auth.uid()))
), members as materialized (
  select cm.user_id, p.display_name, p.profile_image_url, cm.joined_at
  from public.competition_members cm join league l on l.id = cm.competition_id
  join public.profiles p on p.id = cm.user_id
), season_fixtures as materialized (
  select f.*, gw.number as gameweek_number, mr.home_goals, mr.away_goals,
    mr.fixture_id is not null as has_result
  from league l join public.gameweeks gw on gw.season_id = l.season_id
  join public.gameweeks start_gw on start_gw.id = l.starts_gameweek_id
  join public.fixtures f on f.gameweek_id = gw.id and f.season_id = l.season_id
  left join public.match_results mr on mr.fixture_id = f.id
  where gw.number >= start_gw.number and f.status <> 'postponed'
), final_fixtures as materialized (
  select * from season_fixtures where status = 'final' and has_result and kickoff_at <= now()
), completed_weeks as materialized (
  select gameweek_id from season_fixtures group by gameweek_id
  having bool_and(status = 'final' and has_result and kickoff_at <= now())
), scores as materialized (
  -- Authoritative CS/CR flags include all existing Power/Curse scoring rules.
  select s.* from public.prediction_fixture_scores s
  join league l on l.id = s.competition_id and l.season_id = s.season_id
  join members m on m.user_id = s.user_id
  join final_fixtures f on f.id = s.fixture_id
), prediction_modes as materialized (
  select d.*,
    bool_or(d.prediction_slot in ('curse_hated','curse_gambler')) over w as has_curse,
    bool_or(d.prediction_slot = 'power_of_god') over w as has_god,
    row_number() over (partition by d.user_id, d.fixture_id,
      (d.prediction_slot in ('curse_hated','curse_gambler'))
      order by e.played_at desc nulls last, d.prediction_id::text desc) as override_order
  from public.prediction_score_details d
  join league l on l.id = d.competition_id and l.season_id = d.season_id
  join members m on m.user_id = d.user_id
  join final_fixtures f on f.id = d.fixture_id
  left join public.active_card_effects e on e.id = d.source_card_effect_id
  where d.prediction_slot in ('primary','power_of_god','hedge')
    or d.prediction_slot like 'hedge_%'
    or (d.prediction_slot in ('curse_hated','curse_gambler') and e.status = 'active')
  window w as (partition by d.user_id, d.fixture_id)
), considered as materialized (
  select * from prediction_modes
  where (has_curse and prediction_slot in ('curse_hated','curse_gambler') and override_order = 1)
    or (not has_curse and has_god and prediction_slot = 'power_of_god')
    or (not has_curse and not has_god
      and (prediction_slot in ('primary','hedge') or prediction_slot like 'hedge_%'))
), main_predictions as materialized (
  -- One main prediction per user/match; Hedge extras do not inflate comparisons.
  select distinct on (user_id, fixture_id) * from considered
  where prediction_slot in ('primary','power_of_god','curse_hated','curse_gambler')
  order by user_id, fixture_id, prediction_id
), prediction_metrics as (
  select p.user_id, count(*) as prediction_count,
    sum(p.predicted_home_goals + p.predicted_away_goals) as predicted_goals,
    count(*) filter (where
      abs(p.predicted_home_goals - p.actual_home_goals)
      + abs(p.predicted_away_goals - p.actual_away_goals) = 1
      and not coalesce(s.is_correct_score,false)) as post
  from main_predictions p left join scores s on s.user_id = p.user_id and s.fixture_id = p.fixture_id
  group by p.user_id
), score_metrics as (
  select s.user_id, count(*) filter (where s.is_correct_score) as nostradamus,
    max(f.home_goals + f.away_goals) filter (where s.is_correct_score) as best,
    count(*) filter (where s.is_correct_result
      and (select count(distinct p.user_id) from considered p where p.fixture_id = s.fixture_id)
        = (select count(*) from members)
      and not exists (select 1 from considered p where p.fixture_id = s.fixture_id
        and p.user_id <> s.user_id
        and sign(p.predicted_home_goals - p.predicted_away_goals) = sign(f.home_goals - f.away_goals))
      and (select count(*) from members) > 1) as world
  from scores s join final_fixtures f on f.id = s.fixture_id group by s.user_id
), pairs as (
  select a.user_id as user_a, b.user_id as user_b, count(*) as matches
  from main_predictions a join main_predictions b
    on b.fixture_id = a.fixture_id and a.user_id < b.user_id
    and a.predicted_home_goals = b.predicted_home_goals
    and a.predicted_away_goals = b.predicted_away_goals
  group by a.user_id, b.user_id
), plays as materialized (
  select e.*, cd.category, cd.effect_key from public.active_card_effects e
  join league l on l.id = e.competition_id and l.season_id = e.season_id
  join public.card_definitions cd on cd.id = e.card_id
  where e.status in ('active','resolved','vetoed') and e.played_at <= now()
    and (cd.effect_key not in ('curse_thief','power_swap') or e.status = 'resolved')
), targets as materialized (
  select id as effect_id, target_user_id from plays where target_user_id is not null
  union
  select t.card_effect_id, t.target_user_id from public.card_effect_targets t
  join plays e on e.id = t.card_effect_id
), power_metrics as (
  select played_by_user_id as user_id, count(*) as superman from plays
  where category = 'power' group by played_by_user_id
), curse_metrics as (
  select e.played_by_user_id as user_id, count(distinct e.id) as jinx from plays e
  join targets t on t.effect_id = e.id
  where e.category = 'curse' and t.target_user_id <> e.played_by_user_id
  group by e.played_by_user_id
), received_metrics as (
  select t.target_user_id as user_id, count(distinct e.id) as received from plays e
  join targets t on t.effect_id = e.id
  where e.category = 'curse' and t.target_user_id <> e.played_by_user_id
  group by t.target_user_id
), revealed_star_picks as materialized (
  select p.*, lower(trim(pl.nationality)) as nationality
  from public.star_man_picks p
  join league l on l.id = p.competition_id and l.season_id = p.season_id
  join members m on m.user_id = p.user_id
  join public.gameweeks gw on gw.id = p.gameweek_id
  join public.gameweeks start_gw on start_gw.id = l.starts_gameweek_id
  join public.players pl on pl.id = p.player_id
  where gw.number >= start_gw.number
    -- Same filter for all viewers, including the pick's owner and admins.
    -- Late Scout remains private until the selected player's match starts.
    and now() >= public.star_man_lock_at_for_gameweek(p.season_id,p.gameweek_id)
    and now() >= public.player_gameweek_first_kickoff_at(p.season_id,p.gameweek_id,p.player_id)
), star_metrics as (
  select p.user_id, count(*) as star_pick_count, count(distinct nullif(p.nationality,'')) as passport,
    coalesce(sum(s.points),0) as starboy
  from revealed_star_picks p
  left join public.star_man_score_details s on s.star_man_pick_id = p.id
  group by p.user_id
), weekly_scores as materialized (
  select s.user_id,s.gameweek_id,s.ultimate_champion_points,
    max(s.ultimate_champion_points) over (partition by s.gameweek_id) as top_points
  from public.user_gameweek_stats s
  join league l on l.id = s.competition_id and l.season_id = s.season_id
  join members m on m.user_id = s.user_id
  join completed_weeks w on w.gameweek_id = s.gameweek_id
), win_metrics as (
  select user_id, count(*) filter (where ultimate_champion_points = top_points) as wins
  from weekly_scores group by user_id
), member_metrics as (
  select m.user_id,m.display_name,m.profile_image_url,
    coalesce(sm.nostradamus,0) as nostradamus, sm.best, coalesce(sm.world,0) as world,
    coalesce(pm.prediction_count,0) as prediction_count, coalesce(pm.predicted_goals,0) as predicted_goals,
    coalesce(pm.post,0) as post, coalesce(pwm.superman,0) as superman,
    coalesce(cm.jinx,0) as jinx, coalesce(rm.received,0) as received,
    coalesce(st.passport,0) as passport, coalesce(st.starboy,0) as starboy,
    coalesce(st.star_pick_count,0) as star_pick_count, coalesce(wm.wins,0) as wins
  from members m
  left join score_metrics sm on sm.user_id = m.user_id
  left join prediction_metrics pm on pm.user_id = m.user_id
  left join power_metrics pwm on pwm.user_id = m.user_id
  left join curse_metrics cm on cm.user_id = m.user_id
  left join received_metrics rm on rm.user_id = m.user_id
  left join star_metrics st on st.user_id = m.user_id
  left join win_metrics wm on wm.user_id = m.user_id
), best_predictions as (
  select distinct on (s.user_id) s.user_id, f.gameweek_number,
    ht.name as home_team, at.name as away_team, f.home_goals, f.away_goals,
    f.home_goals + f.away_goals as goals
  from scores s join final_fixtures f on f.id = s.fixture_id
  join score_metrics sm on sm.user_id = s.user_id and sm.best = f.home_goals + f.away_goals
  join public.teams ht on ht.id = f.home_team_id join public.teams at on at.id = f.away_team_id
  where s.is_correct_score order by s.user_id, f.gameweek_number, f.kickoff_at, f.id
)
select jsonb_build_object(
  'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.display_name,m.user_id) from member_metrics m),'[]'::jsonb),
  'copycats', coalesce((select jsonb_agg(to_jsonb(p) order by p.user_a,p.user_b) from pairs p),'[]'::jsonb),
  'best_predictions', coalesce((select jsonb_agg(to_jsonb(b)) from best_predictions b),'[]'::jsonb),
  'completed_gameweeks', (select count(*) from completed_weeks)
) from league;
$awards$;

revoke all on function public.get_league_awards(uuid) from public, anon;
grant execute on function public.get_league_awards(uuid) to authenticated;
comment on function public.get_league_awards(uuid) is
  'Read-only season Awards for current league members. RLS retained; no future picks exposed. Tied weekly UC leaders each earn one win.';
notify pgrst, 'reload schema';
commit;

-- Optional audit (SQL Editor): confirms invoker security and restricted privileges.
-- select proname, prosecdef, proconfig, proacl from pg_proc
-- where oid = 'public.get_league_awards(uuid)'::regprocedure;
-- Calling in SQL Editor without an authenticated member JWT returns null by design.
