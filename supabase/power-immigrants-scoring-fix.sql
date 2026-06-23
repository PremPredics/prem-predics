-- Fix Power of the Immigrants scoring so yellow/red cards deduct normally
-- while the card applies, and keep live card descriptions in sync.

begin;

update public.card_definitions
set description = 'Valid for 1 Gameweek. Non-English Star Men score DOUBLE points. Yellow Cards and Red Cards are not doubled. Must be played at least 90 minutes before the gameweek''s first KO time.'
where id = 'power_immigrants';

update public.card_definitions
set description = 'Valid for 1 Gameweek. DOUBLE points for any Correct Result with a Clean Sheet in the actual game. Must be played at least 90 minutes before the gameweek''s first KO time.'
where id = 'power_laundrette';

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
    (
      select count(*)::integer from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_goal'
        and gw.number between ew.start_number and ew.end_number
    ) as power_goal_count,
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
    ) as super_star_man_applies,
    exists (
      select 1 from effect_windows ew
      where ew.id = smp.source_card_effect_id
        and ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'super_sub'
        and gw.number between ew.start_number and ew.end_number
    ) as super_sub_applies
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
        + assists
        + case when assist_king_applies then assists else 0 end
      )
      * case when immigrants_applies then 2 else 1 end
      * case when lanky_applies then 2 else 1 end
      * case when small_applies then 2 else 1 end
      * case when super_star_man_applies then 3 else 1 end
    )
    + (power_goal_count * 3)
    - case
        when super_star_man_applies or super_sub_applies then 0
        else (yellow_cards * case when furious_applies then 2 else 1 end)
          + (red_cards * 3 * case when furious_applies then 2 else 1 end)
      end
  )::integer as points
from star_rows;

grant select on public.star_man_score_details to authenticated;

commit;
