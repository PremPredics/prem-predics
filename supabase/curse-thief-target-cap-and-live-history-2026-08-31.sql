-- Prem Predics: count a completed Curse of the Thief toward the victim's
-- three-Curse limit for that Gameweek.
--
-- Safe and idempotent:
--   * does not delete or rewrite leagues, cards, predictions, results or history;
--   * preserves the trusted pending-Thief completion path;
--   * can be run more than once.

begin;

create or replace function public.enforce_curse_target_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  card_category text;
  card_effect_key text;
  target_gameweek_id bigint;
  target_gameweek_number integer;
  member_count integer;
  active_curse_count integer;
  previous_target_user_id uuid;
  trusted_thief_target_completion boolean := false;
begin
  if tg_op = 'UPDATE' and new.target_user_id is distinct from old.target_user_id then
    select cd.effect_key
      into card_effect_key
    from public.card_definitions cd
    where cd.id = old.card_id;

    trusted_thief_target_completion :=
      card_effect_key = 'curse_thief'
      and old.status = 'active'
      and new.status = 'active'
      and old.target_user_id is null
      and new.target_user_id is not null
      and current_setting('app.curse_thief_completion_effect_id', true) = old.id::text;
  end if;

  if tg_op = 'UPDATE' then
    if auth.uid() is not null
      and not public.is_admin()
      and (
        new.competition_id is distinct from old.competition_id
        or new.card_instance_id is distinct from old.card_instance_id
        or new.card_id is distinct from old.card_id
        or new.season_id is distinct from old.season_id
        or new.gameweek_id is distinct from old.gameweek_id
        or new.start_gameweek_id is distinct from old.start_gameweek_id
        or new.end_gameweek_id is distinct from old.end_gameweek_id
        or new.played_by_user_id is distinct from old.played_by_user_id
        or (
          new.target_user_id is distinct from old.target_user_id
          and not trusted_thief_target_completion
        )
      )
    then
      raise exception 'A played card''s owner, target and Gameweek cannot be changed.';
    end if;
  end if;

  if coalesce(new.status, 'active') <> 'active' or new.target_user_id is null then
    return new;
  end if;

  select cd.category
    into card_category
  from public.card_definitions cd
  where cd.id = new.card_id;

  if card_category is distinct from 'curse'
    or new.target_user_id = new.played_by_user_id
  then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    raise exception 'A Curse Card must have a Gameweek.';
  end if;

  select gw.number
    into target_gameweek_number
  from public.gameweeks gw
  where gw.id = target_gameweek_id
    and gw.season_id = new.season_id;

  if target_gameweek_number is null then
    raise exception 'The Curse Card Gameweek does not belong to this season.';
  end if;

  -- Serialise both the victim cap and the player's within-Gameweek target order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'curse-target-cap:' || new.competition_id::text || ':' || new.target_user_id::text || ':' || target_gameweek_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'curse-target-order:' || new.competition_id::text || ':' || new.played_by_user_id::text || ':' || target_gameweek_id::text,
      0
    )
  );

  select count(*)::integer
    into active_curse_count
  from public.active_card_effects ace
  join public.card_definitions cd
    on cd.id = ace.card_id
   and cd.category = 'curse'
  join public.gameweeks start_gw
    on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
   and start_gw.season_id = ace.season_id
  join public.gameweeks end_gw
    on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
   and end_gw.season_id = ace.season_id
  where ace.id is distinct from new.id
    and ace.competition_id = new.competition_id
    and ace.season_id = new.season_id
    and ace.target_user_id = new.target_user_id
    and ace.target_user_id is distinct from ace.played_by_user_id
    and (
      ace.status = 'active'
      or (ace.status = 'resolved' and cd.effect_key = 'curse_thief')
    )
    and target_gameweek_number between start_gw.number and end_gw.number;

  if active_curse_count >= 3 then
    raise exception 'This player already has the maximum of 3 Curse Cards for this Gameweek.';
  end if;

  select count(*)::integer
    into member_count
  from public.competition_members cm
  where cm.competition_id = new.competition_id;

  if member_count >= 3 then
    select ace.target_user_id
      into previous_target_user_id
    from public.active_card_effects ace
    join public.card_definitions cd
      on cd.id = ace.card_id
     and cd.category = 'curse'
    where ace.id is distinct from new.id
      and ace.competition_id = new.competition_id
      and ace.season_id = new.season_id
      and ace.played_by_user_id = new.played_by_user_id
      and ace.target_user_id is not null
      and ace.target_user_id is distinct from ace.played_by_user_id
      and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
      and lower(coalesce(ace.status, '')) not in ('cancelled', 'removed')
    order by ace.played_at desc, ace.id desc
    limit 1;

    if previous_target_user_id = new.target_user_id then
      raise exception 'Your next Curse this Gameweek must target a different player.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_curse_target_rules() from public;

drop trigger if exists active_card_effects_enforce_curse_target_rules
on public.active_card_effects;

create trigger active_card_effects_enforce_curse_target_rules
before insert or update of competition_id, card_instance_id, card_id, season_id,
  gameweek_id, start_gameweek_id, end_gameweek_id, played_by_user_id,
  target_user_id, status
on public.active_card_effects
for each row execute function public.enforce_curse_target_rules();

notify pgrst, 'reload schema';

commit;

-- Audit only: every returned total uses the same rule as the cap above.
-- A count above 3 means historical data already exceeded the intended rule;
-- this migration reports it but deliberately does not mutate that history.
select
  ace.competition_id,
  ace.season_id,
  coalesce(ace.start_gameweek_id, ace.gameweek_id) as gameweek_id,
  ace.target_user_id,
  count(*)::integer as curses_counting_toward_cap
from public.active_card_effects ace
join public.card_definitions cd
  on cd.id = ace.card_id
 and cd.category = 'curse'
where ace.target_user_id is not null
  and ace.target_user_id is distinct from ace.played_by_user_id
  and (
    ace.status = 'active'
    or (ace.status = 'resolved' and cd.effect_key = 'curse_thief')
  )
group by
  ace.competition_id,
  ace.season_id,
  coalesce(ace.start_gameweek_id, ace.gameweek_id),
  ace.target_user_id
order by curses_counting_toward_cap desc, gameweek_id desc;
