-- Prem Predics: participation-first Game Card rankings and Veto slot integrity.
-- Safe and idempotent. This migration does not delete leagues, predictions,
-- results, cards, statistics, members, or historical card effects.

begin;

-- Equal distances continue to share the same weekly position.
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

-- Round order:
--   1. fewest missed Game Card submissions;
--   2. lowest total of shared weekly positions;
--   3. most exact predictions;
--   4. lowest total absolute distance;
--   5. stored random tiebreak (UC points are deliberately not considered).
-- A missed result-bearing Gameweek also adds member_count + 1 rank points.
create or replace view public.game_card_round_standings
with (security_invoker = true)
as
with round_scope as (
  select
    gcr.id as round_id,
    gcr.competition_id,
    gcr.season_id,
    gcr.card_id,
    gcr.round_number,
    start_gw.number as start_gameweek_number,
    end_gw.number as end_gameweek_number
  from public.game_card_rounds gcr
  join public.gameweeks start_gw on start_gw.id = gcr.start_gameweek_id
  join public.gameweeks end_gw on end_gw.id = gcr.end_gameweek_id
),
result_weeks as (
  select
    scope.round_id,
    gw.id as gameweek_id
  from round_scope scope
  join public.gameweeks gw
    on gw.season_id = scope.season_id
   and gw.number between scope.start_gameweek_number and scope.end_gameweek_number
  left join public.game_card_results gcrs
    on gcrs.round_id = scope.round_id
   and gcrs.gameweek_id = gw.id
  left join public.game_card_actual_results gcar
    on gcar.season_id = scope.season_id
   and gcar.gameweek_id = gw.id
   and gcar.card_id = scope.card_id
  where coalesce(gcrs.actual_value, gcar.actual_value) is not null
),
round_totals as (
  select
    scope.round_id,
    scope.competition_id,
    scope.season_id,
    scope.card_id,
    scope.round_number,
    count(result_weeks.gameweek_id)::bigint as expected_gameweeks
  from round_scope scope
  left join result_weeks on result_weeks.round_id = scope.round_id
  group by scope.round_id, scope.competition_id, scope.season_id, scope.card_id, scope.round_number
),
participants as (
  select
    totals.*,
    members.user_id,
    count(*) over (partition by totals.round_id)::bigint as member_count
  from round_totals totals
  join public.competition_members members
    on members.competition_id = totals.competition_id
  where totals.expected_gameweeks > 0
),
standings as (
  select
    participants.round_id,
    participants.competition_id,
    participants.season_id,
    participants.card_id,
    participants.round_number,
    participants.user_id,
    count(distinct scores.gameweek_id)::bigint as completed_gameweeks,
    count(*) filter (where scores.is_weekly_winner)::bigint as weekly_wins,
    coalesce(sum(scores.difference), 0::bigint)::bigint as total_difference,
    participants.expected_gameweeks,
    greatest(
      participants.expected_gameweeks - count(distinct scores.gameweek_id)::bigint,
      0::bigint
    ) as missed_gameweeks,
    count(*) filter (where scores.difference = 0)::bigint as exact_predictions,
    coalesce(sum(scores.weekly_rank), 0::numeric)
      + greatest(
          participants.expected_gameweeks - count(distinct scores.gameweek_id)::bigint,
          0::bigint
        ) * (participants.member_count + 1) as rank_points
  from participants
  left join public.game_card_week_scores scores
    on scores.round_id = participants.round_id
   and scores.user_id = participants.user_id
  group by
    participants.round_id,
    participants.competition_id,
    participants.season_id,
    participants.card_id,
    participants.round_number,
    participants.user_id,
    participants.expected_gameweeks,
    participants.member_count
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
    standings.expected_gameweeks,
    standings.missed_gameweeks,
    standings.exact_predictions,
    standings.rank_points,
    coalesce(gcrt.uc_points_at_tiebreak, 0) as uc_points_at_tiebreak,
    coalesce(gcrt.random_tiebreak_rank, 999999) as random_tiebreak_rank,
    rank() over (
      partition by standings.round_id
      order by
        standings.missed_gameweeks asc,
        standings.rank_points asc,
        standings.exact_predictions desc,
        standings.total_difference asc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc
    ) as round_rank
  from standings
  left join public.game_card_round_tiebreaks gcrt
    on gcrt.round_id = standings.round_id
   and gcrt.user_id = standings.user_id
)
select
  ranked.round_id,
  ranked.competition_id,
  ranked.season_id,
  ranked.card_id,
  ranked.round_number,
  ranked.user_id,
  ranked.completed_gameweeks,
  ranked.weekly_wins,
  ranked.total_difference,
  ranked.uc_points_at_tiebreak,
  ranked.random_tiebreak_rank,
  ranked.round_rank,
  ranked.round_rank = 1 as earns_super_medal,
  ranked.expected_gameweeks,
  ranked.missed_gameweeks,
  ranked.exact_predictions,
  ranked.rank_points
from ranked;

grant select on public.game_card_week_scores to authenticated;
grant select on public.game_card_round_standings to authenticated;

-- A vetoed Curse has no live effect, but it continues to occupy one of the
-- victim's three Curse slots for that Gameweek.
create or replace function public.enforce_curse_target_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  card_category text;
  card_effect_key text;
  target_gameweek_id bigint;
  target_gameweek_number integer;
  member_count integer;
  active_curse_count integer;
  previous_target_user_id uuid;
  trusted_thief_target_completion boolean := false;
