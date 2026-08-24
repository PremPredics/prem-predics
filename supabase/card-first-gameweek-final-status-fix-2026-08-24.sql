-- Allow Power, Curse, and Super cards as soon as every fixture in the
-- private league's first Gameweek has been marked final.
--
-- Safe to run more than once. This only updates the existing validation
-- function; it does not modify leagues, fixtures, results, cards, or users.

begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
  old_fragment constant text :=
    'not in (''completed'', ''finished'', ''full_time'', ''ft'')';
  new_fragment constant text :=
    'not in (''final'', ''completed'', ''finished'', ''full_time'', ''ft'')';
begin
  select pg_get_functiondef(
    to_regprocedure('public.enforce_card_play_deadline()')
  )
  into function_definition;

  if function_definition is null then
    raise exception 'public.enforce_card_play_deadline() was not found; no changes were made.';
  end if;

  if position(new_fragment in function_definition) > 0 then
    return;
  end if;

  if position(old_fragment in function_definition) = 0 then
    raise exception 'The expected first-Gameweek status check was not found; no changes were made.';
  end if;

  patched_definition := replace(function_definition, old_fragment, new_fragment);
  execute patched_definition;

  select pg_get_functiondef(
    to_regprocedure('public.enforce_card_play_deadline()')
  )
  into function_definition;

  if position(new_fragment in function_definition) = 0 then
    raise exception 'The card deadline function did not update; all changes will be rolled back.';
  end if;
end;
$migration$;

commit;

select
  position(
    'not in (''final'', ''completed'', ''finished'', ''full_time'', ''ft'')'
    in pg_get_functiondef(to_regprocedure('public.enforce_card_play_deadline()'))
  ) > 0 as final_status_is_recognised;
