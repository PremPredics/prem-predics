-- Profile and private-league rule updates.
-- Run after the base schema and auth-profile-trigger.sql.

create table if not exists public.profile_nationalities (
  name text primary key
);

insert into public.profile_nationalities (name)
values
  ('Afghanistan'),
  ('Albania'),
  ('Algeria'),
  ('Andorra'),
  ('Angola'),
  ('Antigua & Deps'),
  ('Argentina'),
  ('Armenia'),
  ('Australia'),
  ('Austria'),
  ('Azerbaijan'),
  ('Bahamas'),
  ('Bahrain'),
  ('Bangladesh'),
  ('Barbados'),
  ('Belarus'),
  ('Belgium'),
  ('Belize'),
  ('Benin'),
  ('Bhutan'),
  ('Bolivia'),
  ('Bosnia Herzegovina'),
  ('Botswana'),
  ('Brazil'),
  ('Brunei'),
  ('Bulgaria'),
  ('Burkina'),
  ('Burundi'),
  ('Cambodia'),
  ('Cameroon'),
  ('Canada'),
  ('Cape Verde'),
  ('Central African Rep'),
  ('Chad'),
  ('Chile'),
  ('China'),
  ('Colombia'),
  ('Comoros'),
  ('Congo'),
  ('Congo {Democratic Rep}'),
  ('Costa Rica'),
  ('Croatia'),
  ('Cuba'),
  ('Cyprus'),
  ('Czech Republic'),
  ('Denmark'),
  ('Djibouti'),
  ('Dominica'),
  ('Dominican Republic'),
  ('East Timor'),
  ('Ecuador'),
  ('Egypt'),
  ('El Salvador'),
  ('Equatorial Guinea'),
  ('Eritrea'),
  ('Estonia'),
  ('Ethiopia'),
  ('Fiji'),
  ('Finland'),
  ('France'),
  ('Gabon'),
  ('Gambia'),
  ('Georgia'),
  ('Germany'),
  ('Ghana'),
  ('Greece'),
  ('Grenada'),
  ('Guatemala'),
  ('Guinea'),
  ('Guinea-Bissau'),
  ('Guyana'),
  ('Haiti'),
  ('Honduras'),
  ('Hungary'),
  ('Iceland'),
  ('India'),
  ('Indonesia'),
  ('Iran'),
  ('Iraq'),
  ('Ireland {Republic}'),
  ('Israel'),
  ('Italy'),
  ('Ivory Coast'),
  ('Jamaica'),
  ('Japan'),
  ('Jordan'),
  ('Kazakhstan'),
  ('Kenya'),
  ('Kiribati'),
  ('Korea North'),
  ('Korea South'),
  ('Kosovo'),
  ('Kuwait'),
  ('Kyrgyzstan'),
  ('Laos'),
  ('Latvia'),
  ('Lebanon'),
  ('Lesotho'),
  ('Liberia'),
  ('Libya'),
  ('Liechtenstein'),
  ('Lithuania'),
  ('Luxembourg'),
  ('Macedonia'),
  ('Madagascar'),
  ('Malawi'),
  ('Malaysia'),
  ('Maldives'),
  ('Mali'),
  ('Malta'),
  ('Marshall Islands'),
  ('Mauritania'),
  ('Mauritius'),
  ('Mexico'),
  ('Micronesia'),
  ('Moldova'),
  ('Monaco'),
  ('Mongolia'),
  ('Montenegro'),
  ('Morocco'),
  ('Mozambique'),
  ('Myanmar, {Burma}'),
  ('Namibia'),
  ('Nauru'),
  ('Nepal'),
  ('Netherlands'),
  ('New Zealand'),
  ('Nicaragua'),
  ('Niger'),
  ('Nigeria'),
  ('Norway'),
  ('Oman'),
  ('Pakistan'),
  ('Palau'),
  ('Panama'),
  ('Papua New Guinea'),
  ('Paraguay'),
  ('Peru'),
  ('Philippines'),
  ('Poland'),
  ('Portugal'),
  ('Qatar'),
  ('Romania'),
  ('Russian Federation'),
  ('Rwanda'),
  ('St Kitts & Nevis'),
  ('St Lucia'),
  ('Saint Vincent & the Grenadines'),
  ('Samoa'),
  ('San Marino'),
  ('Sao Tome & Principe'),
  ('Saudi Arabia'),
  ('Senegal'),
  ('Serbia'),
  ('Seychelles'),
  ('Sierra Leone'),
  ('Singapore'),
  ('Slovakia'),
  ('Slovenia'),
  ('Solomon Islands'),
  ('Somalia'),
  ('South Africa'),
  ('South Sudan'),
  ('Spain'),
  ('Sri Lanka'),
  ('Sudan'),
  ('Suriname'),
  ('Swaziland'),
  ('Sweden'),
  ('Switzerland'),
  ('Syria'),
  ('Taiwan'),
  ('Tajikistan'),
  ('Tanzania'),
  ('Thailand'),
  ('Togo'),
  ('Tonga'),
  ('Trinidad & Tobago'),
  ('Tunisia'),
  ('Turkey'),
  ('Turkmenistan'),
  ('Tuvalu'),
  ('Uganda'),
  ('Ukraine'),
  ('United Arab Emirates'),
  ('United Kingdom'),
  ('United States'),
  ('Uruguay'),
  ('Uzbekistan'),
  ('Vanuatu'),
  ('Vatican City'),
  ('Venezuela'),
  ('Vietnam'),
  ('Yemen'),
  ('Zambia'),
  ('Zimbabwe')
