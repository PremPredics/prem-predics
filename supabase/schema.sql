-- Prem Predics Supabase schema
-- Version 1: accounts, predictions, Star Man picks, manual admin scoring, live leaderboards.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profile_nationalities (
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
  ('Zimbabwe');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  first_name text not null,
  last_name text,
  nationality text references public.profile_nationalities(name),
  profile_image_url text,
  favorite_color text not null default '#ffffff'
    check (favorite_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_display_name_ci_unique
on public.profiles (lower(display_name));

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where admins.user_id = auth.uid()
  );
$$;

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profile_username_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  old_display_name text not null,
  new_display_name text not null,
  changed_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column favorite_team_id uuid references public.teams(id);

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

create or replace function public.update_my_profile(
  target_display_name text,
  target_first_name text,
  target_last_name text default null,
  target_nationality text default null,
  target_favorite_team_id uuid default null,
  target_profile_image_url text default null,
  target_favorite_color text default '#ffffff'
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
  cleaned_favorite_color text := coalesce(nullif(trim(coalesce(target_favorite_color, '')), ''), '#ffffff');
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

  if cleaned_favorite_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Choose a valid favourite colour.';
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
    profile_image_url = cleaned_profile_image_url,
    favorite_color = lower(cleaned_favorite_color)
  where id = auth.uid()
  returning *
    into updated_profile;

  return updated_profile;
end;
$$;

create table public.gameweeks (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.seasons(id) on delete cascade,
  number integer not null check (number between 1 and 38),
  star_man_locks_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (season_id, number),
  unique (id, season_id)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null,
  original_gameweek_id bigint,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  kickoff_at timestamptz not null,
  prediction_locks_at timestamptz not null,
  second_half_deadline_at timestamptz not null,
  sort_order integer not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'postponed', 'locked', 'in_progress', 'final')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (original_gameweek_id, season_id)
    references public.gameweeks(id, season_id),
  unique (id, season_id),
  check (home_team_id <> away_team_id)
);

create trigger fixtures_set_updated_at
before update on public.fixtures
for each row execute function public.set_updated_at();

create or replace function public.set_fixture_deadlines()
returns trigger
language plpgsql
as $$
begin
  new.prediction_locks_at = new.kickoff_at - interval '90 minutes';
  new.second_half_deadline_at = new.kickoff_at + interval '60 minutes';
  return new;
end;
$$;

create trigger fixtures_set_deadlines
before insert or update of kickoff_at on public.fixtures
for each row execute function public.set_fixture_deadlines();

create table public.fixture_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  previous_gameweek_id bigint references public.gameweeks(id) on delete set null,
  new_gameweek_id bigint references public.gameweeks(id) on delete set null,
  previous_kickoff_at timestamptz,
  new_kickoff_at timestamptz,
  reason text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create or replace function public.star_man_lock_at_for_gameweek(
  target_season_id uuid,
  target_gameweek_id bigint
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select min(f.kickoff_at) - interval '90 minutes'
      from public.fixtures f
      where f.season_id = target_season_id
        and f.gameweek_id = target_gameweek_id
        and f.status <> 'postponed'
    ),
    (
      select gw.star_man_locks_at
      from public.gameweeks gw
      where gw.season_id = target_season_id
        and gw.id = target_gameweek_id
    )
  );
$$;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  first_name text,
  last_name text,
  first_initial text,
  last_initial text,
  surname text,
  scrabble_name text,
  team_id uuid references public.teams(id),
  squad_status text check (squad_status is null or squad_status in ('squad_player', 'u21')),
  is_homegrown boolean not null default false,
  position text,
  date_of_birth date,
  nationality text,
  height_cm integer check (height_cm is null or height_cm > 0),
  squad_number integer check (squad_number is null or squad_number >= 0),
  surname_scrabble_score integer check (surname_scrabble_score is null or surname_scrabble_score >= 0),
  is_home_nation boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (display_name, team_id)
);

create or replace function public.clean_player_name_part(input_text text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(input_text, '')), '[[:space:]]+', ' ', 'g'), '');
$$;

create or replace function public.set_player_name_details()
returns trigger
language plpgsql
as $$
declare
  cleaned_display_name text;
  derived_first_name text;
  derived_last_name text;
begin
  cleaned_display_name := public.clean_player_name_part(new.display_name);

  derived_first_name := public.clean_player_name_part(new.first_name);
  if derived_first_name is null and cleaned_display_name is not null then
    derived_first_name := split_part(cleaned_display_name, ' ', 1);
  end if;

  derived_last_name := public.clean_player_name_part(new.last_name);
  if derived_last_name is null then
    derived_last_name := public.clean_player_name_part(new.surname);
  end if;
  if derived_last_name is null and cleaned_display_name is not null then
    derived_last_name := regexp_replace(cleaned_display_name, '^.*[[:space:]]', '');
  end if;

  new.first_name := derived_first_name;
  new.last_name := derived_last_name;
  new.first_initial := upper(left(coalesce(derived_first_name, ''), 1));
  new.last_initial := upper(left(coalesce(derived_last_name, ''), 1));
  new.surname := coalesce(derived_last_name, new.surname);
  new.scrabble_name := coalesce(nullif(new.scrabble_name, ''), derived_last_name, new.surname, cleaned_display_name);
  new.is_home_nation := coalesce(new.nationality in ('England', 'Wales', 'Scotland', 'Northern Ireland'), false);

  return new;
end;
$$;

create trigger players_set_name_details
before insert or update of display_name, surname, first_name, last_name, nationality on public.players
for each row execute function public.set_player_name_details();

create or replace function public.scrabble_score(input_text text)
returns integer
language plpgsql
immutable
as $$
declare
  clean_text text;
  total integer := 0;
  letter text;
begin
  clean_text := regexp_replace(upper(coalesce(input_text, '')), '[^A-Z]', '', 'g');

  for letter in select regexp_split_to_table(clean_text, '') loop
    total := total + case
      when letter in ('A', 'E', 'I', 'O', 'U', 'L', 'N', 'S', 'T', 'R') then 1
      when letter in ('D', 'G') then 2
      when letter in ('B', 'C', 'M', 'P') then 3
      when letter in ('F', 'H', 'V', 'W', 'Y') then 4
      when letter = 'K' then 5
      when letter in ('J', 'X') then 8
      when letter in ('Q', 'Z') then 10
      else 0
    end;
  end loop;

  return total;
end;
$$;

create or replace function public.set_player_scrabble_score()
returns trigger
language plpgsql
as $$
declare
  fallback_name text;
begin
  fallback_name := regexp_replace(coalesce(new.display_name, ''), '^.*[[:space:]]', '');
  new.scrabble_name := coalesce(nullif(new.last_name, ''), nullif(new.surname, ''), nullif(new.scrabble_name, ''), nullif(fallback_name, ''), new.display_name);
  new.surname_scrabble_score := public.scrabble_score(new.scrabble_name);
  return new;
end;
$$;

create trigger players_set_scrabble_score
before insert or update of display_name, first_name, last_name, surname, scrabble_name on public.players
for each row execute function public.set_player_scrabble_score();

