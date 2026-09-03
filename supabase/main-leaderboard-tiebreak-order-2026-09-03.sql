-- Correct the Main Leaderboard tiebreak order used when Game Card rounds freeze
-- a main-league position.
--
-- Correct order:
--   1. most UC points
--   2. most Correct Scores
--   3. most Correct Results
--   4. most Prediction points
--   5. most Star Man points
--   6. most Star Man goals
--   7. most Star Man assists
--   8. fewest Star Man yellow cards
--   9. fewest Star Man red cards
--
-- This migration deliberately refuses to rewrite any already-frozen historical
-- league positions. If any exist, review them before applying this migration.

begin;

do $safety$
begin
  if exists (
    select 1
    from public.game_card_round_tiebreaks
    where league_position_at_tiebreak is not null
  ) then
    raise exception
      'Main leaderboard tiebreak migration stopped: frozen Game Card league positions already exist. Review historical snapshots before applying.';
  end if;
end
$safety$;

create or replace function public.ensure_game_card_tiebreaks_internal(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_round record;
begin
  with missing_members as (
    select
      gcr.id as round_id,
      cm.user_id,
      coalesce(existing_max.maximum_rank, 0)::integer as existing_maximum_rank
    from public.game_card_rounds gcr
    join public.competition_members cm on cm.competition_id = gcr.competition_id
    left join public.game_card_round_tiebreaks existing
      on existing.round_id = gcr.id
     and existing.user_id = cm.user_id
    left join lateral (
      select max(saved.random_tiebreak_rank) as maximum_rank
      from public.game_card_round_tiebreaks saved
      where saved.round_id = gcr.id
    ) existing_max on true
    where gcr.competition_id = target_competition_id
      and existing.user_id is null
  ),
  numbered as (
    select
      missing.round_id,
      missing.user_id,
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
    0,
    numbered.random_tiebreak_rank
  from numbered
  on conflict (round_id, user_id) do nothing;

  for completed_round in
    select
      gcr.id as round_id,
      gcr.competition_id,
      gcr.season_id,
      gcr.round_number,
      end_gw.number as end_gameweek_number
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
    order by end_gw.number, gcr.round_number
  loop
    with gameweek_totals as (
      select
        cm.user_id,
        coalesce(sum(ugs.prediction_points), 0)::integer as prediction_points,
        coalesce(sum(ugs.correct_scores), 0)::integer as correct_scores,
        coalesce(sum(ugs.correct_results), 0)::integer as correct_results,
        coalesce(sum(ugs.star_man_points), 0)::integer as star_man_points,
        coalesce(sum(ugs.star_man_goals), 0)::integer as star_man_goals,
        coalesce(sum(ugs.star_man_assists), 0)::integer as star_man_assists,
        coalesce(sum(ugs.star_man_yellows), 0)::integer as star_man_yellows,
        coalesce(sum(ugs.star_man_reds), 0)::integer as star_man_reds,
        coalesce(sum(ugs.super_score_points), 0)::integer as super_score_points
      from public.competition_members cm
      left join public.user_gameweek_stats ugs
        on ugs.competition_id = cm.competition_id
       and ugs.user_id = cm.user_id
       and ugs.season_id = completed_round.season_id
       and ugs.gameweek_number <= completed_round.end_gameweek_number
      where cm.competition_id = completed_round.competition_id
      group by cm.user_id
    ),
    prior_game_card_bonuses as (
      select
        prior_standing.user_id,
        count(*)::integer as game_card_bonus_points
      from public.game_card_round_standings prior_standing
      join public.game_card_rounds prior_round on prior_round.id = prior_standing.round_id
      where prior_round.competition_id = completed_round.competition_id
        and prior_round.round_number < completed_round.round_number
        and prior_standing.completed_gameweeks >= 5
        and prior_standing.round_rank = 1
      group by prior_standing.user_id
    ),
    main_totals as (
      select
        totals.*,
        coalesce(prior.game_card_bonus_points, 0)::integer as game_card_bonus_points,
        (
          totals.prediction_points
          + totals.star_man_points
          + totals.super_score_points
          + coalesce(prior.game_card_bonus_points, 0)
        )::integer as ultimate_champion_points
      from gameweek_totals totals
      left join prior_game_card_bonuses prior on prior.user_id = totals.user_id
    ),
    main_ranked as (
      select
        main_totals.*,
        rank() over (
          order by
            main_totals.ultimate_champion_points desc,
            main_totals.correct_scores desc,
            main_totals.correct_results desc,
            main_totals.prediction_points desc,
            main_totals.star_man_points desc,
            main_totals.star_man_goals desc,
            main_totals.star_man_assists desc,
            main_totals.star_man_yellows asc,
            main_totals.star_man_reds asc
        )::integer as league_position
      from main_totals
    )
    update public.game_card_round_tiebreaks saved
    set
      uc_points_at_tiebreak = ranked.ultimate_champion_points,
      league_position_at_tiebreak = ranked.league_position
    from main_ranked ranked
    where saved.round_id = completed_round.round_id
      and saved.user_id = ranked.user_id
      and saved.league_position_at_tiebreak is null;
  end loop;
end;
$$;

revoke all on function public.ensure_game_card_tiebreaks_internal(uuid) from public;

commit;
