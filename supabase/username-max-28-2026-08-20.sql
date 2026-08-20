-- Prem Predics: enforce the 2-28 character username rule for new usernames.
-- Safe to run more than once. Existing longer usernames are grandfathered only
-- until their owner next changes the username, so profile-photo/colour edits are
-- not broken. This does not delete or rename any account, league, fixture,
-- prediction, pick, or card data.

begin;

-- Remove an earlier CHECK version if it was trialled. A CHECK would also block an
-- unrelated profile update for a legacy user whose unchanged username is long.
alter table public.profiles
  drop constraint if exists profiles_display_name_length_check;

create or replace function public.enforce_profile_display_name_length()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  must_validate boolean := false;
begin
  if tg_op = 'INSERT' then
    must_validate := true;
  elsif tg_op = 'UPDATE' then
    must_validate := new.display_name is distinct from old.display_name;
  end if;

  if must_validate and (
    new.display_name is distinct from btrim(new.display_name)
    or char_length(new.display_name) < 2
    or char_length(new.display_name) > 28
  ) then
    raise exception 'Username must be between 2 and 28 characters without leading or trailing spaces.'
      using errcode = '22001';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_display_name_length on public.profiles;

create trigger profiles_enforce_display_name_length
before insert or update of display_name on public.profiles
for each row execute function public.enforce_profile_display_name_length();

commit;

select
  'USERNAME_LIMIT_READY' as status,
  count(*) as profile_count,
  count(*) filter (where char_length(display_name) > 28) as grandfathered_over_28,
  max(char_length(display_name)) as longest_username_characters
from public.profiles;