create table public.player_team_assignments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  starts_gameweek_id bigint not null,
  ends_gameweek_id bigint,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (starts_gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (ends_gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  check (ends_gameweek_id is null or ends_gameweek_id >= starts_gameweek_id)
);

create trigger player_team_assignments_set_updated_at
before update on public.player_team_assignments
for each row execute function public.set_updated_at();

create table public.card_deck_variants (
  id text primary key,
  name text not null,
  min_members integer not null check (min_members between 2 and 10),
  max_members integer not null check (max_members between 2 and 10),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (min_members <= max_members)
);

insert into public.card_deck_variants (id, name, min_members, max_members, description)
select
  'players_' || player_count,
  player_count || ' Player Deck',
  player_count,
  player_count,
  'Exact ' || player_count || '-player deck. Regular deck uses 26 cards per player, scaled from the original 52-card 2-player deck.'
from generate_series(2, 10) as counts(player_count)
on conflict (id) do nothing;

create or replace function public.deck_variant_for_member_count(member_count integer)
returns text
language sql
immutable
as $$
  select case
    when member_count between 2 and 10 then 'players_' || member_count::text
    else null
  end;
$$;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  max_members integer not null default 10 check (max_members between 2 and 10),
  deck_variant_id text not null default 'players_10'
    references public.card_deck_variants(id),
  starts_gameweek_id bigint not null,
  starts_at timestamptz not null,
  member_lock_at timestamptz not null,
  started_at timestamptz,
  accepts_new_members boolean not null default true,
  locked_member_count integer check (locked_member_count is null or locked_member_count between 2 and 10),
  locked_deck_variant_id text references public.card_deck_variants(id),
  join_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (starts_gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete restrict,
  unique (id, season_id),
  check (
    (max_members = 2 and deck_variant_id = 'players_2')
    or (max_members = 3 and deck_variant_id = 'players_3')
    or (max_members = 4 and deck_variant_id = 'players_4')
    or (max_members = 5 and deck_variant_id = 'players_5')
    or (max_members = 6 and deck_variant_id = 'players_6')
    or (max_members = 7 and deck_variant_id = 'players_7')
    or (max_members = 8 and deck_variant_id = 'players_8')
    or (max_members = 9 and deck_variant_id = 'players_9')
    or (max_members = 10 and deck_variant_id = 'players_10')
  ),
  check (
    (locked_member_count is null and locked_deck_variant_id is null)
    or (
      locked_member_count is not null
      and locked_deck_variant_id = public.deck_variant_for_member_count(locked_member_count)
    )
  )
);

create unique index competitions_name_ci_unique
on public.competitions (lower(name));

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

create table public.competition_members (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

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

create trigger competition_members_enforce_max_members
before insert on public.competition_members
for each row execute function public.enforce_competition_max_members();

create or replace function public.add_competition_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.competition_members (competition_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (competition_id, user_id)
  do update set role = 'owner';

  return new;
end;
$$;

create trigger competitions_add_owner_member
after insert on public.competitions
for each row execute function public.add_competition_owner_member();

create or replace function public.is_competition_member(target_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competition_members cm
    where cm.competition_id = target_competition_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_member_of_season(target_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competition_members cm
    join public.competitions c on c.id = cm.competition_id
    where cm.user_id = auth.uid()
      and c.season_id = target_season_id
  );
$$;

create or replace function public.shares_private_league_with(target_user_id uuid, target_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competition_members mine
    join public.competition_members theirs
      on theirs.competition_id = mine.competition_id
    join public.competitions c on c.id = mine.competition_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
      and c.season_id = target_season_id
  );
$$;

create or replace function public.can_manage_competition(target_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.competitions c
      where c.id = target_competition_id
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.competition_members cm
      where cm.competition_id = target_competition_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    );
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

  update public.active_card_effects
  set status = 'removed',
      resolved_at = now()
  where competition_id = target_competition_id
    and played_by_user_id = auth.uid()
    and status = 'active';

  update public.league_cards lc
  set owner_user_id = null,
      zone = case cd.deck_type
        when 'premium' then 'premium_deck'
        else 'regular_deck'
      end,
      source = 'returned_prestart_leave',
      updated_at = now()
  from public.card_definitions cd
  where cd.id = lc.card_id
    and lc.competition_id = target_competition_id
    and lc.owner_user_id = auth.uid()
    and cd.deck_type in ('regular', 'premium');

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

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  prediction_slot text not null default 'primary'
    check (prediction_slot in ('primary', 'hedge', 'power_of_god', 'curse_hated', 'curse_gambler')),
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  source_card_effect_id uuid,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  unique (competition_id, fixture_id, user_id, prediction_slot)
);

create trigger predictions_set_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

create table public.match_results (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  had_clean_sheet boolean not null default false,
  entered_by uuid references public.profiles(id),
  finalized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_match_result_flags()
returns trigger
language plpgsql
as $$
begin
  new.had_clean_sheet := (new.home_goals = 0 or new.away_goals = 0);
  return new;
end;
$$;

create trigger match_results_set_flags
before insert or update of home_goals, away_goals on public.match_results
for each row execute function public.set_match_result_flags();

create trigger match_results_set_updated_at
before update on public.match_results
for each row execute function public.set_updated_at();

create table public.fixture_game_stats (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  home_corners integer check (home_corners is null or home_corners >= 0),
  away_corners integer check (away_corners is null or away_corners >= 0),
  home_yellow_cards integer check (home_yellow_cards is null or home_yellow_cards >= 0),
  away_yellow_cards integer check (away_yellow_cards is null or away_yellow_cards >= 0),
  home_red_cards integer check (home_red_cards is null or home_red_cards >= 0),
  away_red_cards integer check (away_red_cards is null or away_red_cards >= 0),
  earliest_goal_minute integer check (earliest_goal_minute is null or earliest_goal_minute >= 0),
  stoppage_time_goals integer check (stoppage_time_goals is null or stoppage_time_goals >= 0),
  penalties_scored integer check (penalties_scored is null or penalties_scored >= 0),
  played_in_heavy_snow boolean not null default false,
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create trigger fixture_game_stats_set_updated_at
before update on public.fixture_game_stats
for each row execute function public.set_updated_at();

create table public.player_fixture_stats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  gameweek_id bigint not null,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  opponent_team_id uuid references public.teams(id),
  was_home_team boolean,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  outside_box_goals integer not null default 0 check (outside_box_goals >= 0),
  outside_box_assists integer not null default 0 check (outside_box_assists >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  started boolean,
  was_benched boolean,
  was_in_matchday_squad boolean,
  was_substituted boolean,
  substituted_on_minute integer check (substituted_on_minute is null or substituted_on_minute >= 0),
  substituted_off_minute integer check (substituted_off_minute is null or substituted_off_minute >= 0),
  minutes_played integer check (minutes_played is null or minutes_played >= 0),
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (fixture_id, player_id),
  check (team_id <> opponent_team_id)
);

create trigger player_fixture_stats_set_updated_at
before update on public.player_fixture_stats
for each row execute function public.set_updated_at();

create table public.star_man_picks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id),
  pick_slot text not null default 'primary'
    check (pick_slot in ('primary', 'super_duo')),
  source_card_effect_id uuid,
  picked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (competition_id, gameweek_id, user_id, pick_slot),
  constraint star_man_picks_unique_player_per_user_competition_season
    unique (competition_id, season_id, user_id, player_id)
);

create trigger star_man_picks_set_updated_at
before update on public.star_man_picks
for each row execute function public.set_updated_at();

create table public.player_gameweek_stats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null,
  player_id uuid not null references public.players(id) on delete cascade,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  outside_box_goals integer not null default 0 check (outside_box_goals >= 0),
  outside_box_assists integer not null default 0 check (outside_box_assists >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  started boolean,
  was_benched boolean,
  minutes_played integer check (minutes_played is null or minutes_played >= 0),
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (season_id, gameweek_id, player_id)
);

create trigger player_gameweek_stats_set_updated_at
before update on public.player_gameweek_stats
for each row execute function public.set_updated_at();

create table public.team_gameweek_standings (
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  league_position integer not null check (league_position between 1 and 20),
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (season_id, gameweek_id, team_id),
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade
);

create trigger team_gameweek_standings_set_updated_at
before update on public.team_gameweek_standings
for each row execute function public.set_updated_at();

create or replace view public.team_gameweek_computed_standings
with (security_invoker = true)
as
with match_rows as (
  select
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    f.home_team_id as team_id,
    1 as played,
    case when mr.home_goals > mr.away_goals then 1 else 0 end as wins,
    case when mr.home_goals = mr.away_goals then 1 else 0 end as draws,
    case when mr.home_goals < mr.away_goals then 1 else 0 end as losses,
    mr.home_goals as goals_for,
    mr.away_goals as goals_against,
    case
      when mr.home_goals > mr.away_goals then 3
      when mr.home_goals = mr.away_goals then 1
      else 0
    end as points
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  join public.match_results mr on mr.fixture_id = f.id

  union all

  select
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    f.away_team_id as team_id,
    1 as played,
    case when mr.away_goals > mr.home_goals then 1 else 0 end as wins,
    case when mr.away_goals = mr.home_goals then 1 else 0 end as draws,
    case when mr.away_goals < mr.home_goals then 1 else 0 end as losses,
    mr.away_goals as goals_for,
    mr.home_goals as goals_against,
    case
      when mr.away_goals > mr.home_goals then 3
      when mr.away_goals = mr.home_goals then 1
      else 0
    end as points
  from public.fixtures f
  join public.gameweeks gw on gw.id = f.gameweek_id
  join public.match_results mr on mr.fixture_id = f.id
),
cumulative as (
  select
    gw.season_id,
    gw.id as gameweek_id,
    gw.number as gameweek_number,
    t.id as team_id,
    t.name as team_name,
    coalesce(sum(mr.played) filter (where mr.gameweek_number <= gw.number), 0)::integer as played,
    coalesce(sum(mr.wins) filter (where mr.gameweek_number <= gw.number), 0)::integer as wins,
    coalesce(sum(mr.draws) filter (where mr.gameweek_number <= gw.number), 0)::integer as draws,
    coalesce(sum(mr.losses) filter (where mr.gameweek_number <= gw.number), 0)::integer as losses,
    coalesce(sum(mr.goals_for) filter (where mr.gameweek_number <= gw.number), 0)::integer as goals_for,
    coalesce(sum(mr.goals_against) filter (where mr.gameweek_number <= gw.number), 0)::integer as goals_against,
    coalesce(sum(mr.points) filter (where mr.gameweek_number <= gw.number), 0)::integer as points
  from public.gameweeks gw
  cross join public.teams t
  left join match_rows mr
    on mr.season_id = gw.season_id
   and mr.team_id = t.id
   and mr.gameweek_number <= gw.number
  group by gw.season_id, gw.id, gw.number, t.id, t.name
)
select
  row_number() over (
    partition by season_id, gameweek_id
    order by points desc, (goals_for - goals_against) desc, goals_for desc, team_name asc
  )::integer as league_position,
  season_id,
  gameweek_id,
  gameweek_number,
  team_id,
  team_name,
  played,
  wins,
  draws,
  losses,
  goals_for,
  goals_against,
  (goals_for - goals_against)::integer as goal_difference,
  points
from cumulative;

create table public.card_definitions (
  id text primary key,
  name text not null unique,
  category text not null check (category in ('power', 'curse', 'super', 'game')),
  deck_type text not null check (deck_type in ('regular', 'premium', 'game')),
  effect_key text not null unique,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.card_deck_cards (
  deck_variant_id text not null references public.card_deck_variants(id) on delete cascade,
  card_id text not null references public.card_definitions(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (deck_variant_id, card_id)
);

create table public.league_cards (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  card_id text not null references public.card_definitions(id),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  zone text not null check (zone in ('regular_deck', 'premium_deck', 'game_deck', 'hand', 'active', 'discard', 'removed')),
  sort_order integer not null default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger league_cards_set_updated_at
before update on public.league_cards
for each row execute function public.set_updated_at();

create table public.active_card_effects (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  card_instance_id uuid references public.league_cards(id) on delete set null,
  card_id text not null references public.card_definitions(id),
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint references public.gameweeks(id) on delete cascade,
  start_gameweek_id bigint references public.gameweeks(id) on delete cascade,
  end_gameweek_id bigint references public.gameweeks(id) on delete cascade,
  fixture_id uuid references public.fixtures(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  deadline_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'vetoed', 'cancelled')),
  played_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (start_gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (end_gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  check (end_gameweek_id is null or start_gameweek_id is null or end_gameweek_id >= start_gameweek_id)
);

create or replace function public.enforce_card_play_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  target_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
begin
  select category, effect_key
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    return new;
  end if;

  if card_row.category = 'curse' then
    play_deadline := first_kickoff - interval '24 hours';
  else
    play_deadline := coalesce(
      public.star_man_lock_at_for_gameweek(new.season_id, target_gameweek_id),
      first_kickoff - interval '90 minutes'
    );
  end if;

  if now() >= play_deadline and not public.is_admin() then
    if card_row.category = 'curse' then
      raise exception 'Curse cards must be played at least 24 hours before the gameweek''s first KO time.';
    end if;
    raise exception 'Power and Super cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$$;

create trigger active_card_effects_enforce_card_play_deadline
before insert on public.active_card_effects
for each row execute function public.enforce_card_play_deadline();

create table public.card_effect_targets (
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_effect_id, target_user_id)
);

alter table public.predictions
  add constraint predictions_source_card_effect_fk
  foreign key (source_card_effect_id)
  references public.active_card_effects(id)
  on delete set null;

alter table public.star_man_picks
  add constraint star_man_picks_source_card_effect_fk
  foreign key (source_card_effect_id)
  references public.active_card_effects(id)
  on delete set null;

create table public.super_score_picks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (card_effect_id)
);

create trigger super_score_picks_set_updated_at
before update on public.super_score_picks
for each row execute function public.set_updated_at();

create table public.curse_random_roulette_inputs (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  roulette_number integer not null check (roulette_number between 1 and 36),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (card_effect_id)
);

create trigger curse_random_roulette_inputs_set_updated_at
before update on public.curse_random_roulette_inputs
for each row execute function public.set_updated_at();

create table public.curse_hated_forced_predictions (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  home_goals integer not null default 8 check (home_goals = 8),
  away_goals integer not null default 2 check (away_goals = 2),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  unique (card_effect_id)
);

create trigger curse_hated_forced_predictions_set_updated_at
before update on public.curse_hated_forced_predictions
for each row execute function public.set_updated_at();

create table public.curse_gambler_rolls (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  roll_number integer not null check (roll_number between 1 and 3),
  home_die_roll integer not null check (home_die_roll between 0 and 5),
  away_die_roll integer not null check (away_die_roll between 0 and 5),
  home_goals integer not null check (home_goals between 0 and 5),
  away_goals integer not null check (away_goals between 0 and 5),
  rolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  unique (card_effect_id, roll_number),
  unique (card_effect_id, fixture_id)
);

create or replace function public.set_curse_gambler_roll_goals()
returns trigger
language plpgsql
as $$
begin
  new.home_goals = new.home_die_roll;
  new.away_goals = new.away_die_roll;
  return new;
end;
$$;

create trigger curse_gambler_rolls_set_goals
before insert or update of home_die_roll, away_die_roll on public.curse_gambler_rolls
for each row execute function public.set_curse_gambler_roll_goals();

create trigger curse_gambler_rolls_set_updated_at
before update on public.curse_gambler_rolls
for each row execute function public.set_updated_at();

create table public.game_card_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  card_id text not null references public.card_definitions(id),
  round_number integer not null check (round_number between 1 and 7),
  start_gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  end_gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'complete', 'cancelled')),
  drawn_at timestamptz not null default now(),
  finalized_at timestamptz,
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  unique (competition_id, season_id, round_number),
  unique (competition_id, start_gameweek_id)
);

create table public.game_card_predictions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_card_rounds(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  predicted_value numeric(10, 2) not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, gameweek_id, user_id)
);

create trigger game_card_predictions_set_updated_at
before update on public.game_card_predictions
for each row execute function public.set_updated_at();

create table public.game_card_results (
  round_id uuid not null references public.game_card_rounds(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  actual_value numeric(10, 2) not null,
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (round_id, gameweek_id)
);

create trigger game_card_results_set_updated_at
before update on public.game_card_results
for each row execute function public.set_updated_at();

create table public.game_card_actual_results (
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  card_id text not null references public.card_definitions(id) on delete cascade,
  actual_value numeric(10, 2) not null,
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (season_id, gameweek_id, card_id)
);

create trigger game_card_actual_results_set_updated_at
before update on public.game_card_actual_results
for each row execute function public.set_updated_at();

create table public.game_card_round_tiebreaks (
  round_id uuid not null references public.game_card_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  uc_points_at_tiebreak integer not null default 0,
  random_tiebreak_rank integer not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id),
  unique (round_id, random_tiebreak_rank)
);

create table public.card_draw_tokens (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_type text not null
    check (token_type in ('regular_medal', 'super_medal')),
  deck_type text not null
    check (deck_type in ('regular', 'premium')),
  source_type text not null
    check (source_type in ('accolade', 'game_card', 'card_effect', 'admin_adjustment')),
  source_game_card_round_id uuid references public.game_card_rounds(id) on delete set null,
  source_card_effect_id uuid references public.active_card_effects(id) on delete set null,
  source_key text,
  auto_redeem_required boolean not null default false,
  status text not null default 'available'
    check (status in ('available', 'reserved', 'redeemed', 'void')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  check (
    (token_type = 'regular_medal' and deck_type = 'regular')
    or (token_type = 'super_medal' and deck_type = 'premium')
  )
);

create table public.card_draw_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_id uuid references public.card_draw_tokens(id) on delete set null,
  card_instance_id uuid references public.league_cards(id) on delete set null,
  card_id text references public.card_definitions(id),
  deck_type text not null check (deck_type in ('regular', 'premium', 'game')),
  source_card_effect_id uuid references public.active_card_effects(id) on delete set null,
  drawn_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade
);

-- Helpful indexes for the live pages.
create index fixtures_gameweek_idx on public.fixtures(gameweek_id, kickoff_at);
create index predictions_user_idx on public.predictions(user_id);
create index predictions_competition_idx on public.predictions(competition_id, user_id);
create index predictions_fixture_idx on public.predictions(fixture_id);
create index star_man_picks_user_idx on public.star_man_picks(user_id);
create index star_man_picks_competition_idx on public.star_man_picks(competition_id, gameweek_id);
create index player_team_assignments_player_idx on public.player_team_assignments(season_id, player_id, starts_gameweek_id, ends_gameweek_id);
create index player_fixture_stats_player_idx on public.player_fixture_stats(player_id, fixture_id);
create index player_fixture_stats_gameweek_idx on public.player_fixture_stats(season_id, gameweek_id, player_id);
create index league_cards_competition_idx on public.league_cards(competition_id, owner_user_id, zone);
create index active_card_effects_competition_idx on public.active_card_effects(competition_id, gameweek_id, status);
create index card_effect_targets_user_idx on public.card_effect_targets(target_user_id);
create index super_score_picks_competition_idx on public.super_score_picks(competition_id, gameweek_id, user_id);
create index curse_random_roulette_inputs_competition_idx on public.curse_random_roulette_inputs(competition_id, gameweek_id, target_user_id);
create index curse_hated_forced_predictions_competition_idx on public.curse_hated_forced_predictions(competition_id, gameweek_id, target_user_id);
create index curse_gambler_rolls_competition_idx on public.curse_gambler_rolls(competition_id, gameweek_id, target_user_id);
create index game_card_rounds_competition_idx on public.game_card_rounds(competition_id, season_id, round_number);
create index game_card_predictions_round_idx on public.game_card_predictions(round_id, gameweek_id, user_id);
create index game_card_round_tiebreaks_user_idx on public.game_card_round_tiebreaks(user_id);
create index card_draw_tokens_user_idx on public.card_draw_tokens(competition_id, user_id, token_type, status);
create unique index card_draw_tokens_unique_source_key
on public.card_draw_tokens(competition_id, user_id, token_type, source_key)
where source_key is not null;
create index card_draw_events_user_idx on public.card_draw_events(competition_id, user_id, drawn_at);

-- Scoring views.

create or replace view public.prediction_score_details
with (security_invoker = true)
as
with all_prediction_rows as (
  select
    p.id as prediction_id,
    p.competition_id,
    p.user_id,
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    p.fixture_id,
    p.prediction_slot,
    p.home_goals as predicted_home_goals,
    p.away_goals as predicted_away_goals,
    p.source_card_effect_id
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  join public.gameweeks gw on gw.id = f.gameweek_id

  union all

  select
    chfp.id as prediction_id,
    chfp.competition_id,
    chfp.target_user_id as user_id,
    chfp.season_id,
    chfp.gameweek_id,
    gw.number as gameweek_number,
    chfp.fixture_id,
    'curse_hated'::text as prediction_slot,
    chfp.home_goals as predicted_home_goals,
    chfp.away_goals as predicted_away_goals,
    chfp.card_effect_id as source_card_effect_id
  from public.curse_hated_forced_predictions chfp
  join public.gameweeks gw on gw.id = chfp.gameweek_id

  union all

  select
    cgr.id as prediction_id,
    cgr.competition_id,
    cgr.target_user_id as user_id,
    cgr.season_id,
    cgr.gameweek_id,
    gw.number as gameweek_number,
    cgr.fixture_id,
    'curse_gambler'::text as prediction_slot,
    cgr.home_goals as predicted_home_goals,
    cgr.away_goals as predicted_away_goals,
    cgr.card_effect_id as source_card_effect_id
  from public.curse_gambler_rolls cgr
  join public.gameweeks gw on gw.id = cgr.gameweek_id
)
select
  apr.prediction_id,
  apr.competition_id,
  apr.user_id,
  apr.season_id,
  apr.gameweek_id,
  apr.gameweek_number,
  apr.fixture_id,
  apr.prediction_slot,
  apr.predicted_home_goals,
  apr.predicted_away_goals,
  mr.home_goals as actual_home_goals,
  mr.away_goals as actual_away_goals,
  (apr.predicted_home_goals = mr.home_goals and apr.predicted_away_goals = mr.away_goals) as is_correct_score,
  (sign(apr.predicted_home_goals - apr.predicted_away_goals) = sign(mr.home_goals - mr.away_goals)) as is_correct_result,
  case
    when mr.fixture_id is null then 0
    when apr.predicted_home_goals = mr.home_goals and apr.predicted_away_goals = mr.away_goals then 3
    when sign(apr.predicted_home_goals - apr.predicted_away_goals) = sign(mr.home_goals - mr.away_goals) then 1
    else 0
  end as points,
  apr.source_card_effect_id
from all_prediction_rows apr
left join public.match_results mr on mr.fixture_id = apr.fixture_id;

create or replace view public.prediction_fixture_scores
with (security_invoker = true)
as
with prediction_modes as (
  select
    psd.*,
    bool_or(prediction_slot in ('curse_hated', 'curse_gambler'))
      over (partition by competition_id, user_id, fixture_id) as has_curse_override,
    bool_or(prediction_slot = 'power_of_god')
      over (partition by competition_id, user_id, fixture_id) as has_power_of_god_override
  from public.prediction_score_details psd
),
considered_predictions as (
  select *
  from prediction_modes
  where
    (
      has_curse_override
      and prediction_slot in ('curse_hated', 'curse_gambler')
    )
    or (
      not has_curse_override
      and has_power_of_god_override
      and prediction_slot = 'power_of_god'
    )
    or (
      not has_curse_override
      and not has_power_of_god_override
      and prediction_slot in ('primary', 'hedge')
    )
)
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  fixture_id,
  bool_or(is_correct_score) as is_correct_score,
  bool_or(is_correct_result) as is_correct_result,
  max(points) as points
from considered_predictions
group by competition_id, user_id, season_id, gameweek_id, gameweek_number, fixture_id;

create or replace view public.prediction_totals
with (security_invoker = true)
as
select
  competition_id,
  user_id,
  season_id,
  count(*) filter (where is_correct_score) as correct_scores,
  count(*) filter (where is_correct_result) as correct_results,
  sum(points) as prediction_points
from public.prediction_fixture_scores
group by competition_id, user_id, season_id;

create or replace view public.prediction_points_by_user_gameweek
with (security_invoker = true)
as
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  count(*) filter (where is_correct_score) as correct_scores,
  count(*) filter (where is_correct_result) as correct_results,
  sum(points) as prediction_points
from public.prediction_fixture_scores
group by competition_id, user_id, season_id, gameweek_id, gameweek_number;

create or replace view public.gameweek_deadlines
with (security_invoker = true)
as
select
  gw.id as gameweek_id,
  gw.season_id,
  gw.number as gameweek_number,
  min(f.kickoff_at) filter (where f.status <> 'postponed') as first_fixture_kickoff_at,
  public.star_man_lock_at_for_gameweek(gw.season_id, gw.id) as star_man_locks_at
from public.gameweeks gw
left join public.fixtures f
  on f.season_id = gw.season_id
  and f.gameweek_id = gw.id
group by gw.id, gw.season_id, gw.number;

create or replace view public.player_gameweek_stat_totals
with (security_invoker = true)
as
select
  season_id,
  gameweek_id,
  player_id,
  sum(goals)::integer as goals,
  sum(assists)::integer as assists,
  sum(outside_box_goals)::integer as outside_box_goals,
  sum(outside_box_assists)::integer as outside_box_assists,
  sum(yellow_cards)::integer as yellow_cards,
  sum(red_cards)::integer as red_cards,
  bool_or(started) as started,
  bool_or(was_benched) as was_benched,
  sum(coalesce(minutes_played, 0))::integer as minutes_played,
  bool_or(was_substituted) as was_substituted
from public.player_fixture_stats
group by season_id, gameweek_id, player_id;

create or replace view public.star_man_score_details
with (security_invoker = true)
as
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
  (
    coalesce(pgs.goals, 0) * 3
    + coalesce(pgs.assists, 0)
    - coalesce(pgs.yellow_cards, 0)
    - (coalesce(pgs.red_cards, 0) * 3)
  ) as points
from public.star_man_picks smp
join public.gameweeks gw on gw.id = smp.gameweek_id
left join public.player_gameweek_stat_totals pgs
  on pgs.season_id = smp.season_id
  and pgs.gameweek_id = smp.gameweek_id
  and pgs.player_id = smp.player_id;

create or replace view public.star_man_totals
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  user_id,
  sum(goals) as star_man_goals,
  sum(assists) as star_man_assists,
  sum(yellow_cards) as star_man_yellows,
  sum(red_cards) as star_man_reds,
  sum(points) as star_man_points
from public.star_man_score_details
group by competition_id, season_id, user_id;

create or replace view public.star_man_points_by_user_gameweek
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  gameweek_id,
  gameweek_number,
  user_id,
  sum(goals) as star_man_goals,
  sum(assists) as star_man_assists,
  sum(yellow_cards) as star_man_yellows,
  sum(red_cards) as star_man_reds,
  sum(points) as star_man_points
from public.star_man_score_details
group by competition_id, season_id, gameweek_id, gameweek_number, user_id;

create or replace view public.game_card_week_scores
with (security_invoker = true)
as
with scored as (
  select
    gcr.id as round_id,
    gcr.competition_id,
    gcr.season_id,
    gcr.card_id,
    gcr.round_number,
    gcp.gameweek_id,
    gw.number as gameweek_number,
    gcp.user_id,
    gcp.predicted_value,
    coalesce(gcrs.actual_value, gcar.actual_value) as actual_value,
    abs(gcp.predicted_value - coalesce(gcrs.actual_value, gcar.actual_value)) as difference
  from public.game_card_predictions gcp
  join public.game_card_rounds gcr on gcr.id = gcp.round_id
  join public.gameweeks gw on gw.id = gcp.gameweek_id
  left join public.game_card_results gcrs
    on gcrs.round_id = gcp.round_id
    and gcrs.gameweek_id = gcp.gameweek_id
  left join public.game_card_actual_results gcar
    on gcar.season_id = gcr.season_id
    and gcar.gameweek_id = gcp.gameweek_id
    and gcar.card_id = gcr.card_id
  where coalesce(gcrs.actual_value, gcar.actual_value) is not null
)
select
  scored.*,
  scored.difference = min(scored.difference) over (partition by round_id, gameweek_id) as is_weekly_winner
from scored;

create or replace view public.game_card_round_standings
with (security_invoker = true)
as
with standings as (
  select
    round_id,
    competition_id,
    season_id,
    card_id,
    round_number,
    user_id,
    count(distinct gameweek_id) as completed_gameweeks,
    count(*) filter (where is_weekly_winner) as weekly_wins,
    sum(difference) as total_difference
  from public.game_card_week_scores
  group by round_id, competition_id, season_id, card_id, round_number, user_id
),
ranked as (
  select
    standings.*,
    coalesce(gcrt.uc_points_at_tiebreak, 0) as uc_points_at_tiebreak,
    coalesce(gcrt.random_tiebreak_rank, 999999) as random_tiebreak_rank,
    row_number() over (
      partition by standings.round_id
      order by
        standings.total_difference asc,
        coalesce(gcrt.uc_points_at_tiebreak, 0) asc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc,
        standings.user_id asc
    ) as round_rank
  from standings
  left join public.game_card_round_tiebreaks gcrt
    on gcrt.round_id = standings.round_id
    and gcrt.user_id = standings.user_id
)
select
  ranked.*,
  ranked.round_rank = 1 as earns_super_medal
from ranked;

create or replace view public.game_card_bonus_totals
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  user_id,
  count(*)::integer as game_card_bonus_points
from public.game_card_round_standings
where earns_super_medal = true
  and completed_gameweeks >= 5
group by competition_id, season_id, user_id;

create or replace view public.super_score_bonus_details
with (security_invoker = true)
as
select
  ssp.id as super_score_pick_id,
  ssp.competition_id,
  ssp.season_id,
  ssp.gameweek_id,
  gw.number as gameweek_number,
  ssp.user_id,
  ssp.home_goals as selected_home_goals,
  ssp.away_goals as selected_away_goals,
  count(mr.fixture_id)::integer as matching_scorelines,
  (count(mr.fixture_id) * 3)::integer as super_score_points
from public.super_score_picks ssp
join public.gameweeks gw on gw.id = ssp.gameweek_id
left join public.fixtures f
  on f.season_id = ssp.season_id
  and f.gameweek_id = ssp.gameweek_id
left join public.match_results mr
  on mr.fixture_id = f.id
  and mr.home_goals = ssp.home_goals
  and mr.away_goals = ssp.away_goals
group by
  ssp.id,
  ssp.competition_id,
  ssp.season_id,
  ssp.gameweek_id,
  gw.number,
  ssp.user_id,
  ssp.home_goals,
  ssp.away_goals;

create or replace view public.super_score_bonus_totals
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  user_id,
  sum(super_score_points)::integer as super_score_points
from public.super_score_bonus_details
group by competition_id, season_id, user_id;

create or replace view public.super_score_points_by_user_gameweek
with (security_invoker = true)
as
select
  competition_id,
  season_id,
  gameweek_id,
  gameweek_number,
  user_id,
  sum(matching_scorelines)::integer as matching_scorelines,
  sum(super_score_points)::integer as super_score_points
from public.super_score_bonus_details
group by competition_id, season_id, gameweek_id, gameweek_number, user_id;

create or replace view public.leaderboard
with (security_invoker = true)
as
select
  cm.competition_id,
  c.name as competition_name,
  c.season_id,
  cm.user_id,
  pr.display_name,
  coalesce(pt.prediction_points, 0) as prediction_points,
  coalesce(smt.star_man_points, 0) as star_man_points,
  coalesce(gcb.game_card_bonus_points, 0) as game_card_bonus_points,
  coalesce(ssb.super_score_points, 0) as super_score_points,
  coalesce(pt.prediction_points, 0) + coalesce(smt.star_man_points, 0) + coalesce(gcb.game_card_bonus_points, 0) + coalesce(ssb.super_score_points, 0) as ultimate_champion_points,
  coalesce(pt.correct_scores, 0) as correct_scores,
  coalesce(pt.correct_results, 0) as correct_results,
  coalesce(smt.star_man_goals, 0) as star_man_goals,
  coalesce(smt.star_man_assists, 0) as star_man_assists,
  coalesce(smt.star_man_yellows, 0) as star_man_yellows,
  coalesce(smt.star_man_reds, 0) as star_man_reds
from public.competition_members cm
join public.competitions c on c.id = cm.competition_id
join public.profiles pr on pr.id = cm.user_id
left join public.prediction_totals pt
  on pt.user_id = cm.user_id
  and pt.competition_id = cm.competition_id
  and pt.season_id = c.season_id
left join public.star_man_totals smt
  on smt.user_id = cm.user_id
  and smt.competition_id = cm.competition_id
  and smt.season_id = c.season_id
left join public.game_card_bonus_totals gcb
  on gcb.user_id = cm.user_id
  and gcb.competition_id = cm.competition_id
  and gcb.season_id = c.season_id
left join public.super_score_bonus_totals ssb
  on ssb.user_id = cm.user_id
  and ssb.competition_id = cm.competition_id
  and ssb.season_id = c.season_id;

create or replace view public.correct_scores
with (security_invoker = true)
as
select
  psd.competition_id,
  psd.season_id,
  psd.gameweek_id,
  psd.gameweek_number,
  psd.fixture_id,
  psd.user_id,
  pr.display_name,
  ht.name as home_team,
  at.name as away_team,
  psd.predicted_home_goals,
  psd.predicted_away_goals,
  psd.actual_home_goals,
  psd.actual_away_goals
from public.prediction_score_details psd
join public.profiles pr on pr.id = psd.user_id
join public.fixtures f on f.id = psd.fixture_id
join public.teams ht on ht.id = f.home_team_id
join public.teams at on at.id = f.away_team_id
where psd.is_correct_score = true;

create or replace view public.user_gameweek_stats
with (security_invoker = true)
as
select
  cm.competition_id,
  c.season_id,
  gw.id as gameweek_id,
  gw.number as gameweek_number,
  cm.user_id,
  pr.display_name,
  coalesce(pp.prediction_points, 0) as prediction_points,
  coalesce(sp.star_man_points, 0) as star_man_points,
  coalesce(gb.game_card_bonus_points, 0) as game_card_bonus_points,
  coalesce(ss.super_score_points, 0) as super_score_points,
  coalesce(pp.prediction_points, 0) + coalesce(sp.star_man_points, 0) + coalesce(gb.game_card_bonus_points, 0) + coalesce(ss.super_score_points, 0) as ultimate_champion_points,
  coalesce(pp.correct_scores, 0) as correct_scores,
  coalesce(pp.correct_results, 0) as correct_results,
  coalesce(sp.star_man_goals, 0) as star_man_goals,
  coalesce(sp.star_man_assists, 0) as star_man_assists,
  coalesce(sp.star_man_yellows, 0) as star_man_yellows,
  coalesce(sp.star_man_reds, 0) as star_man_reds
from public.competition_members cm
join public.competitions c on c.id = cm.competition_id
join public.gameweeks gw on gw.season_id = c.season_id
join public.profiles pr on pr.id = cm.user_id
left join public.prediction_points_by_user_gameweek pp
  on pp.user_id = cm.user_id
  and pp.competition_id = cm.competition_id
  and pp.season_id = c.season_id
  and pp.gameweek_id = gw.id
left join public.star_man_points_by_user_gameweek sp
  on sp.user_id = cm.user_id
  and sp.competition_id = cm.competition_id
  and sp.season_id = c.season_id
  and sp.gameweek_id = gw.id
left join (
  select
    gcr.competition_id,
    gcr.season_id,
    gcr.end_gameweek_id as gameweek_id,
    gcs.user_id,
    count(*)::integer as game_card_bonus_points
  from public.game_card_round_standings gcs
  join public.game_card_rounds gcr on gcr.id = gcs.round_id
  where gcs.earns_super_medal = true
    and gcs.completed_gameweeks >= 5
  group by gcr.competition_id, gcr.season_id, gcr.end_gameweek_id, gcs.user_id
) gb
  on gb.user_id = cm.user_id
  and gb.competition_id = cm.competition_id
  and gb.season_id = c.season_id
  and gb.gameweek_id = gw.id
left join public.super_score_points_by_user_gameweek ss
  on ss.user_id = cm.user_id
  and ss.competition_id = cm.competition_id
  and ss.season_id = c.season_id
  and ss.gameweek_id = gw.id;

create or replace function public.can_submit_star_man_pick(
  target_competition_id uuid,
  target_season_id uuid,
  target_gameweek_id bigint,
  target_user_id uuid,
  target_player_id uuid,
  target_pick_slot text,
  target_source_card_effect_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_user_id = auth.uid()
    and public.is_competition_member(target_competition_id)
    and exists (
      select 1
      from public.gameweeks gw
      where gw.id = target_gameweek_id
        and gw.season_id = target_season_id
        and (
          (
            target_pick_slot = 'primary'
            and (
              now() < public.star_man_lock_at_for_gameweek(target_season_id, target_gameweek_id)
              or exists (
                select 1
                from public.active_card_effects ace
                join public.card_definitions cd on cd.id = ace.card_id
                join public.players p on p.id = target_player_id
                join public.fixtures f
                  on f.season_id = target_season_id
                  and f.gameweek_id = target_gameweek_id
                where ace.id = target_source_card_effect_id
                  and ace.competition_id = target_competition_id
                  and ace.played_by_user_id = target_user_id
                  and ace.status = 'active'
                  and cd.effect_key = 'power_late_scout'
                  and (ace.fixture_id is null or ace.fixture_id = f.id)
                  and (
                    p.team_id in (f.home_team_id, f.away_team_id)
                    or exists (
                      select 1
                      from public.player_team_assignments pta
                      where pta.player_id = target_player_id
                        and pta.season_id = target_season_id
                        and pta.team_id in (f.home_team_id, f.away_team_id)
                        and pta.starts_gameweek_id <= target_gameweek_id
                        and (pta.ends_gameweek_id is null or pta.ends_gameweek_id >= target_gameweek_id)
                    )
                  )
                  and now() < f.kickoff_at
              )
            )
          )
          or (
            target_pick_slot = 'super_duo'
            and now() < public.star_man_lock_at_for_gameweek(target_season_id, target_gameweek_id)
            and exists (
              select 1
              from public.active_card_effects ace
              join public.card_definitions cd on cd.id = ace.card_id
              where ace.id = target_source_card_effect_id
                and ace.competition_id = target_competition_id
                and ace.played_by_user_id = target_user_id
                and ace.status = 'active'
                and cd.effect_key = 'super_duo'
                and (ace.start_gameweek_id is null or ace.start_gameweek_id <= target_gameweek_id)
                and (ace.end_gameweek_id is null or ace.end_gameweek_id >= target_gameweek_id)
            )
          )
        )
    );
$$;

-- Row Level Security.

alter table public.profiles enable row level security;
alter table public.profile_nationalities enable row level security;
alter table public.admins enable row level security;
alter table public.seasons enable row level security;
alter table public.profile_username_changes enable row level security;
alter table public.teams enable row level security;
alter table public.gameweeks enable row level security;
alter table public.fixtures enable row level security;
alter table public.fixture_schedule_changes enable row level security;
alter table public.players enable row level security;
alter table public.player_team_assignments enable row level security;
alter table public.card_deck_variants enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
alter table public.predictions enable row level security;
alter table public.match_results enable row level security;
alter table public.fixture_game_stats enable row level security;
alter table public.player_fixture_stats enable row level security;
alter table public.star_man_picks enable row level security;
alter table public.player_gameweek_stats enable row level security;
alter table public.team_gameweek_standings enable row level security;
alter table public.card_definitions enable row level security;
alter table public.card_deck_cards enable row level security;
alter table public.league_cards enable row level security;
alter table public.active_card_effects enable row level security;
alter table public.card_effect_targets enable row level security;
alter table public.super_score_picks enable row level security;
alter table public.curse_random_roulette_inputs enable row level security;
alter table public.curse_hated_forced_predictions enable row level security;
alter table public.curse_gambler_rolls enable row level security;
alter table public.game_card_rounds enable row level security;
alter table public.game_card_predictions enable row level security;
alter table public.game_card_results enable row level security;
alter table public.game_card_actual_results enable row level security;
alter table public.game_card_round_tiebreaks enable row level security;
alter table public.card_draw_tokens enable row level security;
alter table public.card_draw_events enable row level security;

create policy "profiles are readable to self admins or shared leagues"
on public.profiles for select
to authenticated
using (
  auth.uid() = id
  or public.is_admin()
  or exists (
    select 1
    from public.competition_members mine
    join public.competition_members theirs
      on theirs.competition_id = mine.competition_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy "users can insert their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profile username changes visible to owner admins"
on public.profile_username_changes for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "admins manage profile username changes"
on public.profile_username_changes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profile nationalities are readable"
on public.profile_nationalities for select
to anon, authenticated
using (true);

create policy "reference seasons are readable"
on public.seasons for select
to authenticated
using (true);

create policy "admins manage seasons"
on public.seasons for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reference teams are readable"
on public.teams for select
to anon, authenticated
using (true);

create policy "admins manage teams"
on public.teams for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reference gameweeks are readable"
on public.gameweeks for select
to authenticated
using (true);

create policy "admins manage gameweeks"
on public.gameweeks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "fixtures are readable"
on public.fixtures for select
to authenticated
using (true);

create policy "admins manage fixtures"
on public.fixtures for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "fixture schedule changes are readable"
on public.fixture_schedule_changes for select
to authenticated
using (true);

create policy "admins manage fixture schedule changes"
on public.fixture_schedule_changes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "players are readable"
on public.players for select
to authenticated
using (true);

create policy "admins manage players"
on public.players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "player team assignments are readable"
on public.player_team_assignments for select
to authenticated
using (true);

create policy "admins manage player team assignments"
on public.player_team_assignments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competitions are readable to public or members"
on public.competitions for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(id)
);

create policy "users can create competitions"
on public.competitions for insert
to authenticated
with check (owner_id = auth.uid());

create policy "league owners and admins update competitions"
on public.competitions for update
to authenticated
using (public.can_manage_competition(id))
with check (public.can_manage_competition(id));

create policy "league owners and admins delete competitions"
on public.competitions for delete
to authenticated
using (public.can_manage_competition(id));

create policy "global admins manage competitions"
on public.competitions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competition members are readable to league members"
on public.competition_members for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "league owners and admins add members"
on public.competition_members for insert
to authenticated
with check (public.can_manage_competition(competition_id));

create policy "league owners and admins update members"
on public.competition_members for update
to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

create policy "league owners and admins remove members"
on public.competition_members for delete
to authenticated
using (public.can_manage_competition(competition_id));

create policy "global admins manage competition members"
on public.competition_members for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "predictions visible to owner admin or after lock"
on public.predictions for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or (
    public.is_competition_member(competition_id)
    and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and now() >= f.prediction_locks_at
    )
  )
);

create policy "users insert own predictions before fixture lock"
on public.predictions for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
);

