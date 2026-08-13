begin;

update public.card_definitions
set name = case effect_key
    when 'power_immigrants' then 'Power Of The Foreigners'
    when 'power_snow' then 'Power Of The Early Bath'
    else name
  end,
  description = case effect_key
    when 'power_immigrants' then 'Valid for 1 Gameweek. Non-English Star Men score DOUBLE points. Yellow Cards and Red Cards are not doubled. Must be played at least 90 minutes before the gameweek''s first KO time.'
    when 'power_snow' then 'Valid for 1 Gameweek. Predictions for fixtures marked as having a red card in the first 15 minutes score DOUBLE points. Must be played at least 90 minutes before the gameweek''s first KO time.'
    when 'power_of_god' then 'Change one current Gameweek match prediction from kick-off until the start of the 2nd half.'
    else description
  end
where effect_key in ('power_immigrants', 'power_snow', 'power_of_god');

create or replace function public.play_power_of_god_and_replace_prediction(
  target_competition_id uuid,
  target_card_instance_id uuid,
  target_gameweek_id bigint,
  target_fixture_id uuid,
  target_home_goals integer,
  target_away_goals integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  target_season_id uuid;
  target_card record;
  target_fixture record;
  target_prediction record;
  target_effect_id uuid;
  target_discard_order integer;
begin
  if actor_user_id is null then raise exception 'You must be logged in.'; end if;
  if target_home_goals is null or target_away_goals is null or target_home_goals < 0 or target_away_goals < 0 then
    raise exception 'Enter a valid replacement scoreline.';
  end if;

  select c.season_id into target_season_id from public.competitions c where c.id = target_competition_id;
  if target_season_id is null or not public.is_competition_member(target_competition_id) then
    raise exception 'Private league not found or you are not a member.';
  end if;

  select lc.id, lc.card_id, lc.owner_user_id, lc.zone, cd.effect_key into target_card
  from public.league_cards lc join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = target_card_instance_id and lc.competition_id = target_competition_id
  for update of lc;
  if not found or target_card.owner_user_id is distinct from actor_user_id or target_card.zone <> 'hand' or target_card.effect_key <> 'power_of_god' then
    raise exception 'Power of God is no longer available in your hand.';
  end if;

  select f.id, f.gameweek_id, f.kickoff_at, f.status, ht.name as home_team_name, at.name as away_team_name into target_fixture
  from public.fixtures f join public.teams ht on ht.id = f.home_team_id join public.teams at on at.id = f.away_team_id
  where f.id = target_fixture_id and f.season_id = target_season_id and f.gameweek_id = target_gameweek_id
  for update of f;
  if not found or lower(coalesce(target_fixture.status, '')) in ('postponed', 'final', 'completed', 'finished', 'full_time', 'ft')
    or now() < target_fixture.kickoff_at or now() >= target_fixture.kickoff_at + interval '60 minutes' then
    raise exception 'This Card cannot be played until a match has kicked off and is not in the Second Half yet.';
  end if;

  select p.id, p.home_goals, p.away_goals into target_prediction
  from public.predictions p
  where p.competition_id = target_competition_id and p.season_id = target_season_id
    and p.fixture_id = target_fixture_id and p.user_id = actor_user_id and p.prediction_slot = 'primary'
  for update of p;
  if not found then raise exception 'No normal prediction exists for this fixture.'; end if;

  insert into public.active_card_effects (
    competition_id, card_instance_id, card_id, season_id, gameweek_id, start_gameweek_id,
    end_gameweek_id, fixture_id, played_by_user_id, target_user_id, deadline_at, payload, status, resolved_at
  ) values (
    target_competition_id, target_card_instance_id, target_card.card_id, target_season_id, target_gameweek_id,
    target_gameweek_id, target_gameweek_id, target_fixture_id, actor_user_id, actor_user_id,
    target_fixture.kickoff_at + interval '60 minutes',
    jsonb_build_object('effect_key','power_of_god','previous_home_goals',target_prediction.home_goals,
      'previous_away_goals',target_prediction.away_goals,'replacement_home_goals',target_home_goals,
      'replacement_away_goals',target_away_goals), 'resolved', now()
  ) returning id into target_effect_id;

  update public.predictions set home_goals = target_home_goals, away_goals = target_away_goals,
    submitted_at = now(), updated_at = now() where id = target_prediction.id;

  select coalesce(max(lc.sort_order), 0) + 1 into target_discard_order
  from public.league_cards lc where lc.competition_id = target_competition_id and lc.zone = 'discard';
  update public.league_cards set zone = 'discard', sort_order = target_discard_order, updated_at = now()
  where id = target_card_instance_id and competition_id = target_competition_id
    and owner_user_id = actor_user_id and zone = 'hand';
  if not found then raise exception 'Power of God could not be consumed safely.'; end if;

  return jsonb_build_object('effect_id',target_effect_id,'fixture_id',target_fixture_id,
    'fixture_name',target_fixture.home_team_name || ' v ' || target_fixture.away_team_name,
    'home_goals',target_home_goals,'away_goals',target_away_goals);
end;
$$;

revoke all on function public.play_power_of_god_and_replace_prediction(uuid, uuid, bigint, uuid, integer, integer) from public;
grant execute on function public.play_power_of_god_and_replace_prediction(uuid, uuid, bigint, uuid, integer, integer) to authenticated;

create or replace view public.star_man_score_details with (security_invoker = true) as
with effect_windows as (
  select ace.*, cd.effect_key, coalesce(sgw.number,direct_gw.number,1) start_number,
    coalesce(egw.number,sgw.number,direct_gw.number,38) end_number
  from public.active_card_effects ace join public.card_definitions cd on cd.id=ace.card_id
  left join public.gameweeks direct_gw on direct_gw.id=ace.gameweek_id
  left join public.gameweeks sgw on sgw.id=ace.start_gameweek_id
  left join public.gameweeks egw on egw.id=ace.end_gameweek_id where ace.status='active'
), star_rows as (
  select smp.id star_man_pick_id,smp.competition_id,smp.season_id,smp.gameweek_id,
    gw.number gameweek_number,smp.user_id,smp.player_id,smp.pick_slot,
    coalesce(pgs.goals,0) goals,coalesce(pgs.assists,0) assists,
    coalesce(pgs.yellow_cards,0) yellow_cards,coalesce(pgs.red_cards,0) red_cards,
    case when smp.pick_slot='primary' then (select count(*)::integer from effect_windows ew
      where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id
      and ew.effect_key='power_goal' and gw.number between ew.start_number and ew.end_number) else 0 end power_goal_count,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.target_user_id=smp.user_id and ew.effect_key='curse_furious' and gw.number between ew.start_number and ew.end_number) furious_applies,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='power_immigrants' and gw.number between ew.start_number and ew.end_number and p.nationality is not null and p.nationality<>'England') immigrants_applies,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='power_lanky_crouch' and gw.number between ew.start_number and ew.end_number and coalesce(p.height_cm,0)>=185) lanky_applies,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='power_small_and_mighty' and gw.number between ew.start_number and ew.end_number and coalesce(p.height_cm,999)<=175) small_applies,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='power_assist_king' and gw.number between ew.start_number and ew.end_number) assist_king_applies,
    exists(select 1 from effect_windows ew where ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='super_star_man' and gw.number between ew.start_number and ew.end_number) super_star_man_applies,
    exists(select 1 from effect_windows ew where ew.id=smp.source_card_effect_id and ew.competition_id=smp.competition_id and ew.played_by_user_id=smp.user_id and ew.effect_key='super_sub' and gw.number between ew.start_number and ew.end_number) super_sub_applies
  from public.star_man_picks smp join public.gameweeks gw on gw.id=smp.gameweek_id
  left join public.player_gameweek_stat_totals pgs on pgs.season_id=smp.season_id and pgs.gameweek_id=smp.gameweek_id and pgs.player_id=smp.player_id
  left join public.players p on p.id=smp.player_id
)
select star_man_pick_id,competition_id,season_id,gameweek_id,gameweek_number,user_id,player_id,pick_slot,
 goals,assists,yellow_cards,red_cards,
 (((goals*3+assists+case when assist_king_applies then assists else 0 end)
   *case when immigrants_applies then 2 else 1 end*case when lanky_applies then 2 else 1 end
   *case when small_applies then 2 else 1 end*case when super_star_man_applies then 3 else 1 end)
  +power_goal_count*3-case when super_star_man_applies or super_sub_applies then 0 else
   yellow_cards*case when furious_applies then 2 else 1 end+red_cards*3*case when furious_applies then 2 else 1 end end)::integer points
from star_rows;

notify pgrst, 'reload schema';
commit;
