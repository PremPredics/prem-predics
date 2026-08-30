-- Make concrete Live Curse outcomes refresh immediately for league members.
-- Safe and idempotent: publication membership only; no application rows are changed.

do $live_curse_outcomes_realtime$
declare
  target_table text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase realtime publication was not found; nothing was changed.';
  end if;

  foreach target_table in array array[
    'active_card_effects',
    'curse_hated_forced_predictions',
    'curse_gambler_rolls'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'Required table public.% does not exist; run the card rules migrations first.', target_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end
$live_curse_outcomes_realtime$;

-- Optional verification: all three rows should return published = true.
select required.table_name,
       exists (
         select 1
         from pg_catalog.pg_publication_tables published
         where published.pubname = 'supabase_realtime'
           and published.schemaname = 'public'
           and published.tablename = required.table_name
       ) as published
from (values
  ('active_card_effects'),
  ('curse_hated_forced_predictions'),
  ('curse_gambler_rolls')
) as required(table_name)
order by required.table_name;
