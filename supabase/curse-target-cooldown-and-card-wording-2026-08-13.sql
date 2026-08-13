begin;

update public.card_definitions
set description = case effect_key
  when 'power_goal' then 'Valid for 1 Gameweek. +1 Goal for Star Man this week (+3 UC Points per card played). Each card stacks as a separate fixed +3 UC Points. Other Power Cards cannot multiply the points earned from Power Of The Goal. Must be played at least 90 minutes before the gameweek''s first KO time.'
  when 'power_of_god' then 'Change one current Gameweek match prediction from kick-off until the start of the 2nd half.'
  else description end
where effect_key in ('power_goal', 'power_of_god');

create or replace function public.enforce_curse_target_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_category text;
  member_count integer;
  current_gameweek_number integer;
  last_target_gameweek_number integer;
begin
  if coalesce(new.status, 'active') = 'cancelled' or new.target_user_id is null then return new; end if;
  select cd.category into target_category from public.card_definitions cd where cd.id = new.card_id;
  if target_category <> 'curse' then return new; end if;

  select count(*)::integer into member_count
  from public.competition_members cm where cm.competition_id = new.competition_id;
  if member_count <= 2 then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.competition_id::text || ':' || new.played_by_user_id::text, 0));

  select gw.number into current_gameweek_number
  from public.gameweeks gw where gw.id = coalesce(new.start_gameweek_id, new.gameweek_id);
  if current_gameweek_number is null then return new; end if;

  select max(previous_gw.number) into last_target_gameweek_number
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id and cd.category = 'curse'
  join public.gameweeks previous_gw on previous_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
  where ace.id is distinct from new.id
    and ace.competition_id = new.competition_id
    and ace.season_id = new.season_id
    and ace.played_by_user_id = new.played_by_user_id
    and ace.target_user_id = new.target_user_id
    and ace.status <> 'cancelled';

  if last_target_gameweek_number is not null and current_gameweek_number - last_target_gameweek_number < 3 then
    raise exception 'You cannot target this player with another Curse Card until Gameweek %.', last_target_gameweek_number + 3;
  end if;
  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_curse_target_cooldown on public.active_card_effects;
create trigger active_card_effects_enforce_curse_target_cooldown
before insert
on public.active_card_effects for each row execute function public.enforce_curse_target_cooldown();

notify pgrst, 'reload schema';
commit;
