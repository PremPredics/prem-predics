-- Allows private leagues to keep accepting members until the first kickoff of
-- their starting gameweek, then freezes the member count and deck variant.

with first_fixture as (
  select
    c.id as competition_id,
    min(f.kickoff_at) as first_kickoff_at
  from public.competitions c
  join public.fixtures f
    on f.season_id = c.season_id
   and f.gameweek_id = c.starts_gameweek_id
  where c.locked_member_count is null
  group by c.id
)
update public.competitions c
set
  member_lock_at = ff.first_kickoff_at,
  accepts_new_members = case
    when now() < ff.first_kickoff_at then true
    else c.accepts_new_members
  end
from first_fixture ff
where c.id = ff.competition_id
  and c.member_lock_at is distinct from ff.first_kickoff_at;

create or replace function public.enforce_competition_max_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_members integer;
  allowed_members integer;
  league_accepts_new_members boolean;
  league_member_lock_at timestamptz;
begin
  select
    case
      when c.member_lock_at is not null and now() < c.member_lock_at then 10
      else c.max_members
    end,
    c.accepts_new_members,
    c.member_lock_at
    into allowed_members, league_accepts_new_members, league_member_lock_at
  from public.competitions c
  where c.id = new.competition_id;

  if new.role <> 'owner' and (
    not coalesce(league_accepts_new_members, false)
    or (league_member_lock_at is not null and now() >= league_member_lock_at)
  ) then
    raise exception 'This private league has already started.';
  end if;

  select count(*)
    into current_members
  from public.competition_members cm
  where cm.competition_id = new.competition_id;

  if current_members >= allowed_members then
    raise exception 'This private league is already full.';
  end if;

  return new;
end;
$$;

create or replace function public.join_competition_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition_id uuid;
  target_max_members integer;
  target_accepts_new_members boolean;
  target_member_lock_at timestamptz;
  existing_member boolean;
  current_members integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a league.';
  end if;

  select
    c.id,
    case
      when c.member_lock_at is not null and now() < c.member_lock_at then 10
      else c.max_members
    end,
    c.accepts_new_members,
    c.member_lock_at
    into target_competition_id, target_max_members, target_accepts_new_members, target_member_lock_at
  from public.competitions c
  where lower(c.join_code) = lower(trim(invite_code))
  limit 1;

  if target_competition_id is null then
    raise exception 'League invite code not found.';
  end if;

  select exists (
    select 1
    from public.competition_members cm
    where cm.competition_id = target_competition_id
      and cm.user_id = auth.uid()
  )
    into existing_member;

  if existing_member then
    return target_competition_id;
  end if;

  if not coalesce(target_accepts_new_members, false)
    or (target_member_lock_at is not null and now() >= target_member_lock_at) then
    raise exception 'This private league has already started.';
  end if;

  select count(*)
    into current_members
  from public.competition_members cm
  where cm.competition_id = target_competition_id;

  if current_members >= target_max_members then
    raise exception 'This private league is already full.';
  end if;

  insert into public.competition_members (competition_id, user_id, role)
  values (target_competition_id, auth.uid(), 'member')
  on conflict (competition_id, user_id) do nothing;

  return target_competition_id;
end;
$$;

create or replace function public.sync_competition_member_lock(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  final_deck_variant_id text;
  target_lock_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to sync a league.';
  end if;

  if not public.is_competition_member(target_competition_id)
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_global_admin = true
    ) then
    raise exception 'You cannot access this league.';
  end if;

  select c.member_lock_at
    into target_lock_at
  from public.competitions c
  where c.id = target_competition_id;

  if target_lock_at is null or now() < target_lock_at then
    return;
  end if;

  select count(*)
    into member_count
  from public.competition_members
  where competition_id = target_competition_id;

  if member_count < 2 then
    raise exception 'A league needs at least two players before it can start.';
  end if;

  final_deck_variant_id := public.deck_variant_for_member_count(member_count);

  update public.competitions
  set
    max_members = member_count,
    deck_variant_id = final_deck_variant_id,
    locked_member_count = member_count,
    locked_deck_variant_id = final_deck_variant_id,
    accepts_new_members = false,
    started_at = coalesce(started_at, now())
  where id = target_competition_id
    and locked_member_count is null;
end;
$$;

grant execute on function public.sync_competition_member_lock(uuid) to authenticated;
