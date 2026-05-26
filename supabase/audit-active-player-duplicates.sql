-- Lists active selectable players that share the same display name.
-- Useful after roster imports/transfers to spot duplicate Star Man options.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

select
  lower(extensions.unaccent(players.display_name)) as duplicate_key,
  count(*) as active_rows,
  string_agg(
    players.display_name || ' | ' || coalesce(teams.name, 'No Team') || ' | ' || players.id::text,
    E'\n'
    order by teams.name, players.display_name
  ) as matching_players
from public.players players
left join public.teams teams on teams.id = players.team_id
where players.is_active = true
group by lower(extensions.unaccent(players.display_name))
having count(*) > 1
order by duplicate_key;
