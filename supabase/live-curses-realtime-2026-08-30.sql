-- Enable immediate Live Curses updates for authenticated league members.
-- Safe and idempotent: this changes only Supabase's realtime publication.
-- It does not insert, update or delete any application data.

do $live_curses_realtime$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase realtime publication was not found; nothing was changed.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'active_card_effects'
  ) then
    alter publication supabase_realtime add table public.active_card_effects;
  end if;
end
$live_curses_realtime$;
