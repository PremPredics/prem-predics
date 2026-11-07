-- Apply after existing Prem Predics migrations.
-- 2026-11-07: Explicit Super Card kickoff rules, late Super Duo selection,
-- locked Duo changes, and return of unselected Duo cards at Gameweek completion.
-- All standard Star Man (90-minute) rules are intentionally preserved.

CREATE OR REPLACE FUNCTION public.enforce_card_play_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  card_row record;
  target_gameweek_id bigint;
  league_start_gameweek_id bigint;
  first_kickoff timestamptz;
  play_deadline timestamptz;
  non_stacking_effect_keys text[] := array[
    'power_laundrette',
    'power_clean_sweep',
    'power_pessimist',
    'power_immigrants',
    'power_lanky_crouch',
    'power_small_and_mighty',
    'power_assist_king',
    'power_late_scout',
    'power_snow',
    'super_star_man',
    'super_golden_gameweek',
    'super_sub',
    'super_score',
    'super_duo',
    'super_pen'
  ];
begin
  select category, effect_key, name
    into card_row
  from public.card_definitions
  where id = new.card_id;

  if card_row.category is null or card_row.category = 'game' then
    return new;
  end if;

  select starts_gameweek_id
    into league_start_gameweek_id
  from public.competitions
  where id = new.competition_id;

  if league_start_gameweek_id is not null
    and exists (
      select 1
      from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = league_start_gameweek_id
        and lower(coalesce(f.status, '')) not in ('final', 'completed', 'finished', 'full_time', 'ft')
        and (f.kickoff_at is null or now() < f.kickoff_at + interval '3 hours')
    )
    and not public.is_admin()
  then
    raise exception 'Cards can only be played once the first week in your private league has ended.';
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if target_gameweek_id is null then
    return new;
  end if;

  if card_row.effect_key = any(non_stacking_effect_keys)
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = card_row.effect_key
    )
    and not public.is_admin()
  then
    raise exception '% cannot be played more than once within a Gameweek', coalesce(card_row.name, 'This card');
  end if;

  if card_row.effect_key in ('power_lanky_crouch', 'power_small_and_mighty')
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.played_by_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'power_lanky_crouch' and cd.effect_key = 'power_small_and_mighty')
          or (card_row.effect_key = 'power_small_and_mighty' and cd.effect_key = 'power_lanky_crouch')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Lanky Crouch and Power of the Small and Mighty cannot be active at the same time.';
  end if;

  if card_row.effect_key in ('curse_gambler', 'curse_even_number', 'curse_odd_number')
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.target_user_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and (
          (card_row.effect_key = 'curse_gambler' and cd.effect_key in ('curse_even_number', 'curse_odd_number'))
          or (card_row.effect_key in ('curse_even_number', 'curse_odd_number') and cd.effect_key = 'curse_gambler')
          or (card_row.effect_key = 'curse_even_number' and cd.effect_key = 'curse_odd_number')
          or (card_row.effect_key = 'curse_odd_number' and cd.effect_key = 'curse_even_number')
        )
    )
    and not public.is_admin()
  then
    raise exception 'Curse of the Random cannot be combined with Curse of the Even/Odd Number.';
  end if;

  if card_row.effect_key = 'curse_deleted_match'
    and new.fixture_id is not null
    and new.target_user_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.played_by_user_id = new.target_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'power_hedge'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  if card_row.effect_key = 'power_hedge'
    and new.fixture_id is not null
    and exists (
      select 1
      from public.active_card_effects ace
      join public.card_definitions cd on cd.id = ace.card_id
      where ace.competition_id = new.competition_id
        and ace.season_id = new.season_id
        and ace.target_user_id = new.played_by_user_id
        and ace.fixture_id = new.fixture_id
        and ace.status = 'active'
        and coalesce(ace.start_gameweek_id, ace.gameweek_id) = target_gameweek_id
        and cd.effect_key = 'curse_deleted_match'
    )
    and not public.is_admin()
  then
    raise exception 'Power of the Hedge and Curse of the Deleted Match cannot be played on this match while the other card is active.';
  end if;

  select min(kickoff_at) filter (where status <> 'postponed')
    into first_kickoff
  from public.fixtures
  where season_id = new.season_id
    and gameweek_id = target_gameweek_id;

  if first_kickoff is null then
    if card_row.category = 'super' and card_row.effect_key <> 'super_draw' then
      raise exception 'No playable Gameweek fixture is scheduled for this Super Card.';
    end if;
    return new;
  end if;

  if card_row.effect_key in ('super_pen', 'super_golden_gameweek', 'super_score') then
    if now() >= first_kickoff then
      raise exception '% must be played before the first Gameweek match kicks off.', coalesce(card_row.name, 'This Super Card');
    end if;
    return new;
  end if;

  if card_row.effect_key = 'super_star_man' then
    if not exists (
      select 1 from public.star_man_picks sm
      where sm.competition_id = new.competition_id
        and sm.season_id = new.season_id
        and sm.gameweek_id = target_gameweek_id
        and sm.user_id = new.played_by_user_id
        and sm.pick_slot = 'primary'
        and now() < public.player_gameweek_first_kickoff_at(sm.season_id, sm.gameweek_id, sm.player_id)
    ) then
      raise exception 'Super Star Man requires a saved Star Man whose match has not kicked off.';
    end if;
    return new;
  end if;

  if card_row.effect_key = 'super_sub' then
    if not exists (
      select 1 from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = target_gameweek_id
        and f.status <> 'postponed'
        and f.kickoff_at > now()
    ) then
      raise exception 'Super Sub must be played before the final Gameweek match kicks off.';
    end if;
    return new;
  end if;

  if card_row.effect_key in (
    'power_swap',
    'power_veto',
    'power_of_god',
    'power_late_scout',
    'super_draw',
    'super_golden_gameweek',
    'super_pen',
    'super_sub',
    'super_duo'
  ) then
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
    if card_row.category = 'super' then
      raise exception 'Super cards must be played before the 90-minute gameweek deadline.';
    end if;
    raise exception 'Power cards must be played before the 90-minute gameweek deadline.';
  end if;

  return new;