begin
  if tg_op = 'UPDATE' and new.target_user_id is distinct from old.target_user_id then
    select cd.effect_key
      into card_effect_key
    from public.card_definitions cd
    where cd.id = old.card_id;

    trusted_thief_target_completion :=
      card_effect_key = 'curse_thief'
      and old.status = 'active'
      and new.status = 'active'
      and old.target_user_id is null
      and new.target_user_id is not null
      and current_setting('app.curse_thief_completion_effect_id', true) = old.id::text;
  end if;

  if tg_op = 'UPDATE' then
    if auth.uid() is not null
      and not public.is_admin()
      and (
        new.competition_id is distinct from old.competition_id
        or new.card_instance_id is distinct from old.card_instance_id
        or new.card_id is distinct from old.card_id
        or new.season_id is distinct from old.season_id
        or new.gameweek_id is distinct from old.gameweek_id
        or new.start_gameweek_id is distinct from old.start_gameweek_id
        or new.end_gameweek_id is distinct from old.end_gameweek_id
        or new.played_by_user_id is distinct from old.played_by_user_id
        or (
          new.target_user_id is distinct from old.target_user_id
          and not trusted_thief_target_completion
        )
      )
    then
      raise exception 'A played card''s owner, target and Gameweek cannot be changed.';
    end if;
  end if;

  if coalesce(new.status, 'active') <> 'active' or new.target_user_id is null then
    return new;
  end if;

  select cd.category
    into card_category
  from public.card_definitions cd
  where cd.id = new.card_id;

  if card_category is distinct from 'curse'
    or new.target_user_id = new.played_by_user_id
  then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    raise exception 'A Curse Card must have a Gameweek.';
  end if;

  select gw.number
    into target_gameweek_number
  from public.gameweeks gw
  where gw.id = target_gameweek_id
    and gw.season_id = new.season_id;

  if target_gameweek_number is null then
    raise exception 'The Curse Card Gameweek does not belong to this season.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'curse-target-cap:' || new.competition_id::text || ':' || new.target_user_id::text || ':' || target_gameweek_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'curse-target-order:' || new.competition_id::text || ':' || new.played_by_user_id::text || ':' || target_gameweek_id::text,
      0
    )
  );

  select count(*)::integer
    into active_curse_count
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.category = 'curse'
  join public.gameweeks start_gw
    on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
   and start_gw.season_id = ace.season_id
  join public.gameweeks end_gw
    on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
   and end_gw.season_id = ace.season_id
  where ace.id is distinct from new.id
    and ace.competition_id = new.competition_id
    and ace.season_id = new.season_id
    and ace.target_user_id = new.target_user_id
    and ace.target_user_id is distinct from ace.played_by_user_id
    and (
      ace.status in ('active', 'vetoed')
      or (ace.status = 'resolved' and cd.effect_key = 'curse_thief')
    )
    and target_gameweek_number between start_gw.number and end_gw.number;

  if active_curse_count >= 3 then
    raise exception 'This player already has the maximum of 3 Curse Cards for this Gameweek.';
  end if;

  select count(*)::integer
    into member_count
  from public.competition_members cm
  where cm.competition_id = new.competition_id;

  if member_count >= 3 then
    select ace.target_user_id
      into previous_target_user_id
    from public.active_card_effects ace
    join public.card_definitions cd
      on cd.id = ace.card_id
     and cd.category = 'curse'
    where ace.id is distinct from new.id
      and ace.competition_id = new.competition_id
      and ace.season_id = new.season_id
      and ace.played_by_user_id = new.played_by_user_id
      and ace.target_user_id is not null
      and ace.target_user_id is distinct from ace.played_by_user_id
      and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
      and lower(coalesce(ace.status, '')) not in ('cancelled', 'removed')
    order by ace.played_at desc, ace.id desc
    limit 1;

    if previous_target_user_id = new.target_user_id then
      raise exception 'Your next Curse this Gameweek must target a different player.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_curse_target_rules() from public;

drop trigger if exists active_card_effects_enforce_curse_target_rules
on public.active_card_effects;

create trigger active_card_effects_enforce_curse_target_rules
before insert or update of competition_id, card_instance_id, card_id, season_id,
  gameweek_id, start_gameweek_id, end_gameweek_id, played_by_user_id,
  target_user_id, status
on public.active_card_effects
for each row execute function public.enforce_curse_target_rules();

-- Repair only Veto card instances that already have a resolved Veto effect but
-- were left in hand/active by an older deployment. No other card is touched.
update public.league_cards lc
set zone = 'discard',
    updated_at = clock_timestamp()
from public.active_card_effects ace,
     public.card_definitions cd
where ace.card_instance_id = lc.id
  and cd.id = ace.card_id
  and cd.effect_key = 'power_veto'
  and ace.status in ('resolved', 'vetoed')
  and lc.zone in ('hand', 'active');

notify pgrst, 'reload schema';

commit;

-- Audit only: review current ranking inputs after the migration.
select
  round_id,
  round_rank,
  completed_gameweeks,
  expected_gameweeks,
  missed_gameweeks,
  exact_predictions,
  rank_points,
  total_difference,
  user_id
from public.game_card_round_standings
order by round_id, round_rank, user_id;

-- Audit only: vetoed Curses count toward slots but are not live effects.
select
  ace.competition_id,
  coalesce(ace.start_gameweek_id, ace.gameweek_id) as gameweek_id,
  ace.target_user_id,
  count(*)::integer as occupied_curse_slots
from public.active_card_effects ace
join public.card_definitions cd
  on cd.id = ace.card_id
 and cd.category = 'curse'
where ace.target_user_id is not null
  and (
    ace.status in ('active', 'vetoed')
    or (ace.status = 'resolved' and cd.effect_key = 'curse_thief')
  )
group by ace.competition_id, coalesce(ace.start_gameweek_id, ace.gameweek_id), ace.target_user_id
order by occupied_curse_slots desc, gameweek_id desc;