create policy "users update own predictions before fixture lock"
on public.predictions for update
to authenticated
using (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
)
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
);

create policy "users delete own predictions before fixture lock"
on public.predictions for delete
to authenticated
using (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and now() < f.prediction_locks_at
  )
);

create policy "match results are readable"
on public.match_results for select
to authenticated
using (true);

create policy "admins manage match results"
on public.match_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "star man picks visible to owner admin or after gameweek lock"
on public.star_man_picks for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or (
    public.is_competition_member(competition_id)
    and exists (
    select 1
    from public.gameweeks gw
    where gw.id = star_man_picks.gameweek_id
      and now() >= public.star_man_lock_at_for_gameweek(star_man_picks.season_id, star_man_picks.gameweek_id)
    )
  )
);

create policy "users insert own star man pick before gameweek lock"
on public.star_man_picks for insert
to authenticated
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

create policy "users update own star man pick before gameweek lock"
on public.star_man_picks for update
to authenticated
using (
  public.can_submit_star_man_pick(
    competition_id,
    season_id,
    gameweek_id,
    user_id,
    player_id,
    pick_slot,
    source_card_effect_id
  )
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

create policy "users delete own star man pick before gameweek lock"
on public.star_man_picks for delete
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = star_man_picks.gameweek_id
      and now() < public.star_man_lock_at_for_gameweek(star_man_picks.season_id, star_man_picks.gameweek_id)
  )
);

