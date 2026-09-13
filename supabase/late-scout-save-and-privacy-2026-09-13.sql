-- Late Scout: preserve every league, pick, result and card; policy/guard repair only.
-- SQL argument target_user_id was shadowed by active_card_effects.target_user_id.
-- Positional parameters remove the ambiguity; RLS remains enabled.
begin;
CREATE OR REPLACE FUNCTION public.can_submit_star_man_pick(target_competition_id uuid, target_season_id uuid, target_gameweek_id bigint, target_user_id uuid, target_player_id uuid, target_pick_slot text, target_source_card_effect_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    $4 = auth.uid()
    and public.is_competition_member($1)
    and exists (
      select 1
      from public.gameweeks gw
      where gw.id = $3
        and gw.season_id = $2
        and (
          (
            $6 = 'primary'
            and exists (
              select 1
              from public.players p
              join public.fixtures f
                on f.season_id = $2
                and f.gameweek_id = $3
                and f.status <> 'postponed'
              where p.id = $5
                and (
                  p.team_id in (f.home_team_id, f.away_team_id)
                  or exists (
                    select 1
                    from public.player_team_assignments pta
                    where pta.player_id = $5
                      and pta.season_id = $2
                      and pta.team_id in (f.home_team_id, f.away_team_id)
                      and pta.starts_gameweek_id <= $3
                      and (pta.ends_gameweek_id is null or pta.ends_gameweek_id >= $3)
                  )
                )
            )
            and (
              now() < public.star_man_lock_at_for_gameweek($2, $3)
              or exists (
                select 1
                from public.active_card_effects ace
                join public.card_definitions cd on cd.id = ace.card_id
                join public.players p on p.id = $5
                join public.fixtures f
                  on f.season_id = $2
                  and f.gameweek_id = $3
                where ace.id = $7
                  and ace.competition_id = $1
                  and ace.played_by_user_id = $4
                  and ace.season_id = $2
                  and coalesce(ace.start_gameweek_id, ace.gameweek_id) <= $3
                  and coalesce(ace.end_gameweek_id, ace.gameweek_id) >= $3
                  and ace.status = 'active'
                  and cd.effect_key in ('power_late_scout', 'super_sub')
                  and (ace.fixture_id is null or ace.fixture_id = f.id)
                  and (
                    p.team_id in (f.home_team_id, f.away_team_id)
                    or exists (
                      select 1
                      from public.player_team_assignments pta
                      where pta.player_id = $5
                        and pta.season_id = $2
                        and pta.team_id in (f.home_team_id, f.away_team_id)
                        and pta.starts_gameweek_id <= $3
                        and (pta.ends_gameweek_id is null or pta.ends_gameweek_id >= $3)
                      )
                  )
                  and f.kickoff_at = (
                    select min(f2.kickoff_at)
                    from public.fixtures f2
                    where f2.season_id = $2
                      and f2.gameweek_id = $3
                      and f2.status <> 'postponed'
                      and (
                        p.team_id in (f2.home_team_id, f2.away_team_id)
                        or exists (
                          select 1
                          from public.player_team_assignments pta2
                          where pta2.player_id = $5
                            and pta2.season_id = $2
                            and pta2.team_id in (f2.home_team_id, f2.away_team_id)
                            and pta2.starts_gameweek_id <= $3
                            and (pta2.ends_gameweek_id is null or pta2.ends_gameweek_id >= $3)
                        )
                      )
                  )
                  and now() < f.kickoff_at
              )
            )
          )
          or (
            $6 = 'super_duo'
            and now() < public.star_man_lock_at_for_gameweek($2, $3)
            and exists (
              select 1
              from public.active_card_effects ace
              join public.card_definitions cd on cd.id = ace.card_id
              where ace.id = $7
                and ace.competition_id = $1
                and ace.played_by_user_id = $4
                and ace.season_id = $2
                  and coalesce(ace.start_gameweek_id, ace.gameweek_id) <= $3
                  and coalesce(ace.end_gameweek_id, ace.gameweek_id) >= $3
                  and ace.status = 'active'
                and cd.effect_key = 'super_duo'
                and (ace.start_gameweek_id is null or ace.start_gameweek_id <= $3)
                and (ace.end_gameweek_id is null or ace.end_gameweek_id >= $3)
            )
          )
        )
    );
$function$;

create or replace function public.player_gameweek_first_kickoff_at(
  target_season_id uuid,
  target_gameweek_id bigint,
  target_player_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select min(f.kickoff_at)
  from public.fixtures f
  join public.players p on p.id = target_player_id
  where f.season_id = target_season_id
    and f.gameweek_id = target_gameweek_id
    and lower(coalesce(f.status, '')) <> 'postponed'
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
    );
$$;

create or replace function public.enforce_late_scout_play_timing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_effect_key text;
  target_gameweek_id bigint;
  current_star_man_player_id uuid;
  current_star_man_kickoff timestamptz;
begin
  select cd.effect_key
    into target_effect_key
  from public.card_definitions cd
  where cd.id = new.card_id;

  if target_effect_key is distinct from 'power_late_scout' or public.is_admin() then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    raise exception 'Power of the Late Scout requires an active Gameweek.';
  end if;

  if not exists (
    select 1
    from public.fixtures f
    where f.season_id = new.season_id
      and f.gameweek_id = target_gameweek_id
      and lower(coalesce(f.status, '')) <> 'postponed'
      and f.kickoff_at > now()
  ) then
    raise exception 'Power of the Late Scout cannot be played after the final match in this Gameweek has kicked off.';
  end if;

  select smp.player_id
    into current_star_man_player_id
  from public.star_man_picks smp
  where smp.competition_id = new.competition_id
    and smp.season_id = new.season_id
    and smp.gameweek_id = target_gameweek_id
    and smp.user_id = new.played_by_user_id
    and smp.pick_slot = 'primary'
  limit 1;

  if current_star_man_player_id is not null then
    current_star_man_kickoff := public.player_gameweek_first_kickoff_at(
      new.season_id,
      target_gameweek_id,
      current_star_man_player_id
    );

    if current_star_man_kickoff is null then
      raise exception 'Power of the Late Scout cannot be played because the selected Star Man has no eligible match in this Gameweek.';
    end if;

    if now() >= current_star_man_kickoff then
      raise exception 'Power of the Late Scout cannot be played because your selected Star Man''s match has already kicked off.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists active_card_effects_enforce_late_scout_play_timing
on public.active_card_effects;

create trigger active_card_effects_enforce_late_scout_play_timing
before insert on public.active_card_effects
for each row execute function public.enforce_late_scout_play_timing();

create or replace function public.enforce_late_scout_star_man_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  source_effect_key text;
  current_star_man_kickoff timestamptz;
begin
  if new.pick_slot is distinct from 'primary'
    or new.player_id is not distinct from old.player_id
    or public.is_admin()
  then
    return new;
  end if;

  select cd.effect_key
    into source_effect_key
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = new.source_card_effect_id
    and ace.competition_id = new.competition_id
    and ace.season_id = new.season_id
    and ace.played_by_user_id = new.user_id
    and ace.status = 'active';

  if source_effect_key is distinct from 'power_late_scout' then
    return new;
  end if;

  current_star_man_kickoff := public.player_gameweek_first_kickoff_at(
    old.season_id,
    old.gameweek_id,
    old.player_id
  );

  if current_star_man_kickoff is null or now() >= current_star_man_kickoff then
    raise exception 'Power of the Late Scout cannot change your Star Man because your selected Star Man''s match has already kicked off.';
  end if;

  return new;
end;
$$;

drop trigger if exists star_man_picks_enforce_late_scout_change
on public.star_man_picks;

create trigger star_man_picks_enforce_late_scout_change
before update of player_id, source_card_effect_id on public.star_man_picks
for each row execute function public.enforce_late_scout_star_man_change();


revoke all on function public.enforce_late_scout_play_timing() from public, anon, authenticated;
revoke all on function public.enforce_late_scout_star_man_change() from public, anon, authenticated;
revoke all on function public.player_gameweek_first_kickoff_at(uuid,bigint,uuid) from public, anon;
grant execute on function public.player_gameweek_first_kickoff_at(uuid,bigint,uuid) to authenticated;

-- Restrictive policy complements the existing owner/member/normal-deadline policy.
-- It also hides an original, still-changeable pick before the first Late Scout switch.
drop policy if exists "late scout picks stay private until player kickoff" on public.star_man_picks;
create policy "late scout picks stay private until player kickoff"
on public.star_man_picks as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
  or not exists (
    select 1 from public.active_card_effects e
    join public.card_definitions d on d.id = e.card_id
    where e.competition_id = star_man_picks.competition_id
      and e.season_id = star_man_picks.season_id
      and e.played_by_user_id = star_man_picks.user_id
      and d.effect_key = 'power_late_scout'
      and (
        e.id = star_man_picks.source_card_effect_id
        or (e.status = 'active'
          and coalesce(e.start_gameweek_id,e.gameweek_id) <= star_man_picks.gameweek_id
          and coalesce(e.end_gameweek_id,e.gameweek_id) >= star_man_picks.gameweek_id)
      )
  )
  or now() >= public.player_gameweek_first_kickoff_at(season_id,gameweek_id,player_id)
);
commit;
-- Verify can_submit_star_man_pick under the affected user's JWT; never save a pick for them.
-- Owners retain visibility; league opponents wait until the selected player's kickoff.
