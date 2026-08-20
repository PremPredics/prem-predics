-- Prem Predics live player update: 20 August 2026.
--
-- Safe scope:
--   * deactivates only the 16 named departing players;
--   * adds/reactivates only the 11 named arrivals;
--   * corrects Lucas Herrington's and Dastan Satpaev's nationalities;
--   * updates only those arrivals' active-season team assignments;
--   * does not delete leagues, users, picks, predictions, fixtures, or players.
--
-- The script is idempotent and can be rerun. It deliberately stops if the
-- active season's first player-selection lock has already passed, preventing a
-- pre-season roster import from silently rewriting in-season team history.

begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

-- Supabase may reuse the SQL-editor connection. Clear only this script's
-- session-local work tables so an immediate rerun is safe.
drop table if exists pg_temp.pp_arrival_assignment_ranked;
drop table if exists pg_temp.pp_arrival_canonical;
drop table if exists pg_temp.pp_arrival_ranked;
drop table if exists pg_temp.pp_before_summary;
drop table if exists pg_temp.pp_match_snapshot;
drop table if exists pg_temp.pp_context;
drop table if exists pg_temp.pp_player_aliases;
drop table if exists pg_temp.pp_player_changes;

create or replace function pg_temp.pp_player_key(input_text text)
returns text
language sql
stable
strict
set search_path = extensions, public, pg_catalog
as $$
  select regexp_replace(lower(unaccent(input_text)), '[^a-z0-9]+', '', 'g');
$$;

create temporary table pp_player_changes (
  change_key text primary key,
  canonical_name text not null,
  change_kind text not null check (change_kind in ('deactivate', 'arrival', 'metadata')),
  source_team text,
  destination_team text,
  nationality text,
  height_cm integer,
  loan_note text
);

