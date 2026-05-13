-- Create a public profile automatically whenever a user signs up through Supabase Auth.
-- Run after supabase/schema.sql.

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
  profile_favorite_color text;
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
  profile_favorite_color := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'favorite_color', '')), ''),
    '#ffffff'
  );

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

  if profile_favorite_color !~ '^#[0-9A-Fa-f]{6}$' then
    profile_favorite_color := '#ffffff';
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
    profile_image_url,
    favorite_color
  )
  values (
    new.id,
    profile_display_name,
    profile_first_name,
    profile_last_name,
    profile_nationality,
    profile_favorite_team_id,
    profile_image_url,
    lower(profile_favorite_color)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