create policy "player gameweek stats are readable"
on public.player_gameweek_stats for select
to authenticated
using (true);

create policy "admins manage player gameweek stats"
on public.player_gameweek_stats for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "player fixture stats are readable"
on public.player_fixture_stats for select
to authenticated
using (true);

create policy "admins manage player fixture stats"
on public.player_fixture_stats for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "fixture game stats are readable"
on public.fixture_game_stats for select
to authenticated
using (true);

create policy "admins manage fixture game stats"
on public.fixture_game_stats for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "team gameweek standings are readable"
on public.team_gameweek_standings for select
to authenticated
using (true);

create policy "admins manage team gameweek standings"
on public.team_gameweek_standings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card deck variants are readable"
on public.card_deck_variants for select
to authenticated
using (true);

create policy "admins manage card deck variants"
on public.card_deck_variants for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card definitions are readable"
on public.card_definitions for select
to authenticated
using (true);

create policy "admins manage card definitions"
on public.card_definitions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card deck cards are readable"
on public.card_deck_cards for select
to authenticated
using (true);

create policy "admins manage card deck cards"
on public.card_deck_cards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "league cards visible to league members"
on public.league_cards for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "league managers manage league cards"
on public.league_cards for all
to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

create policy "active card effects visible to league members"
on public.active_card_effects for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "league members can play their own cards"
on public.active_card_effects for insert
to authenticated
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
);

