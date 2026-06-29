-- Super Duo save path and Super Pen penalty medals.
-- Run once in Supabase SQL Editor after deploying the matching web/app code.

begin;

update public.card_definitions
set description = 'Gain 1 Medal any time a penalty is scored in the active range. Duration: 1 Gameweek for 2-3 player leagues, 2 Gameweeks for 4-6, and 3 Gameweeks for 7-10.'
where id = 'super_pen';

create or replace function public.save_super_duo_pick(
  target_competition_id uuid,
  target_gameweek_id bigint,
  target_player_id uuid,
  target_source_card_effect_id uuid default null
)
returns public.star_man_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  competition_row record;
  gameweek_row record;
  player_row record;
  effect_row record;
  saved_pick public.star_man_picks;
  target_first_kickoff_at timestamptz;
begin
  if target_user is null then
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
      and cm.user_id = target_user
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
    and ace.played_by_user_id = target_user
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
      and smp.user_id = target_user
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
    target_user,
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
$$;

grant execute on function public.save_super_duo_pick(uuid, bigint, uuid, uuid) to authenticated;

create or replace function public.sync_super_pen_card_draw_tokens(target_competition_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  target_season_id uuid;
  inserted_count integer := 0;
begin
  if target_user is null then
    raise exception 'You must be signed in to sync Super Pen medals.';
  end if;

  select c.season_id
    into target_season_id
  from public.competitions c
  where c.id = target_competition_id;

  if target_season_id is null then
    raise exception 'Private league not found.';
  end if;

  if not exists (
    select 1
    from public.competition_members cm
    where cm.competition_id = target_competition_id
      and cm.user_id = target_user
  ) then
    raise exception 'You are not a member of this private league.';
  end if;

  with valid_gameweek_penalties as (
    select
      ace.id as effect_id,
      fixture_gw.id as gameweek_id,
      greatest(coalesce(sum(coalesce(fgs.penalties_scored, 0)), 0), 0)::integer as penalty_count
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    join public.gameweeks start_gw
      on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
      and start_gw.season_id = ace.season_id
    join public.gameweeks end_gw
      on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
      and end_gw.season_id = ace.season_id
    join public.gameweeks fixture_gw
      on fixture_gw.season_id = ace.season_id
      and fixture_gw.number between start_gw.number and end_gw.number
    join public.fixtures f
      on f.season_id = ace.season_id
      and f.gameweek_id = fixture_gw.id
      and f.status <> 'postponed'
    left join public.fixture_game_stats fgs on fgs.fixture_id = f.id
    where ace.competition_id = target_competition_id
      and ace.season_id = target_season_id
      and ace.played_by_user_id = target_user
      and ace.status = 'active'
      and cd.effect_key = 'super_pen'
    group by ace.id, fixture_gw.id
  ),
  valid_tokens as (
    select
      vgp.effect_id,
      'super_pen_' || vgp.effect_id::text || '_' || vgp.gameweek_id::text || '_' || penalty_series.penalty_number::text as source_key
    from valid_gameweek_penalties vgp
    cross join lateral generate_series(1, vgp.penalty_count) as penalty_series(penalty_number)
  ),
  stale_tokens as (
    delete from public.card_draw_tokens cdt
    where cdt.competition_id = target_competition_id
      and cdt.season_id = target_season_id
      and cdt.user_id = target_user
      and cdt.token_type = 'regular_medal'
      and cdt.deck_type = 'regular'
      and cdt.source_type = 'card_effect'
      and cdt.status = 'available'
      and cdt.source_key like 'super_pen_%'
      and not exists (
        select 1
        from valid_tokens vt
        where vt.source_key = cdt.source_key
      )
    returning 1
  ),
  inserted_tokens as (
    insert into public.card_draw_tokens (
      competition_id,
      season_id,
      user_id,
      token_type,
      deck_type,
      source_type,
      source_card_effect_id,
      source_key,
      status
    )
    select
      target_competition_id,
      target_season_id,
      target_user,
      'regular_medal',
      'regular',
      'card_effect',
      vt.effect_id,
      vt.source_key,
      'available'
    from valid_tokens vt
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count
  from inserted_tokens;

  return inserted_count;
end;
$$;

grant execute on function public.sync_super_pen_card_draw_tokens(uuid) to authenticated;

commit;
