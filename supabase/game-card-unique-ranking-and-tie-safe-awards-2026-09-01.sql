-- Unique Game Card final rankings and tie-safe Super Medal awards.
--
-- Final ranking order:
--   1. fewest missed submissions;
--   2. most exact predictions;
--   3. lowest total absolute distance;
--   4. most weekly wins;
--   5. lowest total of the shared weekly ranks;
--   6. a stored random draw (user id is a temporary stable fallback before a
--      completed round receives its stored draw).
--
-- Weekly equal distances still share a weekly position. Final positions never
-- tie. In a 4-6 player league only, exactly two players tied on every sporting
-- criterion for the best performance split the two-medal pool (one each).
-- Otherwise the configured pools remain 1, 2 or 3 medals and cannot multiply
-- because several users previously shared a final rank.
--
-- Safe and idempotent: no leagues, predictions, results, cards, statistics,
-- histories or redeemed medals are deleted. Surplus unredeemed Game Card medal
-- tokens created by an old shared-final-rank calculation are marked void.

begin;

create or replace function public.ensure_game_card_tiebreaks(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  with completed_rounds as (
    select gcr.id as round_id
    from public.game_card_rounds gcr
    join public.gameweeks start_gw on start_gw.id = gcr.start_gameweek_id
    join public.gameweeks end_gw on end_gw.id = gcr.end_gameweek_id
    where gcr.competition_id = target_competition_id
      and (
        select count(distinct actuals.gameweek_id)
        from (
          select gcrs.gameweek_id
          from public.game_card_results gcrs
          where gcrs.round_id = gcr.id
          union
          select gcar.gameweek_id
          from public.game_card_actual_results gcar
          join public.gameweeks actual_gw
            on actual_gw.id = gcar.gameweek_id
           and actual_gw.season_id = gcr.season_id
          where gcar.season_id = gcr.season_id
            and gcar.card_id = gcr.card_id
            and actual_gw.number between start_gw.number and end_gw.number
        ) actuals
      ) >= (end_gw.number - start_gw.number + 1)
  ),
  missing_members as (
    select
      completed.round_id,
      cm.user_id,
      coalesce(lb.ultimate_champion_points, 0)::integer as uc_points_at_tiebreak,
      coalesce(existing_max.maximum_rank, 0)::integer as existing_maximum_rank
    from completed_rounds completed
    join public.game_card_rounds gcr on gcr.id = completed.round_id
    join public.competition_members cm on cm.competition_id = gcr.competition_id
    left join public.leaderboard lb
      on lb.competition_id = gcr.competition_id
     and lb.user_id = cm.user_id
    left join public.game_card_round_tiebreaks existing
      on existing.round_id = completed.round_id
     and existing.user_id = cm.user_id
    left join lateral (
      select max(saved.random_tiebreak_rank) as maximum_rank
      from public.game_card_round_tiebreaks saved
      where saved.round_id = completed.round_id
    ) existing_max on true
    where existing.user_id is null
  ),
  numbered as (
    select
      missing.round_id,
      missing.user_id,
      missing.uc_points_at_tiebreak,
      missing.existing_maximum_rank
        + row_number() over (
            partition by missing.round_id
            order by random(), missing.user_id
          )::integer as random_tiebreak_rank
    from missing_members missing
  )
  insert into public.game_card_round_tiebreaks (
    round_id,
    user_id,
    uc_points_at_tiebreak,
    random_tiebreak_rank
  )
  select
    numbered.round_id,
    numbered.user_id,
    numbered.uc_points_at_tiebreak,
    numbered.random_tiebreak_rank
  from numbered
  on conflict (round_id, user_id) do nothing;
end;
$$;

-- Preserve the existing column order and data types, then append the two
-- performance-tie audit columns. This avoids PostgreSQL view type errors.
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
  select scope.round_id, gw.id as gameweek_id
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
    coalesce(sum(scores.difference), 0::numeric) as total_difference,
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
    standings.*,
    coalesce(gcrt.uc_points_at_tiebreak, 0) as uc_points_at_tiebreak,
    coalesce(gcrt.random_tiebreak_rank, 999999) as random_tiebreak_rank,
    rank() over (
      partition by standings.round_id
      order by
        standings.missed_gameweeks asc,
        standings.exact_predictions desc,
        standings.total_difference asc,
        standings.weekly_wins desc,
        standings.rank_points asc
    ) as performance_rank,
    count(*) over (
      partition by
        standings.round_id,
        standings.missed_gameweeks,
        standings.exact_predictions,
        standings.total_difference,
        standings.weekly_wins,
        standings.rank_points
    )::bigint as performance_tie_size,
    row_number() over (
      partition by standings.round_id
      order by
        standings.missed_gameweeks asc,
        standings.exact_predictions desc,
        standings.total_difference asc,
        standings.weekly_wins desc,
        standings.rank_points asc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc,
        standings.user_id asc
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
  ranked.rank_points,
  ranked.performance_rank,
  ranked.performance_tie_size
from ranked;

grant select on public.game_card_round_standings to authenticated;

create or replace function public.game_card_super_medal_entitlements(
  target_competition_id uuid,
  target_user_id uuid default null
)
returns table (
  round_id uuid,
  competition_id uuid,
  season_id uuid,
  user_id uuid,
  medal_count integer
)
language sql
stable
set search_path = public
as $$
  with member_total as (
    select least(10, greatest(2, coalesce(
      c.locked_member_count,
      (select count(*)::integer
       from public.competition_members cm
       where cm.competition_id = c.id)
    )))::integer as member_count
    from public.competitions c
    where c.id = target_competition_id
  )
  select
    gcr.id,
    gcr.competition_id,
    gcr.season_id,
    gcs.user_id,
    case
      when members.member_count <= 3 and gcs.round_rank = 1 then 1
      when members.member_count between 4 and 6
        and gcs.performance_rank = 1
        and gcs.performance_tie_size = 2 then 1
      when members.member_count between 4 and 6 and gcs.round_rank = 1 then 2
      when members.member_count >= 7 and gcs.round_rank = 1 then 2
      when members.member_count >= 7 and gcs.round_rank = 2 then 1
      else 0
    end::integer
  from public.game_card_round_standings gcs
  join public.game_card_rounds gcr on gcr.id = gcs.round_id
  cross join member_total members
  where gcr.competition_id = target_competition_id
    and gcs.completed_gameweeks >= 5
    and (target_user_id is null or gcs.user_id = target_user_id);
$$;

revoke all on function public.game_card_super_medal_entitlements(uuid, uuid) from public;

create or replace function public.reconcile_game_card_super_medals(
  target_competition_id uuid,
  target_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Redeemed medals/cards remain untouched. Only surplus available/reserved
  -- Game Card tokens from the old shared-final-rank calculation are voided.
  with entitlements as (
    select *
    from public.game_card_super_medal_entitlements(target_competition_id, target_user_id)
  ),
  ordered_tokens as (
    select
      token.id,
      token.status,
      entitlement.medal_count,
      row_number() over (
        partition by token.source_game_card_round_id, token.user_id
        order by
          case when token.status = 'redeemed' then 0 else 1 end,
          token.created_at,
          token.id
      ) as entitlement_position
    from public.card_draw_tokens token
    join entitlements entitlement
      on entitlement.round_id = token.source_game_card_round_id
     and entitlement.user_id = token.user_id
    where token.competition_id = target_competition_id
      and token.token_type = 'super_medal'
      and token.source_type = 'game_card'
      and token.status <> 'void'
  )
  update public.card_draw_tokens token
  set status = 'void'
  from ordered_tokens ordered
  where token.id = ordered.id
    and ordered.status in ('available', 'reserved')
    and ordered.entitlement_position > ordered.medal_count;

  with entitlements as (
    select *
    from public.game_card_super_medal_entitlements(target_competition_id, target_user_id)
  ),
  token_counts as (
    select
      entitlement.*,
      count(token.id) filter (where token.status <> 'void')::integer as live_token_count,
      count(token.id)::integer as all_token_count
    from entitlements entitlement
    left join public.card_draw_tokens token
      on token.competition_id = entitlement.competition_id
     and token.user_id = entitlement.user_id
     and token.token_type = 'super_medal'
     and token.source_type = 'game_card'
     and token.source_game_card_round_id = entitlement.round_id
    group by
      entitlement.round_id,
      entitlement.competition_id,
      entitlement.season_id,
      entitlement.user_id,
      entitlement.medal_count
  ),
  missing_tokens as (
    select
      token_counts.*,
      missing.medal_number
    from token_counts
    cross join lateral generate_series(
      1,
      greatest(token_counts.medal_count - token_counts.live_token_count, 0)
    ) as missing(medal_number)
  )
  insert into public.card_draw_tokens (
    competition_id,
    season_id,
    user_id,
    token_type,
    deck_type,
    source_type,
    source_game_card_round_id,
    source_key
  )
  select
    missing.competition_id,
    missing.season_id,
    missing.user_id,
    'super_medal',
    'premium',
    'game_card',
    missing.round_id,
    'game_card_round_' || missing.round_id::text
      || '_tie_safe_award_' || (missing.all_token_count + missing.medal_number)::text
  from missing_tokens missing
  on conflict do nothing;
end;
$$;

revoke all on function public.reconcile_game_card_super_medals(uuid, uuid) from public;

-- Populate missing stored draws for every already-completed round before
-- recalculating historical entitlements. Existing stored draws are preserved.
with completed_rounds as (
  select gcr.id as round_id, gcr.competition_id
  from public.game_card_rounds gcr
  join public.gameweeks start_gw on start_gw.id = gcr.start_gameweek_id
  join public.gameweeks end_gw on end_gw.id = gcr.end_gameweek_id
  where (
    select count(distinct actuals.gameweek_id)
    from (
      select gcrs.gameweek_id
      from public.game_card_results gcrs
      where gcrs.round_id = gcr.id
      union
      select gcar.gameweek_id
      from public.game_card_actual_results gcar
      join public.gameweeks actual_gw
        on actual_gw.id = gcar.gameweek_id
       and actual_gw.season_id = gcr.season_id
      where gcar.season_id = gcr.season_id
        and gcar.card_id = gcr.card_id
        and actual_gw.number between start_gw.number and end_gw.number
    ) actuals
  ) >= (end_gw.number - start_gw.number + 1)
),
missing_members as (
  select
    completed.round_id,
    cm.user_id,
    coalesce(lb.ultimate_champion_points, 0)::integer as uc_points_at_tiebreak,
    coalesce(existing_max.maximum_rank, 0)::integer as existing_maximum_rank
  from completed_rounds completed
  join public.competition_members cm on cm.competition_id = completed.competition_id
  left join public.leaderboard lb
    on lb.competition_id = completed.competition_id
   and lb.user_id = cm.user_id
  left join public.game_card_round_tiebreaks existing
    on existing.round_id = completed.round_id
   and existing.user_id = cm.user_id
  left join lateral (
    select max(saved.random_tiebreak_rank) as maximum_rank
    from public.game_card_round_tiebreaks saved
    where saved.round_id = completed.round_id
  ) existing_max on true
  where existing.user_id is null
),
numbered as (
  select
    missing.round_id,
    missing.user_id,
    missing.uc_points_at_tiebreak,
    missing.existing_maximum_rank
      + row_number() over (
          partition by missing.round_id
          order by random(), missing.user_id
        )::integer as random_tiebreak_rank
  from missing_members missing
)
insert into public.game_card_round_tiebreaks (
  round_id,
  user_id,
  uc_points_at_tiebreak,
  random_tiebreak_rank
)
select
  numbered.round_id,
  numbered.user_id,
  numbered.uc_points_at_tiebreak,
  numbered.random_tiebreak_rank
from numbered
on conflict (round_id, user_id) do nothing;

do $$
declare
  competition_row record;
begin
  for competition_row in select id from public.competitions loop
    perform public.reconcile_game_card_super_medals(competition_row.id, null);
  end loop;
end;
$$;

-- Replace token synchronisation so future completed rounds use the same
-- entitlement calculation as the leaderboard and the historical repair.
create or replace function public.sync_my_card_draw_tokens(target_competition_id uuid)
returns table (
  regular_medals integer,
  super_medals integer,
  redeemed_regular_medals integer,
  redeemed_super_medals integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_user uuid := auth.uid();
  uc_threshold integer;
  smg_threshold integer;
  ranking public.leaderboard;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  select *
    into ranking
  from public.leaderboard
  where competition_id = target_competition_id
    and user_id = target_user;

  if ranking.user_id is not null then
    foreach uc_threshold in array array[20,40,60,80,100,125,150,175,200,225,250,275,300]
    loop
      if ranking.ultimate_champion_points >= uc_threshold then
        insert into public.card_draw_tokens (
          competition_id, season_id, user_id, token_type, deck_type, source_type, source_key
        ) values (
          target_competition_id, target_competition.season_id, target_user,
          'regular_medal', 'regular', 'accolade', 'uc_points_' || uc_threshold
        )
        on conflict do nothing;
      end if;
    end loop;

    foreach smg_threshold in array array[1,3,5,8,12,15,20]
    loop
      if ranking.star_man_goals >= smg_threshold then
        insert into public.card_draw_tokens (
          competition_id, season_id, user_id, token_type, deck_type, source_type, source_key
        ) values (
          target_competition_id, target_competition.season_id, target_user,
          'regular_medal', 'regular', 'accolade', 'star_man_goals_' || smg_threshold
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.ensure_game_card_tiebreaks(target_competition_id);
  perform public.reconcile_game_card_super_medals(target_competition_id, target_user);

  insert into public.card_draw_tokens (
    competition_id,
    season_id,
    user_id,
    token_type,
    deck_type,
    source_type,
    source_card_effect_id,
    source_key
  )
  select
    ace.competition_id,
    ace.season_id,
    target_user,
    'regular_medal',
    'regular',
    'card_effect',
    ace.id,
    'super_pen_' || ace.id::text || '_' || fixture_gw.id::text || '_' || penalty_series.penalty_number::text
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  join public.gameweeks start_gw on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks end_gw on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks fixture_gw
    on fixture_gw.season_id = ace.season_id
   and fixture_gw.number between start_gw.number and end_gw.number
  join public.game_card_actual_results gcar
    on gcar.season_id = ace.season_id
   and gcar.gameweek_id = fixture_gw.id
   and gcar.card_id = 'super_pen'
  cross join lateral generate_series(1, coalesce(gcar.actual_value, 0)::integer) as penalty_series(penalty_number)
  where ace.competition_id = target_competition_id
    and ace.played_by_user_id = target_user
    and ace.status = 'active'
    and cd.effect_key = 'super_pen'
  on conflict do nothing;

  return query
  select
    count(*) filter (where token_type = 'regular_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'regular_medal' and status = 'redeemed')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'redeemed')::integer
  from public.card_draw_tokens
  where competition_id = target_competition_id
    and user_id = target_user;
end;
$$;

revoke all on function public.ensure_game_card_tiebreaks(uuid) from public;
grant execute on function public.ensure_game_card_tiebreaks(uuid) to authenticated;
revoke all on function public.sync_my_card_draw_tokens(uuid) from public;
grant execute on function public.sync_my_card_draw_tokens(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Read-only audit. Each round_rank must be unique inside its round and the sum
-- of medal_count must be 1 (2-3 players), 2 (4-6) or 3 (7-10).
select
  c.name as league_name,
  gcr.round_number,
  gcs.round_rank,
  gcs.performance_rank,
  gcs.performance_tie_size,
  p.display_name,
  entitlement.medal_count
from public.game_card_round_standings gcs
join public.game_card_rounds gcr on gcr.id = gcs.round_id
join public.competitions c on c.id = gcr.competition_id
join public.profiles p on p.id = gcs.user_id
left join lateral public.game_card_super_medal_entitlements(c.id, gcs.user_id) entitlement
  on entitlement.round_id = gcs.round_id
where gcs.completed_gameweeks >= 5
order by c.name, gcr.round_number, gcs.round_rank;