create policy "admins and league managers update card effects"
on public.active_card_effects for update
to authenticated
using (
  public.is_admin()
  or public.can_manage_competition(competition_id)
  or played_by_user_id = auth.uid()
)
with check (
  public.is_admin()
  or public.can_manage_competition(competition_id)
  or played_by_user_id = auth.uid()
);

create policy "card effect targets visible to league members"
on public.card_effect_targets for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.active_card_effects ace
    where ace.id = card_effect_targets.card_effect_id
      and public.is_competition_member(ace.competition_id)
  )
);

create policy "card players can create their chosen targets"
on public.card_effect_targets for insert
to authenticated
with check (
  exists (
    select 1
    from public.active_card_effects ace
    where ace.id = card_effect_targets.card_effect_id
      and ace.played_by_user_id = auth.uid()
      and public.is_competition_member(ace.competition_id)
  )
);

create policy "super score picks visible to owner admin or after gameweek lock"
on public.super_score_picks for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or (
    public.is_competition_member(competition_id)
    and exists (
      select 1
      from public.gameweeks gw
      where gw.id = super_score_picks.gameweek_id
        and now() >= public.star_man_lock_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
    )
  )
);

create policy "users insert own super score pick before gameweek lock"
on public.super_score_picks for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and gw.season_id = super_score_picks.season_id
      and now() < public.star_man_lock_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = super_score_picks.card_effect_id
      and ace.competition_id = super_score_picks.competition_id
      and ace.played_by_user_id = super_score_picks.user_id
      and cd.effect_key = 'super_score'
  )
);

