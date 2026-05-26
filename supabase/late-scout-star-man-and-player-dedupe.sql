-- Fix Late Scout Star Man saves after the normal deadline, and merge duplicate
-- selectable player rows for players whose current Star Man team is West Ham.
--
-- Run this once in Supabase SQL Editor.

begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
set local search_path = extensions, public, pg_temp;

drop policy if exists "users update own star man pick before gameweek lock" on public.star_man_picks;
create policy "users update own star man pick before gameweek lock"
on public.star_man_picks for update
to authenticated
using (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
)
with check (
  public.can_submit_star_man_pick(
    competition_id,
    season_id,
    gameweek_id,
    user_id,
    player_id,
    pick_slot,
    source_card_effect_id
  )
);

drop policy if exists "users delete own star man pick before gameweek lock" on public.star_man_picks;
create policy "users delete own star man pick before gameweek lock"
on public.star_man_picks for delete
to authenticated
using (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and (
    now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
    or exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      join public.players p on p.id = star_man_picks.player_id
      join public.fixtures f
        on f.season_id = star_man_picks.season_id
        and f.gameweek_id = star_man_picks.gameweek_id
        and f.status <> 'postponed'
      where ace.competition_id = star_man_picks.competition_id
        and ace.played_by_user_id = star_man_picks.user_id
        and ace.status = 'active'
        and cd.effect_key in ('power_late_scout', 'super_sub')
        and (
          p.team_id in (f.home_team_id, f.away_team_id)
          or exists (
            select 1
            from public.player_team_assignments pta
            where pta.player_id = star_man_picks.player_id
              and pta.season_id = star_man_picks.season_id
              and pta.team_id in (f.home_team_id, f.away_team_id)
              and pta.starts_gameweek_id <= star_man_picks.gameweek_id
              and (pta.ends_gameweek_id is null or pta.ends_gameweek_id >= star_man_picks.gameweek_id)
          )
        )
        and f.kickoff_at = (
          select min(f2.kickoff_at)
          from public.fixtures f2
          where f2.season_id = star_man_picks.season_id
            and f2.gameweek_id = star_man_picks.gameweek_id
            and f2.status <> 'postponed'
            and (
              p.team_id in (f2.home_team_id, f2.away_team_id)
              or exists (
                select 1
                from public.player_team_assignments pta2
                where pta2.player_id = star_man_picks.player_id
                  and pta2.season_id = star_man_picks.season_id
                  and pta2.team_id in (f2.home_team_id, f2.away_team_id)
                  and pta2.starts_gameweek_id <= star_man_picks.gameweek_id
                  and (pta2.ends_gameweek_id is null or pta2.ends_gameweek_id >= star_man_picks.gameweek_id)
              )
            )
        )
        and now() < f.kickoff_at
    )
  )
);

drop table if exists pg_temp.player_dedupe_targets;
create temp table player_dedupe_targets (
  display_name text not null,
  canonical_team_pattern text not null,
  nationality text not null,
  height_cm integer not null
);

insert into player_dedupe_targets (display_name, canonical_team_pattern, nationality, height_cm)
values
  ('Adama Traore', 'West Ham%', 'Spain', 178),
  ('James Ward-Prowse', 'West Ham%', 'England', 177);

insert into public.players (display_name, team_id, nationality, height_cm, squad_status, is_active)
select target.display_name, teams.id, target.nationality, target.height_cm, 'squad_player', true
from player_dedupe_targets target
join public.teams teams on teams.name ilike target.canonical_team_pattern
where not exists (
  select 1
  from public.players players
  where players.team_id = teams.id
    and lower(unaccent(players.display_name)) = lower(unaccent(target.display_name))
);

drop table if exists pg_temp.player_dedupe_canonical;
create temp table player_dedupe_canonical as
select distinct on (target.display_name)
  target.display_name,
  target.nationality,
  target.height_cm,
  teams.id as canonical_team_id,
  players.id as canonical_player_id
from player_dedupe_targets target
join public.teams teams on teams.name ilike target.canonical_team_pattern
join public.players players
  on players.team_id = teams.id
  and lower(unaccent(players.display_name)) = lower(unaccent(target.display_name))
order by target.display_name, players.is_active desc, players.created_at desc;

drop table if exists pg_temp.player_dedupe_duplicates;
create temp table player_dedupe_duplicates as
select
  canonical.display_name,
  canonical.canonical_player_id,
  players.id as duplicate_player_id
from player_dedupe_canonical canonical
join public.players players
  on lower(unaccent(players.display_name)) = lower(unaccent(canonical.display_name))
where players.id <> canonical.canonical_player_id;

update public.players players
set
  team_id = canonical.canonical_team_id,
  nationality = canonical.nationality,
  height_cm = canonical.height_cm,
  squad_status = 'squad_player',
  is_active = true
from player_dedupe_canonical canonical
where players.id = canonical.canonical_player_id;

update public.star_man_picks picks
set player_id = duplicate_map.canonical_player_id
from player_dedupe_duplicates duplicate_map
where picks.player_id = duplicate_map.duplicate_player_id
  and not exists (
    select 1
    from public.star_man_picks existing
    where existing.competition_id = picks.competition_id
      and existing.season_id = picks.season_id
      and existing.user_id = picks.user_id
      and existing.player_id = duplicate_map.canonical_player_id
  );

