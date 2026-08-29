-- READ ONLY. Run before/after the player-integrity migration and export the one
-- JSON result. No user emails, usernames, profile pictures, predictions or cards
-- are exported. A single JSON cell avoids SQL Editor's 100-row display limit.
-- It includes all player/identity rows (even inactive) and all seasons' history,
-- because looking at just Cherki/Foden or just active rows misses the root cause.
select jsonb_build_object(
  'captured_at', now(),
  'seasons', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_active', is_active)) from public.seasons),
  'teams', (select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.teams),
  'players', (select jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name,
    'first_name', first_name, 'last_name', last_name, 'surname', surname,
    'nationality', nationality, 'height_cm', height_cm, 'team_id', team_id,
    'is_active', is_active, 'created_at', created_at) order by display_name, id) from public.players),
  'gameweeks', (select jsonb_agg(jsonb_build_object('id', id, 'season_id', season_id, 'number', number)) from public.gameweeks),
  'fixtures', (select jsonb_agg(jsonb_build_object('id', id, 'season_id', season_id,
    'gameweek_id', gameweek_id, 'home_team_id', home_team_id, 'away_team_id', away_team_id,
    'status', status)) from public.fixtures),
  'assignments', (select jsonb_agg(jsonb_build_object('id', id, 'season_id', season_id,
    'player_id', player_id, 'team_id', team_id, 'starts_gameweek_id', starts_gameweek_id,
    'ends_gameweek_id', ends_gameweek_id)) from public.player_team_assignments),
  'fixture_stat_references', (select jsonb_agg(jsonb_build_object('season_id', season_id,
    'fixture_id', fixture_id, 'gameweek_id', gameweek_id, 'player_id', player_id, 'team_id', team_id)) from public.player_fixture_stats),
  'gameweek_stat_references', (select jsonb_agg(jsonb_build_object('season_id', season_id,
    'gameweek_id', gameweek_id, 'player_id', player_id)) from public.player_gameweek_stats),
  'pick_references', (select jsonb_agg(row_to_json(x)) from
    (select season_id, player_id, count(*) as picks from public.star_man_picks group by season_id, player_id) x)
) as player_stats_snapshot;