on conflict (name) do nothing;

alter table public.profile_nationalities enable row level security;

drop policy if exists "profile nationalities are readable" on public.profile_nationalities;
create policy "profile nationalities are readable"
on public.profile_nationalities for select
to anon, authenticated
using (true);

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists nationality text,
  add column if not exists favorite_team_id uuid references public.teams(id),
  add column if not exists profile_image_url text;

update public.profiles p
set nationality = null
where p.nationality is not null
  and not exists (
    select 1
    from public.profile_nationalities pn
    where pn.name = p.nationality
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_nationality_fk'
  ) then
    alter table public.profiles
      add constraint profiles_nationality_fk
      foreign key (nationality)
      references public.profile_nationalities(name);
  end if;
end;
$$;

update public.profiles
set first_name = coalesce(nullif(trim(first_name), ''), nullif(trim(display_name), ''), 'Player')
where first_name is null
  or trim(first_name) = '';

alter table public.profiles
  alter column first_name set not null;

create unique index if not exists profiles_display_name_ci_unique
on public.profiles (lower(display_name));

create unique index if not exists competitions_name_ci_unique
on public.competitions (lower(name));

create table if not exists public.profile_username_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  old_display_name text not null,
  new_display_name text not null,
  changed_at timestamptz not null default now(),
  unique (user_id, season_id)
);

alter table public.profile_username_changes enable row level security;

drop policy if exists "profile username changes visible to owner admins" on public.profile_username_changes;
create policy "profile username changes visible to owner admins"
on public.profile_username_changes for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admins manage profile username changes" on public.profile_username_changes;
create policy "admins manage profile username changes"
on public.profile_username_changes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reference teams are readable" on public.teams;
create policy "reference teams are readable"
on public.teams for select
to anon, authenticated
using (true);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_display_name text;
  profile_first_name text;
  profile_last_name text;
  profile_nationality text;
  profile_favorite_team_id uuid;
  profile_image_url text;