end;
$function$;

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
            and now() < public.player_gameweek_first_kickoff_at($2, $3, $5)
            and not exists (
              select 1 from public.star_man_picks old_duo
              where old_duo.competition_id = $1
                and old_duo.season_id = $2
                and old_duo.gameweek_id = $3
                and old_duo.user_id = $4
                and old_duo.pick_slot = 'super_duo'
                and now() >= public.player_gameweek_first_kickoff_at($2, $3, old_duo.player_id)
            )
            and not exists (
              select 1 from public.star_man_picks primary_pick
              where primary_pick.competition_id = $1
                and primary_pick.gameweek_id = $3
                and primary_pick.user_id = $4
                and primary_pick.pick_slot = 'primary'
                and primary_pick.player_id = $5
            )
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

CREATE OR REPLACE FUNCTION public.save_super_duo_pick(target_competition_id uuid, target_gameweek_id bigint, target_player_id uuid, target_source_card_effect_id uuid DEFAULT NULL::uuid)
 RETURNS star_man_picks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_user_id uuid := auth.uid();
  competition_row record;
  gameweek_row record;
  player_row record;
  effect_row record;
  saved_pick public.star_man_picks;
  target_first_kickoff_at timestamptz;
begin
  if actor_user_id is null then
    raise exception 'You must be signed in to choose a Super Duo.';
  end if;

  select c.id, c.season_id
    into competition_row
  from public.competitions c
  where c.id = target_competition_id;

  if competition_row.id is null then
    raise exception 'Private league not found.';
  end if;

  if not exists (
    select 1
    from public.competition_members cm
    where cm.competition_id = target_competition_id
      and cm.user_id = actor_user_id
  ) then
    raise exception 'You are not a member of this private league.';
  end if;

  select gw.id, gw.number
    into gameweek_row
  from public.gameweeks gw
  where gw.id = target_gameweek_id
    and gw.season_id = competition_row.season_id;

  if gameweek_row.id is null then
    raise exception 'Gameweek not found for this season.';
  end if;

  select p.id, p.team_id, p.display_name, p.is_active
    into player_row
  from public.players p
  where p.id = target_player_id;

  if player_row.id is null or coalesce(player_row.is_active, false) is false then
    raise exception 'That player is not available for Super Duo.';
  end if;

  select ace.id, ace.card_id, ace.start_gameweek_id, ace.end_gameweek_id, ace.gameweek_id
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  left join public.gameweeks start_gw
    on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
    and start_gw.season_id = ace.season_id
  left join public.gameweeks end_gw
    on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
    and end_gw.season_id = ace.season_id
  where ace.competition_id = target_competition_id
    and ace.season_id = competition_row.season_id
    and ace.played_by_user_id = actor_user_id
    and ace.status = 'active'
    and cd.effect_key = 'super_duo'
    and (target_source_card_effect_id is null or ace.id = target_source_card_effect_id)
    and (
      ace.gameweek_id = target_gameweek_id
      or ace.start_gameweek_id = target_gameweek_id
      or (
        start_gw.number is not null
        and end_gw.number is not null
        and gameweek_row.number between start_gw.number and end_gw.number
      )
    )
  order by ace.played_at desc
  limit 1;

  if effect_row.id is null then
    raise exception 'Super Duo is not active for this gameweek.';
  end if;

  if exists (
    select 1
    from public.star_man_picks smp
    where smp.competition_id = target_competition_id
      and smp.season_id = competition_row.season_id
      and smp.gameweek_id = target_gameweek_id
      and smp.user_id = actor_user_id
      and smp.pick_slot = 'primary'
      and smp.player_id = target_player_id
  ) then
    raise exception 'Super Duo cannot be the same player as your Star Man.';
  end if;

  select min(f.kickoff_at)
    into target_first_kickoff_at
  from public.players p
  join public.fixtures f
    on f.season_id = competition_row.season_id
    and f.gameweek_id = target_gameweek_id
    and f.status <> 'postponed'
    and (
      p.team_id in (f.home_team_id, f.away_team_id)
      or exists (
        select 1
        from public.player_team_assignments pta
        where pta.player_id = p.id
          and pta.season_id = competition_row.season_id
          and pta.team_id in (f.home_team_id, f.away_team_id)
          and pta.starts_gameweek_id <= target_gameweek_id
          and (pta.ends_gameweek_id is null or pta.ends_gameweek_id >= target_gameweek_id)
      )
    )
  where p.id = target_player_id;

  if target_first_kickoff_at is null then
    raise exception 'That player has no fixture in this gameweek.';
  end if;

  if now() >= target_first_kickoff_at then
    raise exception 'That player''s team has already kicked off in this gameweek.';
  end if;

  if exists (
    select 1 from public.star_man_picks prior
    where prior.competition_id = target_competition_id
      and prior.season_id = competition_row.season_id
      and prior.gameweek_id = target_gameweek_id
      and prior.user_id = actor_user_id
      and prior.pick_slot = 'super_duo'
      and now() >= public.player_gameweek_first_kickoff_at(
        prior.season_id, prior.gameweek_id, prior.player_id
      )
  ) then
    raise exception 'Your saved Super Duo is locked because their match has kicked off.';
  end if;

  insert into public.star_man_picks (
    competition_id,
    season_id,
    gameweek_id,
    user_id,
    player_id,
    pick_slot,
    source_card_effect_id,
    picked_at,
    updated_at
  )
  values (
    target_competition_id,
    competition_row.season_id,
    target_gameweek_id,
    actor_user_id,
    target_player_id,
    'super_duo',
    effect_row.id,
    now(),
    now()
  )
  on conflict (competition_id, gameweek_id, user_id, pick_slot)
  do update set
    player_id = excluded.player_id,
    source_card_effect_id = excluded.source_card_effect_id,
    picked_at = now(),
    updated_at = now()
  returning * into saved_pick;

  return saved_pick;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_locked_super_duo_pick()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.pick_slot = 'super_duo'
    and (tg_op = 'DELETE'
      or (tg_op = 'UPDATE' and (
        new.player_id is distinct from old.player_id
        or new.pick_slot is distinct from old.pick_slot
      )))
    and now() >= public.player_gameweek_first_kickoff_at(
      old.season_id, old.gameweek_id, old.player_id
    )
  then
    raise exception 'Your saved Super Duo cannot be changed or cleared after their match kicks off.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_unselected_super_duo_on_gameweek_finish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status <> 'final'
    or not exists (
      select 1 from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = new.gameweek_id
        and f.status <> 'postponed'
    )
    or exists (
      select 1 from public.fixtures f
      where f.season_id = new.season_id
        and f.gameweek_id = new.gameweek_id
        and f.status not in ('final', 'postponed')
    )
  then return new;
  end if;

  with refunded_effects as (
    update public.active_card_effects e
    set status = 'cancelled', resolved_at = now()
    from public.card_definitions cd
    where cd.id = e.card_id
      and cd.effect_key = 'super_duo'
      and e.season_id = new.season_id
      and coalesce(e.start_gameweek_id, e.gameweek_id) = new.gameweek_id
      and e.status = 'active'
      and e.card_instance_id is not null
      and not exists (
        select 1 from public.star_man_picks sm
        where sm.competition_id = e.competition_id
          and sm.season_id = e.season_id
          and sm.gameweek_id = new.gameweek_id
          and sm.user_id = e.played_by_user_id
          and sm.pick_slot = 'super_duo'
      )
    returning e.card_instance_id, e.competition_id, e.played_by_user_id
  )
  update public.league_cards lc
  set zone = 'hand', updated_at = now()
  from refunded_effects re
  where lc.id = re.card_instance_id
    and lc.competition_id = re.competition_id
    and lc.owner_user_id = re.played_by_user_id
    and lc.zone = 'discard';

  return new;