update public.player_gameweek_stats stats
set player_id = duplicate_map.canonical_player_id
from player_dedupe_duplicates duplicate_map
where stats.player_id = duplicate_map.duplicate_player_id
  and not exists (
    select 1
    from public.player_gameweek_stats existing
    where existing.season_id = stats.season_id
      and existing.gameweek_id = stats.gameweek_id
      and existing.player_id = duplicate_map.canonical_player_id
  );

update public.player_gameweek_stats existing
set
  goals = greatest(existing.goals, duplicate_stats.goals),
  assists = greatest(existing.assists, duplicate_stats.assists),
  outside_box_goals = greatest(existing.outside_box_goals, duplicate_stats.outside_box_goals),
  outside_box_assists = greatest(existing.outside_box_assists, duplicate_stats.outside_box_assists),
  yellow_cards = greatest(existing.yellow_cards, duplicate_stats.yellow_cards),
  red_cards = greatest(existing.red_cards, duplicate_stats.red_cards),
  started = coalesce(existing.started, false) or coalesce(duplicate_stats.started, false),
  was_benched = coalesce(existing.was_benched, false) or coalesce(duplicate_stats.was_benched, false),
  minutes_played = greatest(coalesce(existing.minutes_played, 0), coalesce(duplicate_stats.minutes_played, 0)),
  updated_at = now()
from public.player_gameweek_stats duplicate_stats
join player_dedupe_duplicates duplicate_map
  on duplicate_map.duplicate_player_id = duplicate_stats.player_id
where existing.player_id = duplicate_map.canonical_player_id
  and existing.season_id = duplicate_stats.season_id
  and existing.gameweek_id = duplicate_stats.gameweek_id;

delete from public.player_gameweek_stats stats
using player_dedupe_duplicates duplicate_map
where stats.player_id = duplicate_map.duplicate_player_id;

update public.player_fixture_stats stats
set player_id = duplicate_map.canonical_player_id
from player_dedupe_duplicates duplicate_map
where stats.player_id = duplicate_map.duplicate_player_id
  and not exists (
    select 1
    from public.player_fixture_stats existing
    where existing.fixture_id = stats.fixture_id
      and existing.player_id = duplicate_map.canonical_player_id
  );

update public.player_fixture_stats existing
set
  goals = greatest(existing.goals, duplicate_stats.goals),
  assists = greatest(existing.assists, duplicate_stats.assists),
  outside_box_goals = greatest(existing.outside_box_goals, duplicate_stats.outside_box_goals),
  outside_box_assists = greatest(existing.outside_box_assists, duplicate_stats.outside_box_assists),
  yellow_cards = greatest(existing.yellow_cards, duplicate_stats.yellow_cards),
  red_cards = greatest(existing.red_cards, duplicate_stats.red_cards),
  started = coalesce(existing.started, false) or coalesce(duplicate_stats.started, false),
  was_benched = coalesce(existing.was_benched, false) or coalesce(duplicate_stats.was_benched, false),
  was_in_matchday_squad = coalesce(existing.was_in_matchday_squad, false) or coalesce(duplicate_stats.was_in_matchday_squad, false),
  was_substituted = coalesce(existing.was_substituted, false) or coalesce(duplicate_stats.was_substituted, false),
  substituted_on_minute = least(coalesce(existing.substituted_on_minute, duplicate_stats.substituted_on_minute), coalesce(duplicate_stats.substituted_on_minute, existing.substituted_on_minute)),
  substituted_off_minute = least(coalesce(existing.substituted_off_minute, duplicate_stats.substituted_off_minute), coalesce(duplicate_stats.substituted_off_minute, existing.substituted_off_minute)),
  minutes_played = greatest(coalesce(existing.minutes_played, 0), coalesce(duplicate_stats.minutes_played, 0)),
  updated_at = now()
from public.player_fixture_stats duplicate_stats
join player_dedupe_duplicates duplicate_map
  on duplicate_map.duplicate_player_id = duplicate_stats.player_id
where existing.player_id = duplicate_map.canonical_player_id
  and existing.fixture_id = duplicate_stats.fixture_id;

delete from public.player_fixture_stats stats
using player_dedupe_duplicates duplicate_map
where stats.player_id = duplicate_map.duplicate_player_id;

update public.player_team_assignments assignments
set player_id = duplicate_map.canonical_player_id
from player_dedupe_duplicates duplicate_map
where assignments.player_id = duplicate_map.duplicate_player_id
  and not exists (
    select 1
    from public.player_team_assignments existing
    where existing.season_id = assignments.season_id
      and existing.player_id = duplicate_map.canonical_player_id
      and existing.team_id = assignments.team_id
      and existing.starts_gameweek_id = assignments.starts_gameweek_id
      and coalesce(existing.ends_gameweek_id, -1) = coalesce(assignments.ends_gameweek_id, -1)
  );

delete from public.player_team_assignments assignments
using player_dedupe_duplicates duplicate_map
where assignments.player_id = duplicate_map.duplicate_player_id;

update public.players players
set is_active = false
from player_dedupe_duplicates duplicate_map
where players.id = duplicate_map.duplicate_player_id;

commit;