begin
  profile_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'Player ' || upper(substr(replace(new.id::text, '-', ''), 1, 6))
  );

  profile_first_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    profile_display_name
  );

  profile_last_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  profile_nationality := nullif(trim(coalesce(new.raw_user_meta_data ->> 'nationality', '')), '');
  profile_image_url := nullif(trim(coalesce(new.raw_user_meta_data ->> 'profile_image_url', '')), '');

  if profile_nationality is not null
    and not exists (
      select 1
      from public.profile_nationalities pn
      where pn.name = profile_nationality
    ) then
    profile_nationality := null;
  end if;

  if profile_image_url is not null
    and (
      profile_image_url not like 'data:image/%'
      or length(profile_image_url) > 700000
    ) then
    profile_image_url := null;
  end if;

  if nullif(trim(coalesce(new.raw_user_meta_data ->> 'favorite_team_id', '')), '') is not null then
    select t.id
      into profile_favorite_team_id
    from public.teams t
    where t.id::text = trim(new.raw_user_meta_data ->> 'favorite_team_id')
    limit 1;
  end if;

  if profile_favorite_team_id is null
    and nullif(trim(coalesce(new.raw_user_meta_data ->> 'favorite_team_name', '')), '') is not null then
    select t.id
      into profile_favorite_team_id
    from public.teams t
    where lower(t.name) = lower(trim(new.raw_user_meta_data ->> 'favorite_team_name'))
    limit 1;
  end if;

  insert into public.profiles (
    id,
    display_name,
    first_name,
    last_name,
    nationality,
    favorite_team_id,
    profile_image_url
  )
  values (
    new.id,
    profile_display_name,
    profile_first_name,
    profile_last_name,
    profile_nationality,
    profile_favorite_team_id,
    profile_image_url
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.current_active_season_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.seasons s
  where s.is_active = true
  order by s.starts_on desc nulls last, s.created_at desc
  limit 1;
$$;

drop function if exists public.update_my_profile(text, text, text, text, uuid);

create or replace function public.update_my_profile(
  target_display_name text,
  target_first_name text,
  target_last_name text default null,
  target_nationality text default null,
  target_favorite_team_id uuid default null,
  target_profile_image_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  updated_profile public.profiles;
  active_season uuid;
  cleaned_display_name text := nullif(trim(target_display_name), '');
  cleaned_first_name text := nullif(trim(target_first_name), '');
  cleaned_last_name text := nullif(trim(coalesce(target_last_name, '')), '');
  cleaned_nationality text := nullif(trim(coalesce(target_nationality, '')), '');
  cleaned_profile_image_url text := nullif(trim(coalesce(target_profile_image_url, '')), '');
  username_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to update your profile.';
  end if;

  if cleaned_display_name is null or length(cleaned_display_name) < 2 then
    raise exception 'Username must be at least 2 characters.';
  end if;

  if cleaned_first_name is null then
    raise exception 'First name is required.';
  end if;

  if cleaned_nationality is not null
    and not exists (
      select 1
      from public.profile_nationalities pn
      where pn.name = cleaned_nationality
    ) then
    raise exception 'Choose nationality from the list.';
  end if;

  if target_favorite_team_id is not null
    and not exists (select 1 from public.teams t where t.id = target_favorite_team_id) then
    raise exception 'Favourite team was not found.';
  end if;

  if cleaned_profile_image_url is not null
    and cleaned_profile_image_url not like 'data:image/%' then
    raise exception 'Profile picture must be an image.';
  end if;

  if cleaned_profile_image_url is not null
    and length(cleaned_profile_image_url) > 700000 then
    raise exception 'Profile picture is too large.';
  end if;

  select p.*
    into current_profile
  from public.profiles p
  where p.id = auth.uid()
  for update;

  if current_profile.id is null then
    raise exception 'Profile was not found.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(p.display_name) = lower(cleaned_display_name)
      and p.id <> auth.uid()
  ) then
    raise exception 'That username is already taken.' using errcode = '23505';
  end if;

  username_changed := current_profile.display_name is distinct from cleaned_display_name;

  if username_changed then
    active_season := public.current_active_season_id();

    if active_season is null then
      raise exception 'No active season is configured.';
    end if;

    if exists (
      select 1
      from public.profile_username_changes puc
      where puc.user_id = auth.uid()
        and puc.season_id = active_season
    ) then
      raise exception 'You have already changed your username this season.';
    end if;

    insert into public.profile_username_changes (
      user_id,
      season_id,
      old_display_name,
      new_display_name
    )
    values (
      auth.uid(),
      active_season,
      current_profile.display_name,
      cleaned_display_name
    );
  end if;

  update public.profiles
  set
    display_name = cleaned_display_name,
    first_name = cleaned_first_name,
    last_name = cleaned_last_name,
    nationality = cleaned_nationality,
    favorite_team_id = target_favorite_team_id,
    profile_image_url = cleaned_profile_image_url
  where id = auth.uid()
  returning *
    into updated_profile;

  return updated_profile;
end;
$$;

create or replace function public.leave_competition_before_start(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  target_member_lock_at timestamptz;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to leave a league.';
  end if;

  select cm.role, c.member_lock_at
    into current_role, target_member_lock_at
  from public.competition_members cm
  join public.competitions c on c.id = cm.competition_id
  where cm.competition_id = target_competition_id
    and cm.user_id = auth.uid();

  if current_role is null then
    raise exception 'You are not a member of this league.';
  end if;

  if target_member_lock_at is not null and now() >= target_member_lock_at then
    raise exception 'You cannot leave a league after its first gameweek has started.';
  end if;

  select count(*)
    into member_count
  from public.competition_members
  where competition_id = target_competition_id;

  if current_role = 'owner' then
    if member_count > 1 then
      raise exception 'The owner cannot leave while other players are still in the league.';
    end if;

    delete from public.competitions
    where id = target_competition_id
      and owner_id = auth.uid();

    return;
  end if;

  delete from public.competition_members
  where competition_id = target_competition_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.finalize_competition_start(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  final_deck_variant_id text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to start a league.';
  end if;

  if not public.can_manage_competition(target_competition_id) then
    raise exception 'You cannot manage this league.';
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
  where id = target_competition_id;
end;
$$;

grant execute on function public.leave_competition_before_start(uuid) to authenticated;
grant execute on function public.finalize_competition_start(uuid) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, uuid, text) to authenticated;
grant select on public.teams to anon;
grant select on public.profile_nationalities to anon, authenticated;
grant select on public.profile_username_changes to authenticated;
revoke update on public.profiles from authenticated;
grant insert on public.profiles to authenticated;
