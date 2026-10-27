-- Presentation only. Does not modify any league or gameplay data.
begin;
create table if not exists public.site_theme_settings (
  id boolean primary key default true check (id = true),
  halloween_enabled boolean not null default false
);
alter table public.site_theme_settings enable row level security;
revoke all on public.site_theme_settings from public, anon, authenticated;
grant select on public.site_theme_settings to anon, authenticated;
grant update (halloween_enabled) on public.site_theme_settings to authenticated;
drop policy if exists "Anyone can read site theme" on public.site_theme_settings;
create policy "Anyone can read site theme" on public.site_theme_settings
  for select to anon, authenticated using (true);
drop policy if exists "Global admins can change site theme" on public.site_theme_settings;
create policy "Global admins can change site theme" on public.site_theme_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
-- Enable for launch; running this again preserves the admin's current choice.
insert into public.site_theme_settings (id, halloween_enabled)
values (true, true) on conflict (id) do nothing;
commit;
-- Verify: expect one row. Only the existing global-admin role can update it.
select * from public.site_theme_settings;