create policy "users update own super score pick before gameweek lock"
on public.super_score_picks for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and now() < public.star_man_lock_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
)
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and gw.season_id = super_score_picks.season_id
      and now() < public.star_man_lock_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = super_score_picks.card_effect_id
      and ace.competition_id = super_score_picks.competition_id
      and ace.played_by_user_id = super_score_picks.user_id
      and cd.effect_key = 'super_score'
  )
);

create policy "curse random roulette inputs visible to league members"
on public.curse_random_roulette_inputs for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "card player manages random roulette input before gameweek lock"
on public.curse_random_roulette_inputs for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_random_roulette_inputs.card_effect_id
      and ace.competition_id = curse_random_roulette_inputs.competition_id
      and ace.played_by_user_id = curse_random_roulette_inputs.played_by_user_id
      and ace.target_user_id = curse_random_roulette_inputs.target_user_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_random_roulette'
  )
);

create policy "admins manage curse random roulette inputs"
on public.curse_random_roulette_inputs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "curse hated forced predictions visible to league members"
on public.curse_hated_forced_predictions for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "card player manages hated forced prediction before gameweek lock"
on public.curse_hated_forced_predictions for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_hated_forced_predictions.card_effect_id
      and ace.competition_id = curse_hated_forced_predictions.competition_id
      and ace.played_by_user_id = curse_hated_forced_predictions.played_by_user_id
      and ace.target_user_id = curse_hated_forced_predictions.target_user_id
      and ace.fixture_id = curse_hated_forced_predictions.fixture_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_hated'
  )
);

