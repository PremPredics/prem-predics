-- Power of the Late Scout: kickoff-aware play and Star Man change guards.
-- Safe to run more than once. This does not delete or alter any league data.

begin;

update public.card_definitions
set description = 'Valid for 1 Gameweek. Play before the final Gameweek match kicks off and before your currently selected Star Man''s team kicks off. After the normal Star Man deadline, you may choose or change your Star Man only while both the current selection''s team and the replacement player''s team have not kicked off. Once your selected Star Man''s match starts, that selection is final.'
where id = 'power_late_scout';

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

commit;
