update public.card_definitions
set description = case id
  when 'power_lanky_crouch' then 'Valid for 1 Gameweek. Star Men 6ft1 (185cm) or taller score DOUBLE points. Yellow Cards and Red Cards are not doubled. Must be played at least 90 minutes before the gameweek''s first KO time.'
  when 'power_small_and_mighty' then 'Valid for 1 Gameweek. Star Men 5ft9 (175cm) or shorter score DOUBLE points. Yellow Cards and Red Cards are not doubled. Must be played at least 90 minutes before the gameweek''s first KO time.'
  when 'power_immigrants' then 'Valid for 1 Gameweek. Non-English Star Men score DOUBLE points. Yellow Cards and Red Cards are not doubled. Must be played at least 90 minutes before the gameweek''s first KO time.'
  else description
end
where id in ('power_lanky_crouch', 'power_small_and_mighty', 'power_immigrants');

create or replace function public.player_scrabble_surname(input_name text)
returns text
language plpgsql
immutable
as $$
declare
  clean_name text;
  tokens text[];
  token_count integer;
  index integer;
begin
  clean_name := trim(regexp_replace(coalesce(input_name, ''), '\s+', ' ', 'g'));
  if clean_name = '' then
    return clean_name;
  end if;

  tokens := regexp_split_to_array(clean_name, '\s+');
  token_count := array_length(tokens, 1);

  if token_count is null or token_count = 0 then
    return clean_name;
  end if;

  for index in 1..token_count loop
    if lower(tokens[index]) = 'van' and index < token_count then
      return array_to_string(tokens[index:token_count], ' ');
    end if;
  end loop;

  return tokens[token_count];
end;
$$;

create or replace function public.set_player_scrabble_score()
returns trigger
language plpgsql
as $$
declare
  derived_surname text;
begin
  derived_surname := public.player_scrabble_surname(new.display_name);
  new.surname := coalesce(nullif(derived_surname, ''), new.surname);
  new.scrabble_name := coalesce(nullif(derived_surname, ''), new.surname, new.display_name);
  new.surname_scrabble_score := public.scrabble_score(new.scrabble_name);
  return new;
end;
$$;

update public.players
set surname = public.player_scrabble_surname(display_name),
    scrabble_name = public.player_scrabble_surname(display_name),
    surname_scrabble_score = public.scrabble_score(public.player_scrabble_surname(display_name))
where display_name is not null;

grant execute on function public.player_scrabble_surname(text) to authenticated;

create or replace view public.prediction_fixture_scores
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
prediction_modes as (
  select
    psd.*,
    bool_or(prediction_slot in ('curse_hated', 'curse_gambler'))
      over (partition by competition_id, user_id, fixture_id) as has_curse_override,
    bool_or(prediction_slot = 'power_of_god')
      over (partition by competition_id, user_id, fixture_id) as has_power_of_god_override
  from public.prediction_score_details psd
),
ranked_predictions as (
  select
    pm.*,
    row_number() over (
      partition by pm.competition_id, pm.user_id, pm.fixture_id, (pm.prediction_slot in ('curse_hated', 'curse_gambler'))
      order by coalesce(source_effect.played_at, '-infinity'::timestamptz) desc, pm.prediction_id::text desc
    ) as prediction_rank
  from prediction_modes pm
  left join effect_windows source_effect on source_effect.id = pm.source_card_effect_id
),
considered_predictions as (
  select *
  from ranked_predictions
  where
    (
      has_curse_override
      and prediction_slot in ('curse_hated', 'curse_gambler')
      and prediction_rank = 1
    )
    or (
      not has_curse_override
      and has_power_of_god_override
      and prediction_slot = 'power_of_god'
    )
    or (
      not has_curse_override
      and not has_power_of_god_override
      and (
        prediction_slot = 'primary'
        or prediction_slot = 'hedge'
        or prediction_slot like 'hedge_%'
      )
    )
),
adjusted_predictions as (
  select
    cp.*,
    case
      when cp.prediction_slot = 'curse_hated' then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_deleted_match'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (ew.fixture_id is null or ew.fixture_id = cp.fixture_id)
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_glasses'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and cp.predicted_home_goals = 0
          and cp.predicted_away_goals = 0
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_even_number'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (mod(cp.predicted_home_goals, 2) <> 0 or mod(cp.predicted_away_goals, 2) <> 0)
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_odd_number'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (mod(cp.predicted_home_goals, 2) <> 1 or mod(cp.predicted_away_goals, 2) <> 1)
      ) then 0
      else cp.points
    end as eligible_points,
    exists (
      select 1
      from effect_windows ew
      join public.match_results mr on mr.fixture_id = cp.fixture_id
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_laundrette'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and cp.is_correct_result = true
        and mr.had_clean_sheet = true
    ) as laundrette_applies,
    exists (
      select 1
      from effect_windows ew
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_pessimist'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and not exists (
          select 1
          from public.fixtures f
          left join public.match_results missing_mr on missing_mr.fixture_id = f.id
          where f.season_id = cp.season_id
            and f.gameweek_id = cp.gameweek_id
            and f.status <> 'postponed'
            and missing_mr.fixture_id is null
        )
        and not exists (
          select 1
          from public.fixtures f
          join public.match_results mr on mr.fixture_id = f.id
          where f.season_id = cp.season_id
            and f.gameweek_id = cp.gameweek_id
            and f.status <> 'postponed'
            and (mr.home_goals >= 3 or mr.away_goals >= 3)
        )
    ) as pessimist_applies,
    exists (
      select 1
      from effect_windows ew
      join public.fixture_game_stats fgs on fgs.fixture_id = cp.fixture_id
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_snow'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and fgs.played_in_heavy_snow = true
    ) as snow_applies,
    exists (
      select 1
      from effect_windows ew
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'super_golden_gameweek'
        and cp.gameweek_number between ew.start_number and ew.end_number
    ) as golden_gameweek_applies
  from considered_predictions cp
)
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  fixture_id,
  bool_or(is_correct_score and eligible_points > 0) as is_correct_score,
  bool_or(is_correct_result and eligible_points > 0) as is_correct_result,
  max(
    eligible_points
    * case when laundrette_applies then 2 else 1 end
    * case when pessimist_applies then 2 else 1 end
    * case when snow_applies then 2 else 1 end
    * case when golden_gameweek_applies then 2 else 1 end
  )::integer as points
from adjusted_predictions
group by competition_id, user_id, season_id, gameweek_id, gameweek_number, fixture_id;

grant select on public.prediction_fixture_scores to authenticated;

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
      (
        (goals * 3)
        + case when power_goal_applies then 3 else 0 end
        + assists
        + case when assist_king_applies then assists else 0 end
      )
      * case when immigrants_applies then 2 else 1 end
      * case when lanky_applies then 2 else 1 end
      * case when small_applies then 2 else 1 end
      * case when super_star_man_applies then 3 else 1 end
    )
    - case
        when super_star_man_applies then 0
        else (yellow_cards * case when furious_applies then 2 else 1 end)
          + (red_cards * 3 * case when furious_applies then 2 else 1 end)
      end
  )::integer as points
from star_rows;

grant select on public.star_man_score_details to authenticated;