create policy "admins manage curse hated forced predictions"
on public.curse_hated_forced_predictions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "curse gambler rolls visible to league members"
on public.curse_gambler_rolls for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "card player manages gambler rolls before gameweek lock"
on public.curse_gambler_rolls for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_gambler_rolls.card_effect_id
      and ace.competition_id = curse_gambler_rolls.competition_id
      and ace.played_by_user_id = curse_gambler_rolls.played_by_user_id
      and ace.target_user_id = curse_gambler_rolls.target_user_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_gambler'
  )
);

create policy "admins manage curse gambler rolls"
on public.curse_gambler_rolls for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "game card rounds visible to league members"
on public.game_card_rounds for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "league managers manage game card rounds"
on public.game_card_rounds for all
to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

create policy "game card predictions visible to owner admin or locked league members"
on public.game_card_predictions for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or exists (
    select 1
    from public.game_card_rounds gcr
    join public.gameweeks gw on gw.id = game_card_predictions.gameweek_id
    where gcr.id = game_card_predictions.round_id
      and public.is_competition_member(gcr.competition_id)
      and now() >= public.star_man_lock_at_for_gameweek(gcr.season_id, game_card_predictions.gameweek_id)
  )
);

create policy "users insert own game card predictions before gameweek lock"
on public.game_card_predictions for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_card_rounds gcr
    join public.gameweeks gw on gw.id = game_card_predictions.gameweek_id
    where gcr.id = game_card_predictions.round_id
      and public.is_competition_member(gcr.competition_id)
      and now() < public.star_man_lock_at_for_gameweek(gcr.season_id, game_card_predictions.gameweek_id)
  )
);