end;
$function$;
drop trigger if exists star_man_picks_guard_locked_super_duo on public.star_man_picks;
create trigger star_man_picks_guard_locked_super_duo
before update or delete on public.star_man_picks
for each row execute function public.guard_locked_super_duo_pick();

drop policy if exists "delete own super duo before player kickoff" on public.star_man_picks;
create policy "delete own super duo before player kickoff"
on public.star_man_picks for delete to authenticated
using (
  user_id = (select auth.uid())
  and pick_slot = 'super_duo'
  and public.is_competition_member(competition_id)
  and now() < public.player_gameweek_first_kickoff_at(season_id, gameweek_id, player_id)
);

revoke all on function public.refund_unselected_super_duo_on_gameweek_finish() from public, anon, authenticated;
drop trigger if exists fixtures_refund_unused_super_duo on public.fixtures;
create trigger fixtures_refund_unused_super_duo
after update of status on public.fixtures
for each row when (new.status = 'final')
execute function public.refund_unselected_super_duo_on_gameweek_finish();

update public.card_definitions set description =
case id
 when 'super_pen' then 'Gain 1 Medal whenever a penalty is scored this Gameweek. Must be played before the first match kicks off. Valid for 1 Gameweek.'
 when 'super_golden_gameweek' then 'Double your prediction points for the Gameweek. Must be played before the first match kicks off. Valid for 1 Gameweek.'
 when 'super_score' then 'Choose an exact home-away scoreline before the first Gameweek kick-off. Both playing the card and saving the scoreline must be completed before kick-off.'
 when 'super_star_man' then 'Triple the points from your saved Star Man, with no yellow/red-card penalties. Must be played before the selected Star Man''s match kicks off.'
 when 'super_duo' then 'Choose a second Star Man, including after the normal Star Man deadline, but only before the chosen player kicks off. Once saved and kicked off, the Duo cannot be changed. If no Duo is chosen by the end of the Gameweek, the card returns unused.'
 when 'super_sub' then 'Swap your Star Man, including after the original Star Man''s match finishes, before the final Gameweek match kicks off. The replacement player must not have kicked off.'
 when 'super_draw' then 'Draw 5 Regular Cards from the Regular Deck. Can be played at any time once league cards are unlocked.'
 else description
end
where id in ('super_pen','super_golden_gameweek','super_score','super_star_man','super_duo','super_sub','super_draw');
