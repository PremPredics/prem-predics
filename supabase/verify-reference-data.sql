-- Quick reference-data health check.

select 'seasons' as table_name, count(*) as row_count from public.seasons
union all
select 'gameweeks', count(*) from public.gameweeks
union all
select 'teams', count(*) from public.teams
union all
select 'fixtures', count(*) from public.fixtures
union all
select 'players', count(*) from public.players
union all
select 'player_team_assignments', count(*) from public.player_team_assignments
union all
select 'card_definitions', count(*) from public.card_definitions
union all
select 'card_deck_cards', count(*) from public.card_deck_cards
order by table_name;