create policy "users update own game card predictions before gameweek lock"
on public.game_card_predictions for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_card_rounds gcr
    join public.gameweeks gw on gw.id = game_card_predictions.gameweek_id
    where gcr.id = game_card_predictions.round_id
      and public.is_competition_member(gcr.competition_id)
      and now() < public.star_man_lock_at_for_gameweek(gcr.season_id, game_card_predictions.gameweek_id)
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_card_rounds gcr
    join public.gameweeks gw on gw.id = game_card_predictions.gameweek_id
    where gcr.id = game_card_predictions.round_id
      and public.is_competition_member(gcr.competition_id)
      and now() < public.star_man_lock_at_for_gameweek(gcr.season_id, game_card_predictions.gameweek_id)
  )
);

create policy "game card results visible to league members"
on public.game_card_results for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.game_card_rounds gcr
    where gcr.id = game_card_results.round_id
      and public.is_competition_member(gcr.competition_id)
  )
);

create policy "admins manage game card results"
on public.game_card_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "game card actual results visible to authenticated users"
on public.game_card_actual_results for select
to authenticated
using (true);

create policy "admins manage game card actual results"
on public.game_card_actual_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "game card tiebreaks visible to league members"
on public.game_card_round_tiebreaks for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.game_card_rounds gcr
    where gcr.id = game_card_round_tiebreaks.round_id
      and public.is_competition_member(gcr.competition_id)
  )
);

create policy "admins manage game card tiebreaks"
on public.game_card_round_tiebreaks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card draw tokens visible to league members"
on public.card_draw_tokens for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "admins manage card draw tokens"
on public.card_draw_tokens for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card draw events visible to league members"
on public.card_draw_events for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

create policy "admins and league managers manage card draw events"
on public.card_draw_events for all
to authenticated
using (public.can_manage_competition(competition_id))
with check (public.can_manage_competition(competition_id));

-- API grants. RLS policies above still control which rows each role can access.

grant usage on schema public to anon, authenticated;

grant select on
  public.profiles,
  public.profile_nationalities,
  public.profile_username_changes,
  public.seasons,
  public.teams,
  public.gameweeks,
  public.fixtures,
  public.fixture_schedule_changes,
  public.players,
  public.player_team_assignments,
  public.card_deck_variants,
  public.competitions,
  public.competition_members,
  public.predictions,
  public.match_results,
  public.fixture_game_stats,
  public.player_fixture_stats,
  public.star_man_picks,
  public.player_gameweek_stats,
  public.team_gameweek_standings,
  public.team_gameweek_computed_standings,
  public.card_definitions,
  public.card_deck_cards,
  public.league_cards,
  public.active_card_effects,
  public.card_effect_targets,
  public.super_score_picks,
  public.curse_random_roulette_inputs,
  public.curse_hated_forced_predictions,
  public.curse_gambler_rolls,
  public.game_card_rounds,
  public.game_card_predictions,
  public.game_card_results,
  public.game_card_actual_results,
  public.game_card_round_tiebreaks,
  public.card_draw_tokens,
  public.card_draw_events,
  public.prediction_score_details,
  public.prediction_fixture_scores,
  public.prediction_totals,
  public.prediction_points_by_user_gameweek,
  public.gameweek_deadlines,
  public.player_gameweek_stat_totals,
  public.star_man_score_details,
  public.star_man_totals,
  public.star_man_points_by_user_gameweek,
  public.game_card_week_scores,
  public.game_card_round_standings,
  public.game_card_bonus_totals,
  public.super_score_bonus_details,
  public.super_score_bonus_totals,
  public.super_score_points_by_user_gameweek,
  public.leaderboard,
  public.correct_scores,
  public.user_gameweek_stats
to authenticated;

grant select on public.teams to anon;
grant select on public.profile_nationalities to anon;
grant insert on public.profiles to authenticated;
grant insert, update, delete on public.predictions to authenticated;
grant insert, update, delete on public.star_man_picks to authenticated;
grant insert, update on public.super_score_picks to authenticated;
grant insert, update, delete on public.curse_random_roulette_inputs to authenticated;
grant insert, update, delete on public.curse_hated_forced_predictions to authenticated;
grant insert, update, delete on public.curse_gambler_rolls to authenticated;
grant insert, update on public.game_card_predictions to authenticated;
grant insert, update on public.active_card_effects to authenticated;
grant insert on public.card_effect_targets to authenticated;
grant execute on function public.join_competition_by_code(text) to authenticated;
grant execute on function public.leave_competition_before_start(uuid) to authenticated;
grant execute on function public.finalize_competition_start(uuid) to authenticated;
grant execute on function public.sync_competition_member_lock(uuid) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.star_man_lock_at_for_gameweek(uuid, bigint) to authenticated;
grant execute on function public.scrabble_score(text) to authenticated;

grant insert, update, delete on
  public.profile_nationalities,
  public.profile_username_changes,
  public.seasons,
  public.teams,
  public.gameweeks,
  public.fixtures,
  public.fixture_schedule_changes,
  public.players,
  public.player_team_assignments,
  public.card_deck_variants,
  public.competitions,
  public.competition_members,
  public.match_results,
  public.fixture_game_stats,
  public.player_fixture_stats,
  public.player_gameweek_stats,
  public.team_gameweek_standings,
  public.card_definitions,
  public.card_deck_cards,
  public.league_cards,
  public.game_card_rounds,
  public.game_card_results,
  public.game_card_actual_results,
  public.game_card_round_tiebreaks,
  public.card_draw_tokens,
  public.card_draw_events
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