insert into pp_player_changes (
  change_key, canonical_name, change_kind, source_team,
  destination_team, nationality, height_cm, loan_note
)
values
  ('benjamin-arthur',       'Benjamin Arthur',       'deactivate', 'Brentford',       null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('harry-howell',          'Harry Howell',          'deactivate', 'Brighton',        null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('enes-unal',             'Enes Unal',             'deactivate', 'Bournemouth',     null,             null,                     null, 'Left for a non-Premier-League club'),
  ('dastan-satpaev',        'Dastan Satpaev',        'deactivate', 'Chelsea',         null,             'Kazakhstan',             null, 'Loan to a non-Premier-League club'),
  ('ryan-kavuma-mcqueen',   'Ryan Kavuma-McQueen',   'deactivate', 'Chelsea',         null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('max-alleyne',           'Max Alleyne',           'deactivate', 'Manchester City', null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('cristian-romero',       'Cristian Romero',       'deactivate', 'Tottenham',       null,             null,                     null, 'Left for a non-Premier-League club'),
  ('djed-spence',           'Djed Spence',           'deactivate', 'Tottenham',       null,             null,                     null, 'Left for a non-Premier-League club'),
  ('yunus-konak',           'Yunus Konak',           'deactivate', 'Brentford',       null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('rodri',                 'Rodri',                  'deactivate', 'Manchester City', null,             null,                     null, 'Left for a non-Premier-League club'),
  ('guglielmo-vicario',     'Guglielmo Vicario',     'deactivate', 'Tottenham',       null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('tijjani-reijnders',     'Tijjani Reijnders',     'deactivate', 'Manchester City', null,             null,                     null, 'Left for a non-Premier-League club'),
  ('sebastiaan-bornauw',    'Sebastiaan Bornauw',    'deactivate', 'Leeds',           null,             null,                     null, 'Left for a non-Premier-League club'),
  ('reggie-walsh',          'Reggie Walsh',          'deactivate', 'Chelsea',         null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('joel-piroe',            'Joel Piroe',            'deactivate', 'Leeds',           null,             null,                     null, 'Loan to a non-Premier-League club'),
  ('kieran-morrison',       'Kieran Morrison',       'deactivate', 'Liverpool',       null,             null,                     null, 'Loan to a non-Premier-League club'),

  ('lucas-herrington-flag', 'Lucas Herrington',      'metadata',   'Hull',            null,             'Australia',              null, 'Nationality correction for flag display'),

  ('lucas-gourna-douath',   'Lucas Gourna-Douath',   'arrival',    null,              'Hull',           'France',                  185,  null),
  ('anan-khalaili',         'Anan Khalaili',         'arrival',    null,              'Crystal Palace', 'Israel',                  183,  null),
  ('abdoul-ouattara',       'Abdoul Ouattara',       'arrival',    null,              'Ipswich',        'Ivory Coast',             180,  null),
  ('julio-enciso',          'Julio Enciso',          'arrival',    null,              'Ipswich',        'Paraguay',                173,  null),
  ('amar-dedic',            'Amar Dedic',            'arrival',    null,              'Newcastle',      'Bosnia and Herzegovina',  180,  null),
  ('promise-david',         'Promise David',         'arrival',    null,              'Brighton',       'Canada',                  195,  'Signed on loan'),
  ('zavier-gozo',           'Zavier Gozo',           'arrival',    null,              'Crystal Palace', 'United States',           180,  null),
  ('zion-suzuki',           'Zion Suzuki',           'arrival',    null,              'Aston Villa',    'Japan',                   190,  null),
  ('sidiki-cherif',         'Sidiki Cherif',         'arrival',    null,              'Coventry',       'Guinea',                  188,  null),
  ('matteo-ruggeri',        'Matteo Ruggeri',        'arrival',    null,              'Aston Villa',    'Italy',                   187,  null),
  ('nico-elvedi',           'Nico Elvedi',           'arrival',    null,              'Leeds',          'Switzerland',             187,  null);

create temporary table pp_player_aliases (
  change_key text not null references pp_player_changes(change_key),
  alias_name text not null,
  primary key (change_key, alias_name)
);

insert into pp_player_aliases (change_key, alias_name)
values
  ('benjamin-arthur', 'Benjamin Arthur'),
  ('benjamin-arthur', 'Benjamin Kristian Arthur'),
  ('harry-howell', 'Harry Howell'),
  ('harry-howell', 'Harry John Howell'),
  ('enes-unal', 'Enes Unal'),
  ('enes-unal', 'Enes Ünal'),
  ('dastan-satpaev', 'Dastan Satpaev'),
  ('dastan-satpaev', 'Dastan Satpayev'),
  ('ryan-kavuma-mcqueen', 'Ryan Kavuma-McQueen'),
  ('ryan-kavuma-mcqueen', 'Ryan Denis Edward Kavuma-McQueen'),
  ('max-alleyne', 'Max Alleyne'),
  ('max-alleyne', 'Max Lewis Rowe Alleyne'),
  ('cristian-romero', 'Cristian Romero'),
  ('cristian-romero', 'Christian Romero'),
  ('cristian-romero', 'Cristian Gabriel Romero'),
  ('djed-spence', 'Djed Spence'),
  ('djed-spence', 'Diop Djed Spence'),
  ('djed-spence', 'Diop Spence'),
  ('yunus-konak', 'Yunus Konak'),
  ('yunus-konak', 'Yunus Emre Konak'),
  ('rodri', 'Rodri'),
  ('rodri', 'Rodrigo Hernandez Cascante'),
  ('rodri', 'Rodrigo Hernández Cascante'),
  ('guglielmo-vicario', 'Guglielmo Vicario'),
  ('tijjani-reijnders', 'Tijjani Reijnders'),
  ('tijjani-reijnders', 'Tijjani Martinus Jan Reijnders'),
  ('sebastiaan-bornauw', 'Sebastian Bornauw'),
  ('sebastiaan-bornauw', 'Sebastiaan Bornauw'),
  ('reggie-walsh', 'Reggie Walsh'),
  ('reggie-walsh', 'Reggie Spencer Walsh'),
  ('joel-piroe', 'Joel Piroe'),
  ('joel-piroe', 'Joel Mohammed Ramzan Piroe'),
  ('kieran-morrison', 'Kieran Morrison'),
  ('kieran-morrison', 'Kieran Yusuf Morrison'),
  ('lucas-herrington-flag', 'Lucas Herrington'),

  ('lucas-gourna-douath', 'Lucas Gourna-Douath'),
  ('lucas-gourna-douath', 'Lucas Gourna Douath'),
  ('anan-khalaili', 'Anan Khalaili'),
  ('abdoul-ouattara', 'Abdoul Ouattara'),
  ('julio-enciso', 'Julio Enciso'),
  ('julio-enciso', 'Julio Cesar Enciso Espinola'),
  ('julio-enciso', 'Julio César Enciso Espínola'),
  ('amar-dedic', 'Amar Dedic'),
  ('amar-dedic', 'Amar Dedić'),
  ('promise-david', 'Promise David'),
  ('zavier-gozo', 'Zavier Gozo'),
  ('zion-suzuki', 'Zion Suzuki'),
  ('sidiki-cherif', 'Sidiki Cherif'),
  ('matteo-ruggeri', 'Matteo Ruggeri'),
  ('matteo-ruggeri', 'Matteo Rugggeri'),
  ('nico-elvedi', 'Nico Elvedi');

create temporary table pp_context as
select
  seasons.id as season_id,
  gameweeks.id as first_gameweek_id,
  min(fixtures.prediction_locks_at) filter (where fixtures.status <> 'postponed') as first_selection_lock_at
from public.seasons seasons
join public.gameweeks gameweeks
  on gameweeks.season_id = seasons.id
 and gameweeks.number = 1
left join public.fixtures fixtures
  on fixtures.season_id = seasons.id
 and fixtures.gameweek_id = gameweeks.id
where seasons.is_active = true
group by seasons.id, gameweeks.id;

do $validation$
declare
  active_season_count integer;
  context_count integer;
  first_lock timestamptz;
  missing_teams text;
begin
  select count(*) into active_season_count
  from public.seasons
  where is_active = true;

  if active_season_count <> 1 then
    raise exception 'Player update stopped: expected exactly one active season, found %.', active_season_count;
  end if;

  select count(*), min(first_selection_lock_at)
    into context_count, first_lock
  from pp_context;

  if context_count <> 1 then
    raise exception 'Player update stopped: active-season Gameweek 1 was not found.';
  end if;

  if first_lock is null then
    raise exception 'Player update stopped: Gameweek 1 has no playable fixture lock time.';
  end if;

  if now() >= first_lock then
    raise exception 'Player update stopped: the first Gameweek 1 player-selection lock (%) has passed.', first_lock;
  end if;

  select string_agg(required_team, ', ' order by required_team)
    into missing_teams
  from (
    select distinct coalesce(source_team, destination_team) as required_team
    from pp_player_changes
    where coalesce(source_team, destination_team) is not null
  ) required
  where not exists (
    select 1 from public.teams teams where teams.name = required.required_team
  );

  if missing_teams is not null then
    raise exception 'Player update stopped: these team records were not found: %.', missing_teams;
  end if;
end
$validation$;

-- Snapshot every exact alias match before changing anything. Departures and the
-- metadata correction must also match the supplied current club; arrivals may
-- reuse an inactive record from any club rather than creating a duplicate.
create temporary table pp_match_snapshot as
select distinct
  changes.change_key,
  players.id as player_id,
  players.display_name,
  players.team_id,
  teams.name as team_name,
  players.nationality,
  players.height_cm,
  players.squad_status,
  players.is_active,
  players.created_at
from pp_player_changes changes
join public.players players
  on exists (
    select 1
    from pp_player_aliases aliases
    where aliases.change_key = changes.change_key
      and pg_temp.pp_player_key(players.display_name) = pg_temp.pp_player_key(aliases.alias_name)
  )
left join public.teams teams on teams.id = players.team_id
where changes.change_kind = 'arrival'
   or teams.name = changes.source_team;

create temporary table pp_before_summary as
select
  changes.change_key,
  count(snapshot.player_id)::integer as matched_records,
  coalesce(bool_or(snapshot.is_active), false) as any_active_before,
  string_agg(snapshot.display_name, ' | ' order by snapshot.display_name, snapshot.player_id) as matched_names
from pp_player_changes changes
left join pp_match_snapshot snapshot on snapshot.change_key = changes.change_key
group by changes.change_key;

-- Fail before the first persistent mutation if any named existing player could
-- not be resolved. This keeps the operation atomic instead of committing a
-- partial departure list and merely reporting the miss afterward.
do $existing_player_validation$
declare
  missing_players text;
begin
  select string_agg(changes.canonical_name, ', ' order by changes.canonical_name)
    into missing_players
  from pp_player_changes changes
  where changes.change_kind in ('deactivate', 'metadata')
    and not exists (
      select 1
      from pp_match_snapshot snapshot
      where snapshot.change_key = changes.change_key
    );

  if missing_players is not null then
    raise exception 'Player update stopped before making changes. Existing records were not found for: %.', missing_players;
  end if;
end
$existing_player_validation$;

create temporary table pp_arrival_ranked as
select
  snapshot.*,
  row_number() over (
    partition by snapshot.change_key
    order by
      (snapshot.team_id = destination.id) desc,
      snapshot.is_active desc,
      (pg_temp.pp_player_key(snapshot.display_name) = pg_temp.pp_player_key(changes.canonical_name)) desc,
      snapshot.created_at desc,
      snapshot.player_id
  ) as canonical_rank
from pp_match_snapshot snapshot
join pp_player_changes changes
  on changes.change_key = snapshot.change_key
 and changes.change_kind = 'arrival'
join public.teams destination on destination.name = changes.destination_team;

create temporary table pp_arrival_canonical (
  change_key text primary key,
  player_id uuid not null unique
);

insert into pp_arrival_canonical (change_key, player_id)
select change_key, player_id
from pp_arrival_ranked
where canonical_rank = 1;

-- Departures keep their last club and all historical links, but are removed
-- from the active player pool. No player row is deleted.
update public.players players
set
  is_active = false,
  nationality = coalesce(changes.nationality, players.nationality)
from pp_match_snapshot snapshot
join pp_player_changes changes
  on changes.change_key = snapshot.change_key
 and changes.change_kind = 'deactivate'
where players.id = snapshot.player_id;

-- Correct Lucas Herrington's nationality without changing his active status.
update public.players players
set nationality = changes.nationality
from pp_match_snapshot snapshot
join pp_player_changes changes
  on changes.change_key = snapshot.change_key
 and changes.change_kind = 'metadata'
where players.id = snapshot.player_id;

-- Reuse and reactivate the best existing record for each arrival.
update public.players players
set
  team_id = destination.id,
  squad_status = 'squad_player',
  nationality = changes.nationality,
  height_cm = changes.height_cm,
  is_active = true
from pp_arrival_canonical canonical
join pp_player_changes changes
  on changes.change_key = canonical.change_key
join public.teams destination on destination.name = changes.destination_team
where players.id = canonical.player_id;

-- Insert only arrivals for whom no alias matched an existing player record.
insert into public.players (
  display_name, team_id, squad_status, nationality, height_cm, is_active
)
select
  changes.canonical_name,
  destination.id,
  'squad_player',
  changes.nationality,
  changes.height_cm,
  true
from pp_player_changes changes
join public.teams destination on destination.name = changes.destination_team
where changes.change_kind = 'arrival'
  and not exists (
    select 1
    from pp_arrival_canonical canonical
    where canonical.change_key = changes.change_key
  );

-- Capture the newly inserted records in the same canonical map.
insert into pp_arrival_canonical (change_key, player_id)
select changes.change_key, players.id
from pp_player_changes changes
join public.teams destination on destination.name = changes.destination_team
join public.players players
  on players.team_id = destination.id
 and pg_temp.pp_player_key(players.display_name) = pg_temp.pp_player_key(changes.canonical_name)
where changes.change_kind = 'arrival'
  and not exists (
    select 1
    from pp_arrival_canonical canonical
    where canonical.change_key = changes.change_key
  );

-- If the database already contained duplicate aliases for a named arrival,
-- retain one deterministic canonical row and deactivate only the extras.
update public.players players
set is_active = false
from pp_arrival_ranked ranked
join pp_arrival_canonical canonical on canonical.change_key = ranked.change_key
where ranked.canonical_rank > 1
  and players.id = ranked.player_id
  and players.id <> canonical.player_id;

-- Identify at most one existing active-season assignment per named arrival.
-- Multiple rows are unexpected before Gameweek 1, so the safety check below
-- aborts instead of flattening a player's assignment history.
create temporary table pp_arrival_assignment_ranked as
select
  canonical.change_key,
  canonical.player_id,
  assignments.id as assignment_id,
  row_number() over (
    partition by canonical.change_key
    order by
      (
        assignments.starts_gameweek_id <= context.first_gameweek_id
        and (assignments.ends_gameweek_id is null or assignments.ends_gameweek_id >= context.first_gameweek_id)
      ) desc,
      assignments.starts_gameweek_id,
      assignments.created_at,
      assignments.id
  ) as assignment_rank,
  count(*) over (partition by canonical.change_key) as assignment_count
from pp_arrival_canonical canonical
cross join pp_context context
join public.player_team_assignments assignments
  on assignments.season_id = context.season_id
 and assignments.player_id = canonical.player_id;

do $assignment_validation$
declare
  duplicate_assignments text;
begin
  select string_agg(changes.canonical_name, ', ' order by changes.canonical_name)
    into duplicate_assignments
  from pp_arrival_assignment_ranked ranked
  join pp_player_changes changes on changes.change_key = ranked.change_key
  where ranked.assignment_rank = 1
    and ranked.assignment_count > 1;

  if duplicate_assignments is not null then
    raise exception 'Player update stopped before commit. Multiple active-season assignment rows require review for: %.', duplicate_assignments;
  end if;
end
$assignment_validation$;

-- These are pre-season moves, so align only the single applicable assignment
-- for each named arrival with Gameweek 1. This never clears or rebuilds the
-- assignment table and never rewrites any other player's row.
update public.player_team_assignments assignments
set
  team_id = destination.id,
  starts_gameweek_id = context.first_gameweek_id,
  ends_gameweek_id = null
from pp_arrival_assignment_ranked ranked
join pp_player_changes changes on changes.change_key = ranked.change_key
join public.teams destination on destination.name = changes.destination_team
cross join pp_context context
where assignments.season_id = context.season_id
  and assignments.id = ranked.assignment_id
  and ranked.assignment_rank = 1;

insert into public.player_team_assignments (
  season_id, player_id, team_id, starts_gameweek_id, ends_gameweek_id
)
select
  context.season_id,
  canonical.player_id,
  destination.id,
  context.first_gameweek_id,
  null
from pp_arrival_canonical canonical
join pp_player_changes changes on changes.change_key = canonical.change_key
join public.teams destination on destination.name = changes.destination_team
cross join pp_context context
where not exists (
  select 1
  from pp_arrival_assignment_ranked ranked
  where ranked.change_key = canonical.change_key
);

commit;

-- Final audit. Every row should say OK. A NOT_FOUND result means no player was
-- changed for that departure/metadata item and its spelling should be checked.
select
  case
    when changes.change_kind = 'deactivate' and summary.matched_records = 0
      then 'NOT_FOUND_NO_CHANGE'
    when changes.change_kind = 'deactivate' and summary.any_active_before
      then 'DEACTIVATED'
    when changes.change_kind = 'deactivate'
      then 'ALREADY_INACTIVE'
    when changes.change_kind = 'metadata' and summary.matched_records = 0
      then 'NOT_FOUND_NO_CHANGE'
    when changes.change_kind = 'metadata'
      then 'METADATA_UPDATED'
    when changes.change_kind = 'arrival' and summary.matched_records = 0
      then 'ADDED'
    else 'REACTIVATED_OR_UPDATED'
  end as action,
  changes.canonical_name as player,
  changes.source_team,
  changes.destination_team,
  summary.matched_records,
  greatest(summary.matched_records - 1, 0) as duplicate_records_deactivated,
  summary.matched_names as names_matched_before,
  final_team.name as final_team,
  final_player.nationality as final_nationality,
  final_player.height_cm as final_height_cm,
  final_player.is_active as final_is_active,
  changes.loan_note,
  case
    when changes.change_kind = 'deactivate' and summary.matched_records = 0 then 'REVIEW'
    when changes.change_kind = 'deactivate' and exists (
      select 1
      from pp_match_snapshot snapshot
      join public.players matched on matched.id = snapshot.player_id
      where snapshot.change_key = changes.change_key
        and matched.is_active = true
    ) then 'REVIEW'
    when changes.change_kind = 'metadata' and summary.matched_records = 0 then 'REVIEW'
    when changes.change_kind = 'metadata' and exists (
      select 1
      from pp_match_snapshot snapshot
      join public.players matched on matched.id = snapshot.player_id
      where snapshot.change_key = changes.change_key
        and matched.nationality is distinct from changes.nationality
    ) then 'REVIEW'
    when changes.change_kind = 'arrival' and (
      final_player.id is null
      or final_player.is_active is distinct from true
      or final_team.name is distinct from changes.destination_team
      or final_player.nationality is distinct from changes.nationality
      or final_player.height_cm is distinct from changes.height_cm
    ) then 'REVIEW'
    else 'OK'
  end as result
from pp_player_changes changes
join pp_before_summary summary on summary.change_key = changes.change_key
left join pp_arrival_canonical canonical on canonical.change_key = changes.change_key
left join lateral (
  select players.*
  from public.players players
  where players.id = coalesce(
    canonical.player_id,
    (
      select snapshot.player_id
      from pp_match_snapshot snapshot
      where snapshot.change_key = changes.change_key
      order by snapshot.is_active desc, snapshot.created_at desc, snapshot.player_id
      limit 1
    )
  )
) final_player on true
left join public.teams final_team on final_team.id = final_player.team_id
order by
  case changes.change_kind when 'deactivate' then 1 when 'metadata' then 2 else 3 end,
  changes.canonical_name;
