-- Semi-automated roster maintenance.
-- Creates a review queue so API/manual squad changes can be staged before they touch live players.

create table if not exists public.roster_change_queue (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'manual',
  provider_player_id text,
  action text not null check (action in ('add_player', 'update_player', 'reactivate_player', 'end_assignment', 'deactivate_player')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'ignored')),
  season_id uuid references public.seasons(id) on delete cascade,
  team_id uuid references public.teams(id),
  player_id uuid references public.players(id),
  display_name text not null,
  first_name text,
  last_name text,
  nationality text,
  height_cm integer check (height_cm is null or height_cm > 0),
  squad_status text check (squad_status is null or squad_status in ('squad_player', 'u21')),
  starts_gameweek_id bigint references public.gameweeks(id),
  ends_gameweek_id bigint references public.gameweeks(id),
  source_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.roster_change_queue enable row level security;

drop policy if exists "admins manage roster change queue" on public.roster_change_queue;
create policy "admins manage roster change queue"
on public.roster_change_queue for all
using (public.is_admin())
with check (public.is_admin());

create index if not exists roster_change_queue_status_created_idx
on public.roster_change_queue (status, created_at desc);

create index if not exists roster_change_queue_team_status_idx
on public.roster_change_queue (team_id, status);

create or replace function public.approve_roster_change(target_change_id uuid)
returns public.roster_change_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  change_row public.roster_change_queue;
  resolved_player_id uuid;
  existing_current_assignment_id uuid;
  previous_gameweek_id bigint;
  result_row public.roster_change_queue;
begin
  if not public.is_admin() then
    raise exception 'Only global admins can approve roster changes.';
  end if;

  select *
  into change_row
  from public.roster_change_queue
  where id = target_change_id
  for update;

  if change_row.id is null then
    raise exception 'Roster change not found.';
  end if;

  if change_row.status <> 'pending' then
    raise exception 'Roster change has already been reviewed.';
  end if;

  resolved_player_id := change_row.player_id;

  if change_row.action in ('add_player', 'update_player', 'reactivate_player') then
    if resolved_player_id is null then
      select p.id
      into resolved_player_id
      from public.players p
      where p.team_id = change_row.team_id
        and lower(p.display_name) = lower(change_row.display_name)
      order by p.is_active desc, p.created_at desc
      limit 1;
    end if;

    if resolved_player_id is null then
      insert into public.players (
        display_name,
        first_name,
        last_name,
        surname,
        scrabble_name,
        nationality,
        height_cm,
        team_id,
        squad_status,
        is_active
      )
      values (
        change_row.display_name,
        change_row.first_name,
        change_row.last_name,
        change_row.last_name,
        change_row.last_name,
        change_row.nationality,
        change_row.height_cm,
        change_row.team_id,
        coalesce(change_row.squad_status, 'squad_player'),
        true
      )
      returning id into resolved_player_id;
    else
      update public.players p
      set
        display_name = coalesce(nullif(change_row.display_name, ''), p.display_name),
        first_name = coalesce(nullif(change_row.first_name, ''), p.first_name),
        last_name = coalesce(nullif(change_row.last_name, ''), p.last_name),
        surname = coalesce(nullif(change_row.last_name, ''), p.surname),
        scrabble_name = coalesce(nullif(change_row.last_name, ''), p.scrabble_name),
        nationality = coalesce(nullif(change_row.nationality, ''), p.nationality),
        height_cm = coalesce(change_row.height_cm, p.height_cm),
        team_id = coalesce(change_row.team_id, p.team_id),
        squad_status = coalesce(change_row.squad_status, p.squad_status, 'squad_player'),
        is_active = true
      where p.id = resolved_player_id;
    end if;

    if change_row.season_id is not null and change_row.starts_gameweek_id is not null then
      select previous_gameweek.id
      into previous_gameweek_id
      from public.gameweeks current_gameweek
      join public.gameweeks previous_gameweek
        on previous_gameweek.season_id = current_gameweek.season_id
       and previous_gameweek.number < current_gameweek.number
      where current_gameweek.id = change_row.starts_gameweek_id
        and current_gameweek.season_id = change_row.season_id
      order by previous_gameweek.number desc
      limit 1;

      update public.player_team_assignments current_assignment
      set ends_gameweek_id = coalesce(previous_gameweek_id, change_row.starts_gameweek_id)
      where current_assignment.season_id = change_row.season_id
        and current_assignment.player_id = resolved_player_id
        and current_assignment.ends_gameweek_id is null
        and (change_row.team_id is null or current_assignment.team_id <> change_row.team_id);
    end if;

    if change_row.season_id is not null
      and change_row.team_id is not null
      and change_row.starts_gameweek_id is not null
      and not exists (
        select 1
        from public.player_team_assignments existing_assignment
        where existing_assignment.season_id = change_row.season_id
          and existing_assignment.player_id = resolved_player_id
          and existing_assignment.team_id = change_row.team_id
          and existing_assignment.starts_gameweek_id = change_row.starts_gameweek_id
          and existing_assignment.ends_gameweek_id is not distinct from change_row.ends_gameweek_id
      ) then
      insert into public.player_team_assignments (
        season_id,
        player_id,
        team_id,
        starts_gameweek_id,
        ends_gameweek_id,
        entered_by
      )
      values (
        change_row.season_id,
        resolved_player_id,
        change_row.team_id,
        change_row.starts_gameweek_id,
        change_row.ends_gameweek_id,
        change_row.created_by
      );
    end if;
  elsif change_row.action in ('end_assignment', 'deactivate_player') then
    if resolved_player_id is null then
      select p.id
      into resolved_player_id
      from public.players p
      where p.team_id = change_row.team_id
        and lower(p.display_name) = lower(change_row.display_name)
      order by p.is_active desc, p.created_at desc
      limit 1;
    end if;

    if resolved_player_id is null then
      raise exception 'Could not match player to end/deactivate.';
    end if;

    if change_row.action = 'end_assignment' then
      select pta.id
      into existing_current_assignment_id
      from public.player_team_assignments pta
      where pta.player_id = resolved_player_id
        and (change_row.season_id is null or pta.season_id = change_row.season_id)
        and (change_row.team_id is null or pta.team_id = change_row.team_id)
        and pta.ends_gameweek_id is null
      order by pta.starts_gameweek_id desc
      limit 1;

      if existing_current_assignment_id is not null then
        update public.player_team_assignments
        set ends_gameweek_id = change_row.ends_gameweek_id
        where id = existing_current_assignment_id;
      end if;
    end if;

    update public.players
    set is_active = false
    where id = resolved_player_id;
  end if;

  update public.roster_change_queue
  set
    status = 'approved',
    player_id = resolved_player_id,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = target_change_id
  returning * into result_row;

  return result_row;
end;
$$;
