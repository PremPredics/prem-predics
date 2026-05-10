-- Run this in Supabase SQL Editor after the main schema.
-- It adds medal accrual from current accolade rules and a safe card-draw RPC.

alter table public.card_draw_tokens
add column if not exists source_key text;

create unique index if not exists card_draw_tokens_unique_source_key
on public.card_draw_tokens(competition_id, user_id, token_type, source_key)
where source_key is not null;

update public.card_definitions
set description = case id
  when 'game_goals' then 'Best-of-5 minigame: predict total goals each gameweek. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_corners' then 'Best-of-5 minigame: predict total corners each gameweek. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_underdog' then 'Best-of-5 minigame: predict teams beating a team above them. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_goalhanger' then 'Best-of-5 minigame: predict players scoring 2+ goals. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_war' then 'Best-of-5 minigame: predict total yellow cards. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_early_worm' then 'Best-of-5 minigame: predict earliest goal minute. Winner earns +1 UC point and 1 Super Medal.'
  when 'game_time' then 'Best-of-5 minigame: predict total 90+ minute goals. Winner earns +1 UC point and 1 Super Medal.'
  else description
end
where id in (
  'game_goals',
  'game_corners',
  'game_underdog',
  'game_goalhanger',
  'game_war',
  'game_early_worm',
  'game_time'
);

create table if not exists public.game_card_actual_results (
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  card_id text not null references public.card_definitions(id) on delete cascade,
  actual_value numeric(10, 2) not null,
  entered_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (season_id, gameweek_id, card_id)
);

drop trigger if exists game_card_actual_results_set_updated_at
on public.game_card_actual_results;

create trigger game_card_actual_results_set_updated_at
before update on public.game_card_actual_results
for each row execute function public.set_updated_at();

alter table public.game_card_actual_results enable row level security;

drop policy if exists "game card actual results visible to authenticated users"
on public.game_card_actual_results;

create policy "game card actual results visible to authenticated users"
on public.game_card_actual_results for select
to authenticated
using (true);

drop policy if exists "admins manage game card actual results"
on public.game_card_actual_results;

create policy "admins manage game card actual results"
on public.game_card_actual_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.game_card_actual_results to authenticated;
grant insert, update, delete on public.game_card_actual_results to authenticated;

drop policy if exists "users insert own predictions before fixture lock"
on public.predictions;

create policy "users insert own predictions before fixture lock"
on public.predictions for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
);

drop policy if exists "users update own predictions before fixture lock"
on public.predictions;

create policy "users update own predictions before fixture lock"
on public.predictions for update
to authenticated
using (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
)
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.fixtures f
    where f.id = predictions.fixture_id
      and (
        (
          predictions.prediction_slot = 'primary'
          and now() < f.prediction_locks_at
        )
        or (
          predictions.prediction_slot = 'hedge'
          and now() < f.prediction_locks_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_hedge'
          )
        )
        or (
          predictions.prediction_slot = 'power_of_god'
          and now() < f.second_half_deadline_at
          and exists (
            select 1
            from public.active_card_effects ace
            join public.card_definitions cd on cd.id = ace.card_id
            where ace.id = predictions.source_card_effect_id
              and ace.competition_id = predictions.competition_id
              and ace.played_by_user_id = predictions.user_id
              and ace.fixture_id = predictions.fixture_id
              and ace.status = 'active'
              and cd.effect_key = 'power_of_god'
          )
        )
      )
  )
);

create or replace view public.game_card_week_scores
with (security_invoker = true)
as
with scored as (
  select
    gcr.id as round_id,
    gcr.competition_id,
    gcr.season_id,
    gcr.card_id,
    gcr.round_number,
    gcp.gameweek_id,
    gw.number as gameweek_number,
    gcp.user_id,
    gcp.predicted_value,
    coalesce(gcrs.actual_value, gcar.actual_value) as actual_value,
    abs(gcp.predicted_value - coalesce(gcrs.actual_value, gcar.actual_value)) as difference
  from public.game_card_predictions gcp
  join public.game_card_rounds gcr on gcr.id = gcp.round_id
  join public.gameweeks gw on gw.id = gcp.gameweek_id
  left join public.game_card_results gcrs
    on gcrs.round_id = gcp.round_id
    and gcrs.gameweek_id = gcp.gameweek_id
  left join public.game_card_actual_results gcar
    on gcar.season_id = gcr.season_id
    and gcar.gameweek_id = gcp.gameweek_id
    and gcar.card_id = gcr.card_id
  where coalesce(gcrs.actual_value, gcar.actual_value) is not null
)
select
  scored.*,
  scored.difference = min(scored.difference) over (partition by round_id, gameweek_id) as is_weekly_winner
from scored;

create or replace view public.game_card_round_standings
with (security_invoker = true)
as
with standings as (
  select
    round_id,
    competition_id,
    season_id,
    card_id,
    round_number,
    user_id,
    count(distinct gameweek_id) as completed_gameweeks,
    count(*) filter (where is_weekly_winner) as weekly_wins,
    sum(difference) as total_difference
  from public.game_card_week_scores
  group by round_id, competition_id, season_id, card_id, round_number, user_id
),
ranked as (
  select
    standings.*,
    coalesce(gcrt.uc_points_at_tiebreak, 0) as uc_points_at_tiebreak,
    coalesce(gcrt.random_tiebreak_rank, 999999) as random_tiebreak_rank,
    row_number() over (
      partition by standings.round_id
      order by
        standings.total_difference asc,
        coalesce(gcrt.uc_points_at_tiebreak, 0) asc,
        coalesce(gcrt.random_tiebreak_rank, 999999) asc,
        standings.user_id asc
    ) as round_rank
  from standings
  left join public.game_card_round_tiebreaks gcrt
    on gcrt.round_id = standings.round_id
    and gcrt.user_id = standings.user_id
)
select
  ranked.*,
  ranked.round_rank = 1 as earns_super_medal
from ranked;

create or replace function public.ensure_league_card_decks(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_deck_variant text;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not (public.is_admin() or public.is_competition_member(target_competition_id)) then
    raise exception 'You are not a member of this private league.';
  end if;

  target_deck_variant := coalesce(
    target_competition.locked_deck_variant_id,
    target_competition.deck_variant_id,
    'players_2_3'
  );

  if not exists (
    select 1
    from public.league_cards
    where competition_id = target_competition_id
      and zone in ('regular_deck', 'premium_deck')
  ) then
    insert into public.league_cards (competition_id, card_id, zone, sort_order, source)
    select
      target_competition_id,
      cdc.card_id,
      case cd.deck_type
        when 'premium' then 'premium_deck'
        else 'regular_deck'
      end,
      row_number() over (order by random()),
      'deck_seed'
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    cross join lateral generate_series(1, cdc.quantity)
    where cdc.deck_variant_id = target_deck_variant
      and cd.deck_type in ('regular', 'premium');
  end if;
end;
$$;

create or replace function public.ensure_game_card_tiebreaks(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  insert into public.game_card_round_tiebreaks (
    round_id,
    user_id,
    uc_points_at_tiebreak,
    random_tiebreak_rank
  )
  select
    complete_rounds.round_id,
    complete_rounds.user_id,
    coalesce(lb.ultimate_champion_points, 0)::integer,
    row_number() over (partition by complete_rounds.round_id order by random())::integer
  from (
    select distinct
      gcr.id as round_id,
      cm.user_id
    from public.game_card_rounds gcr
    join public.competition_members cm
      on cm.competition_id = gcr.competition_id
    join public.gameweeks start_gw
      on start_gw.id = gcr.start_gameweek_id
    join public.gameweeks end_gw
      on end_gw.id = gcr.end_gameweek_id
    where gcr.competition_id = target_competition_id
      and (
        select count(distinct actuals.gameweek_id)
        from (
          select gcrs.gameweek_id
          from public.game_card_results gcrs
          where gcrs.round_id = gcr.id
          union
          select gcar.gameweek_id
          from public.game_card_actual_results gcar
          join public.gameweeks actual_gw
            on actual_gw.id = gcar.gameweek_id
            and actual_gw.season_id = gcr.season_id
          where gcar.season_id = gcr.season_id
            and gcar.card_id = gcr.card_id
            and actual_gw.number between start_gw.number and end_gw.number
        ) actuals
      ) >= (end_gw.number - start_gw.number + 1)
      and exists (
        select 1
        from public.game_card_predictions gcp
        where gcp.round_id = gcr.id
          and gcp.user_id = cm.user_id
      )
  ) complete_rounds
  left join public.leaderboard lb
    on lb.competition_id = target_competition_id
    and lb.user_id = complete_rounds.user_id
  on conflict (round_id, user_id) do nothing;
end;
$$;

create or replace function public.sync_my_card_draw_tokens(target_competition_id uuid)
returns table (
  regular_medals integer,
  super_medals integer,
  redeemed_regular_medals integer,
  redeemed_super_medals integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_user uuid := auth.uid();
  uc_threshold integer;
  smg_threshold integer;
  ranking public.leaderboard;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  select *
    into ranking
  from public.leaderboard
  where competition_id = target_competition_id
    and user_id = target_user;

  if ranking.user_id is not null then
    foreach uc_threshold in array array[20,40,60,80,100,125,150,175,200,225,250,275,300]
    loop
      if ranking.ultimate_champion_points >= uc_threshold then
        insert into public.card_draw_tokens (
          competition_id,
          season_id,
          user_id,
          token_type,
          deck_type,
          source_type,
          source_key
        )
        values (
          target_competition_id,
          target_competition.season_id,
          target_user,
          'regular_medal',
          'regular',
          'accolade',
          'uc_points_' || uc_threshold
        )
        on conflict do nothing;
      end if;
    end loop;

    foreach smg_threshold in array array[1,3,5,8,12,15,20]
    loop
      if ranking.star_man_goals >= smg_threshold then
        insert into public.card_draw_tokens (
          competition_id,
          season_id,
          user_id,
          token_type,
          deck_type,
          source_type,
          source_key
        )
        values (
          target_competition_id,
          target_competition.season_id,
          target_user,
          'regular_medal',
          'regular',
          'accolade',
          'star_man_goals_' || smg_threshold
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.ensure_game_card_tiebreaks(target_competition_id);

  insert into public.card_draw_tokens (
    competition_id,
    season_id,
    user_id,
    token_type,
    deck_type,
    source_type,
    source_game_card_round_id,
    source_key
  )
  select
    gcr.competition_id,
    gcr.season_id,
    target_user,
    'super_medal',
    'premium',
    'game_card',
    gcr.id,
    'game_card_round_' || gcr.id::text
  from public.game_card_round_standings gcs
  join public.game_card_rounds gcr on gcr.id = gcs.round_id
  where gcr.competition_id = target_competition_id
    and gcs.user_id = target_user
    and gcs.earns_super_medal = true
    and gcs.completed_gameweeks >= 5
  on conflict do nothing;

  return query
  select
    count(*) filter (where token_type = 'regular_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'regular_medal' and status = 'redeemed')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'redeemed')::integer
  from public.card_draw_tokens
  where competition_id = target_competition_id
    and user_id = target_user;
end;
$$;

create or replace function public.redeem_card_draw_token(
  target_competition_id uuid,
  target_deck_type text
)
returns table (
  card_instance_id uuid,
  card_id text,
  card_name text,
  deck_type text,
  regular_medals integer,
  super_medals integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_user uuid := auth.uid();
  token_row public.card_draw_tokens;
  card_row record;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if target_deck_type not in ('regular', 'premium') then
    raise exception 'Choose either the regular deck or premium deck.';
  end if;

  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  perform public.sync_my_card_draw_tokens(target_competition_id);
  perform public.ensure_league_card_decks(target_competition_id);

  select *
    into token_row
  from public.card_draw_tokens
  where competition_id = target_competition_id
    and user_id = target_user
    and deck_type = target_deck_type
    and status = 'available'
  order by created_at
  limit 1
  for update skip locked;

  if token_row.id is null then
    raise exception 'You do not have an available % medal.', target_deck_type;
  end if;

  select
    lc.id,
    lc.card_id,
    cd.name,
    cd.deck_type
    into card_row
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.competition_id = target_competition_id
    and lc.owner_user_id is null
    and lc.zone = case target_deck_type
      when 'premium' then 'premium_deck'
      else 'regular_deck'
    end
  order by random()
  limit 1
  for update skip locked;

  if card_row.id is null then
    raise exception 'The % deck is empty.', target_deck_type;
  end if;

  update public.card_draw_tokens
  set status = 'redeemed',
      redeemed_at = now()
  where id = token_row.id;

  update public.league_cards
  set owner_user_id = target_user,
      zone = 'hand',
      updated_at = now()
  where id = card_row.id;

  insert into public.card_draw_events (
    competition_id,
    season_id,
    user_id,
    token_id,
    card_instance_id,
    card_id,
    deck_type
  )
  values (
    target_competition_id,
    target_competition.season_id,
    target_user,
    token_row.id,
    card_row.id,
    card_row.card_id,
    target_deck_type
  );

  return query
  select
    card_row.id::uuid,
    card_row.card_id::text,
    card_row.name::text,
    target_deck_type::text,
    count(*) filter (where cdt.token_type = 'regular_medal' and cdt.status = 'available')::integer,
    count(*) filter (where cdt.token_type = 'super_medal' and cdt.status = 'available')::integer
  from public.card_draw_tokens cdt
  where cdt.competition_id = target_competition_id
    and cdt.user_id = target_user;
end;
$$;

create or replace function public.ensure_game_card_rounds(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  insert into public.game_card_rounds (
    competition_id,
    season_id,
    card_id,
    round_number,
    start_gameweek_id,
    end_gameweek_id,
    status
  )
  select
    target_competition_id,
    target_competition.season_id,
    game_cards.card_id,
    scheduled_rounds.round_number,
    scheduled_rounds.start_gameweek_id,
    scheduled_rounds.end_gameweek_id,
    'scheduled'
  from (
    select
      row_number() over (order by start_gw.number)::integer as round_number,
      start_gw.id as start_gameweek_id,
      end_gw.id as end_gameweek_id
    from unnest(array[1,6,11,16,21,26,31]) as schedule(start_number)
    join public.gameweeks start_gw
      on start_gw.season_id = target_competition.season_id
      and start_gw.number = schedule.start_number
    join public.gameweeks start_league_gw
      on start_league_gw.id = target_competition.starts_gameweek_id
      and start_league_gw.season_id = target_competition.season_id
    join public.gameweeks end_gw
      on end_gw.season_id = target_competition.season_id
      and end_gw.number = least(schedule.start_number + 4, 38)
    where start_gw.number >= start_league_gw.number
  ) scheduled_rounds
  join (
    select
      cd.id as card_id,
      row_number() over (order by md5(target_competition_id::text || cd.id))::integer as round_number
    from public.card_definitions cd
    where cd.deck_type = 'game'
  ) game_cards
    on game_cards.round_number = scheduled_rounds.round_number
  on conflict do nothing;

  with ordered_existing as (
    select
      gcr.id,
      row_number() over (order by gcr.round_number)::integer as card_order
    from public.game_card_rounds gcr
    where gcr.competition_id = target_competition_id
      and gcr.season_id = target_competition.season_id
      and gcr.status = 'scheduled'
  ),
  ordered_cards as (
    select
      cd.id as card_id,
      row_number() over (order by md5(target_competition_id::text || cd.id))::integer as card_order
    from public.card_definitions cd
    where cd.deck_type = 'game'
  )
  update public.game_card_rounds gcr
  set card_id = ordered_cards.card_id
  from ordered_existing
  join ordered_cards
    on ordered_cards.card_order = ordered_existing.card_order
  where gcr.id = ordered_existing.id;
end;
$$;

create or replace function public.ensure_competition_starter_cards(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  member_row record;
  starter_card_id uuid;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  perform public.ensure_league_card_decks(target_competition_id);

  for member_row in
    select cm.user_id
    from public.competition_members cm
    where cm.competition_id = target_competition_id
    order by cm.joined_at
  loop
    if not exists (
      select 1
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id = member_row.user_id
        and cd.category = 'power'
        and lc.source = 'starter_power'
    ) then
      select lc.id
        into starter_card_id
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'regular_deck'
        and cd.category = 'power'
      order by random()
      limit 1
      for update skip locked;

      if starter_card_id is not null then
        update public.league_cards
        set owner_user_id = member_row.user_id,
            zone = 'hand',
            source = 'starter_power',
            updated_at = now()
        where id = starter_card_id;
      end if;
    end if;

    starter_card_id := null;

    if not exists (
      select 1
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id = member_row.user_id
        and cd.category = 'curse'
        and lc.source = 'starter_curse'
    ) then
      select lc.id
        into starter_card_id
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'regular_deck'
        and cd.category = 'curse'
      order by random()
      limit 1
      for update skip locked;

      if starter_card_id is not null then
        update public.league_cards
        set owner_user_id = member_row.user_id,
            zone = 'hand',
            source = 'starter_curse',
            updated_at = now()
        where id = starter_card_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.discard_my_league_card(
  target_competition_id uuid,
  target_card_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  card_row public.league_cards;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  select *
    into card_row
  from public.league_cards
  where id = target_card_instance_id
    and competition_id = target_competition_id
  for update;

  if card_row.id is null then
    raise exception 'Card not found.';
  end if;

  if card_row.owner_user_id <> target_user or card_row.zone <> 'hand' then
    raise exception 'You can only discard cards from your own hand.';
  end if;

  update public.league_cards
  set zone = 'discard',
      updated_at = now()
  where id = target_card_instance_id;
end;
$$;

grant execute on function public.ensure_league_card_decks(uuid) to authenticated;
grant execute on function public.ensure_game_card_tiebreaks(uuid) to authenticated;
grant execute on function public.sync_my_card_draw_tokens(uuid) to authenticated;
grant execute on function public.redeem_card_draw_token(uuid, text) to authenticated;
grant execute on function public.ensure_game_card_rounds(uuid) to authenticated;
grant execute on function public.ensure_competition_starter_cards(uuid) to authenticated;
grant execute on function public.discard_my_league_card(uuid, uuid) to authenticated;

-- Card functionality completion pass.
-- Applies active card effects to scoring and adds RPC helpers for card-effect draws/steals.

create or replace view public.prediction_fixture_scores
with (security_invoker = true)
as
with effect_windows as (
  select
    ace.*,
    cd.effect_key,
    coalesce(sgw.number, direct_gw.number, 1) as start_number,
    coalesce(egw.number, sgw.number, direct_gw.number, 38) as end_number
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  left join public.gameweeks direct_gw on direct_gw.id = ace.gameweek_id
  left join public.gameweeks sgw on sgw.id = ace.start_gameweek_id
  left join public.gameweeks egw on egw.id = ace.end_gameweek_id
  where ace.status = 'active'
),
prediction_modes as (
  select
    psd.*,
    bool_or(prediction_slot in ('curse_hated', 'curse_gambler'))
      over (partition by competition_id, user_id, fixture_id) as has_curse_override,
    bool_or(prediction_slot = 'power_of_god')
      over (partition by competition_id, user_id, fixture_id) as has_power_of_god_override
  from public.prediction_score_details psd
),
considered_predictions as (
  select *
  from prediction_modes
  where
    (
      has_curse_override
      and prediction_slot in ('curse_hated', 'curse_gambler')
    )
    or (
      not has_curse_override
      and has_power_of_god_override
      and prediction_slot = 'power_of_god'
    )
    or (
      not has_curse_override
      and not has_power_of_god_override
      and prediction_slot in ('primary', 'hedge')
    )
),
adjusted_predictions as (
  select
    cp.*,
    case
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_deleted_match'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (ew.fixture_id is null or ew.fixture_id = cp.fixture_id)
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_glasses'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and cp.predicted_home_goals = 0
          and cp.predicted_away_goals = 0
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_even_number'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (mod(cp.predicted_home_goals, 2) <> 0 or mod(cp.predicted_away_goals, 2) <> 0)
      ) then 0
      when exists (
        select 1
        from effect_windows ew
        where ew.competition_id = cp.competition_id
          and ew.target_user_id = cp.user_id
          and ew.effect_key = 'curse_odd_number'
          and cp.gameweek_number between ew.start_number and ew.end_number
          and (mod(cp.predicted_home_goals, 2) <> 1 or mod(cp.predicted_away_goals, 2) <> 1)
      ) then 0
      else cp.points
    end as eligible_points,
    exists (
      select 1
      from effect_windows ew
      join public.match_results mr on mr.fixture_id = cp.fixture_id
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_laundrette'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and cp.is_correct_result = true
        and mr.had_clean_sheet = true
    ) as laundrette_applies,
    exists (
      select 1
      from effect_windows ew
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_pessimist'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and not exists (
          select 1
          from public.fixtures f
          left join public.match_results missing_mr on missing_mr.fixture_id = f.id
          where f.season_id = cp.season_id
            and f.gameweek_id = cp.gameweek_id
            and f.status <> 'postponed'
            and missing_mr.fixture_id is null
        )
        and not exists (
          select 1
          from public.fixtures f
          join public.match_results mr on mr.fixture_id = f.id
          where f.season_id = cp.season_id
            and f.gameweek_id = cp.gameweek_id
            and f.status <> 'postponed'
            and (mr.home_goals >= 3 or mr.away_goals >= 3)
        )
    ) as pessimist_applies,
    exists (
      select 1
      from effect_windows ew
      join public.fixture_game_stats fgs on fgs.fixture_id = cp.fixture_id
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'power_snow'
        and cp.gameweek_number between ew.start_number and ew.end_number
        and fgs.played_in_heavy_snow = true
    ) as snow_applies,
    exists (
      select 1
      from effect_windows ew
      where ew.competition_id = cp.competition_id
        and ew.played_by_user_id = cp.user_id
        and ew.effect_key = 'super_golden_gameweek'
        and cp.gameweek_number between ew.start_number and ew.end_number
    ) as golden_gameweek_applies
  from considered_predictions cp
)
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  fixture_id,
  bool_or(is_correct_score and eligible_points > 0) as is_correct_score,
  bool_or(is_correct_result and eligible_points > 0) as is_correct_result,
  max(
    eligible_points
    * case when laundrette_applies then 2 else 1 end
    * case when pessimist_applies then 2 else 1 end
    * case when snow_applies then 2 else 1 end
    * case when golden_gameweek_applies then 2 else 1 end
  )::integer as points
from adjusted_predictions
group by competition_id, user_id, season_id, gameweek_id, gameweek_number, fixture_id;

create or replace view public.star_man_score_details
with (security_invoker = true)
as
with effect_windows as (
  select
    ace.*,
    cd.effect_key,
    coalesce(sgw.number, direct_gw.number, 1) as start_number,
    coalesce(egw.number, sgw.number, direct_gw.number, 38) as end_number
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  left join public.gameweeks direct_gw on direct_gw.id = ace.gameweek_id
  left join public.gameweeks sgw on sgw.id = ace.start_gameweek_id
  left join public.gameweeks egw on egw.id = ace.end_gameweek_id
  where ace.status = 'active'
),
star_rows as (
  select
    smp.id as star_man_pick_id,
    smp.competition_id,
    smp.season_id,
    smp.gameweek_id,
    gw.number as gameweek_number,
    smp.user_id,
    smp.player_id,
    smp.pick_slot,
    coalesce(pgs.goals, 0) as goals,
    coalesce(pgs.assists, 0) as assists,
    coalesce(pgs.outside_box_goals, 0) as outside_box_goals,
    coalesce(pgs.outside_box_assists, 0) as outside_box_assists,
    coalesce(pgs.yellow_cards, 0) as yellow_cards,
    coalesce(pgs.red_cards, 0) as red_cards,
    p.nationality,
    p.height_cm,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_goal'
        and gw.number between ew.start_number and ew.end_number
    ) as power_goal_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_rocket_man'
        and gw.number between ew.start_number and ew.end_number
    ) as rocket_man_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_immigrants'
        and gw.number between ew.start_number and ew.end_number
        and p.nationality is not null
        and p.nationality <> 'England'
    ) as immigrants_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_lanky_crouch'
        and gw.number between ew.start_number and ew.end_number
        and coalesce(p.height_cm, 0) >= 185
    ) as lanky_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_small_and_mighty'
        and gw.number between ew.start_number and ew.end_number
        and coalesce(p.height_cm, 999) <= 175
    ) as small_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'power_assist_king'
        and gw.number between ew.start_number and ew.end_number
    ) as assist_king_applies,
    exists (
      select 1 from effect_windows ew
      where ew.competition_id = smp.competition_id
        and ew.played_by_user_id = smp.user_id
        and ew.effect_key = 'super_star_man'
        and gw.number between ew.start_number and ew.end_number
    ) as super_star_man_applies
  from public.star_man_picks smp
  join public.gameweeks gw on gw.id = smp.gameweek_id
  left join public.player_gameweek_stat_totals pgs
    on pgs.season_id = smp.season_id
    and pgs.gameweek_id = smp.gameweek_id
    and pgs.player_id = smp.player_id
  left join public.players p on p.id = smp.player_id
)
select
  star_man_pick_id,
  competition_id,
  season_id,
  gameweek_id,
  gameweek_number,
  user_id,
  player_id,
  pick_slot,
  goals,
  assists,
  yellow_cards,
  red_cards,
  (
    (
      (goals * 3)
      + assists
      + case when power_goal_applies then 3 else 0 end
      + case when rocket_man_applies then (outside_box_goals * 3) + outside_box_assists else 0 end
      + case when assist_king_applies then assists else 0 end
      - case when super_star_man_applies then 0 else yellow_cards end
      - case when super_star_man_applies then 0 else red_cards * 3 end
    )
    * case when immigrants_applies then 2 else 1 end
    * case when lanky_applies then 2 else 1 end
    * case when small_applies then 2 else 1 end
    * case when super_star_man_applies then 3 else 1 end
  )::integer as points
from star_rows;

create or replace function public.can_submit_star_man_pick(
  target_competition_id uuid,
  target_season_id uuid,
  target_gameweek_id bigint,
  target_user_id uuid,
  target_player_id uuid,
  target_pick_slot text,
  target_source_card_effect_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_user_id = auth.uid()
    and public.is_competition_member(target_competition_id)
    and exists (
      select 1
      from public.gameweeks gw
      where gw.id = target_gameweek_id
        and gw.season_id = target_season_id
        and (
          (
            target_pick_slot = 'primary'
            and (
              now() < public.star_man_lock_at_for_gameweek(target_season_id, target_gameweek_id)
              or exists (
                select 1
                from public.active_card_effects ace
                join public.card_definitions cd on cd.id = ace.card_id
                join public.players p on p.id = target_player_id
                join public.fixtures f
                  on f.season_id = target_season_id
                  and f.gameweek_id = target_gameweek_id
                where ace.id = target_source_card_effect_id
                  and ace.competition_id = target_competition_id
                  and ace.played_by_user_id = target_user_id
                  and ace.status = 'active'
                  and cd.effect_key in ('power_late_scout', 'super_sub')
                  and (ace.fixture_id is null or ace.fixture_id = f.id)
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
                  )
                  and now() < f.kickoff_at
              )
            )
          )
          or (
            target_pick_slot = 'super_duo'
            and now() < public.star_man_lock_at_for_gameweek(target_season_id, target_gameweek_id)
            and exists (
              select 1
              from public.active_card_effects ace
              join public.card_definitions cd on cd.id = ace.card_id
              where ace.id = target_source_card_effect_id
                and ace.competition_id = target_competition_id
                and ace.played_by_user_id = target_user_id
                and ace.status = 'active'
                and cd.effect_key = 'super_duo'
                and (ace.start_gameweek_id is null or ace.start_gameweek_id <= target_gameweek_id)
                and (ace.end_gameweek_id is null or ace.end_gameweek_id >= target_gameweek_id)
            )
          )
        )
    );
$$;

create or replace function public.sync_my_card_draw_tokens(target_competition_id uuid)
returns table (
  regular_medals integer,
  super_medals integer,
  redeemed_regular_medals integer,
  redeemed_super_medals integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_user uuid := auth.uid();
  uc_threshold integer;
  smg_threshold integer;
  ranking public.leaderboard;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;

  select *
    into ranking
  from public.leaderboard
  where competition_id = target_competition_id
    and user_id = target_user;

  if ranking.user_id is not null then
    foreach uc_threshold in array array[20,40,60,80,100,125,150,175,200,225,250,275,300]
    loop
      if ranking.ultimate_champion_points >= uc_threshold then
        insert into public.card_draw_tokens (
          competition_id,
          season_id,
          user_id,
          token_type,
          deck_type,
          source_type,
          source_key
        )
        values (
          target_competition_id,
          target_competition.season_id,
          target_user,
          'regular_medal',
          'regular',
          'accolade',
          'uc_points_' || uc_threshold
        )
        on conflict do nothing;
      end if;
    end loop;

    foreach smg_threshold in array array[1,3,5,8,12,15,20]
    loop
      if ranking.star_man_goals >= smg_threshold then
        insert into public.card_draw_tokens (
          competition_id,
          season_id,
          user_id,
          token_type,
          deck_type,
          source_type,
          source_key
        )
        values (
          target_competition_id,
          target_competition.season_id,
          target_user,
          'regular_medal',
          'regular',
          'accolade',
          'star_man_goals_' || smg_threshold
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.ensure_game_card_tiebreaks(target_competition_id);

  insert into public.card_draw_tokens (
    competition_id,
    season_id,
    user_id,
    token_type,
    deck_type,
    source_type,
    source_game_card_round_id,
    source_key
  )
  select
    gcr.competition_id,
    gcr.season_id,
    target_user,
    'super_medal',
    'premium',
    'game_card',
    gcr.id,
    'game_card_round_' || gcr.id::text
  from public.game_card_round_standings gcs
  join public.game_card_rounds gcr on gcr.id = gcs.round_id
  where gcr.competition_id = target_competition_id
    and gcs.user_id = target_user
    and gcs.earns_super_medal = true
    and gcs.completed_gameweeks >= 5
  on conflict do nothing;

  insert into public.card_draw_tokens (
    competition_id,
    season_id,
    user_id,
    token_type,
    deck_type,
    source_type,
    source_card_effect_id,
    source_key
  )
  select
    ace.competition_id,
    ace.season_id,
    target_user,
    'regular_medal',
    'regular',
    'card_effect',
    ace.id,
    'super_pen_' || ace.id::text || '_' || f.id::text || '_' || penalty_series.penalty_number::text
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  join public.gameweeks start_gw on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks end_gw on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks fixture_gw
    on fixture_gw.season_id = ace.season_id
    and fixture_gw.number between start_gw.number and end_gw.number
  join public.fixtures f
    on f.season_id = ace.season_id
    and f.gameweek_id = fixture_gw.id
  join public.fixture_game_stats fgs on fgs.fixture_id = f.id
  cross join lateral generate_series(1, coalesce(fgs.penalties_scored, 0)) as penalty_series(penalty_number)
  where ace.competition_id = target_competition_id
    and ace.played_by_user_id = target_user
    and ace.status = 'active'
    and cd.effect_key = 'super_pen'
  on conflict do nothing;

  return query
  select
    count(*) filter (where token_type = 'regular_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'available')::integer,
    count(*) filter (where token_type = 'regular_medal' and status = 'redeemed')::integer,
    count(*) filter (where token_type = 'super_medal' and status = 'redeemed')::integer
  from public.card_draw_tokens
  where competition_id = target_competition_id
    and user_id = target_user;
end;
$$;

create or replace function public.draw_regular_cards_for_effect(
  target_competition_id uuid,
  target_source_card_effect_id uuid,
  target_count integer
)
returns table (
  card_instance_id uuid,
  card_id text,
  card_name text,
  deck_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  effect_row record;
  draw_row record;
  drawn_count integer := 0;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  if target_count < 1 or target_count > 5 then
    raise exception 'Invalid draw count.';
  end if;

  select ace.*, cd.effect_key
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_source_card_effect_id
    and ace.competition_id = target_competition_id
    and ace.played_by_user_id = target_user
    and ace.status = 'active';

  if effect_row.id is null then
    raise exception 'Card effect not found.';
  end if;

  if effect_row.effect_key not in ('super_draw', 'power_swap', 'super_pen') then
    raise exception 'This card effect cannot draw regular cards.';
  end if;

  for draw_row in
    select lc.id, lc.card_id, cd.name, cd.deck_type
    from public.league_cards lc
    join public.card_definitions cd on cd.id = lc.card_id
    where lc.competition_id = target_competition_id
      and lc.owner_user_id is null
      and lc.zone = 'regular_deck'
    order by random()
    limit target_count
    for update skip locked
  loop
    update public.league_cards
    set owner_user_id = target_user,
        zone = 'hand',
        updated_at = now()
    where id = draw_row.id;

    insert into public.card_draw_events (
      competition_id,
      season_id,
      user_id,
      card_instance_id,
      card_id,
      deck_type,
      source_card_effect_id
    )
    values (
      target_competition_id,
      effect_row.season_id,
      target_user,
      draw_row.id,
      draw_row.card_id,
      'regular',
      target_source_card_effect_id
    );

    drawn_count := drawn_count + 1;
    card_instance_id := draw_row.id;
    card_id := draw_row.card_id;
    card_name := draw_row.name;
    deck_type := draw_row.deck_type;
    return next;
  end loop;

  if drawn_count < target_count then
    raise exception 'The Regular Deck does not have enough cards.';
  end if;

  if effect_row.effect_key in ('super_draw', 'power_swap') then
    update public.active_card_effects
    set status = 'resolved',
        resolved_at = now()
    where id = target_source_card_effect_id;
  end if;
end;
$$;

create or replace function public.steal_regular_card_from_opponent(
  target_competition_id uuid,
  target_source_card_effect_id uuid,
  target_card_instance_id uuid
)
returns table (
  card_instance_id uuid,
  card_id text,
  card_name text,
  previous_owner_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  effect_row record;
  stolen_row record;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select ace.*, cd.effect_key
    into effect_row
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  where ace.id = target_source_card_effect_id
    and ace.competition_id = target_competition_id
    and ace.played_by_user_id = target_user
    and ace.status = 'active';

  if effect_row.id is null or effect_row.effect_key <> 'curse_thief' then
    raise exception 'Curse of the Thief is not active.';
  end if;

  select lc.id, lc.card_id, lc.owner_user_id, cd.name, cd.deck_type, cd.category
    into stolen_row
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = target_card_instance_id
    and lc.competition_id = target_competition_id
    and lc.zone = 'hand'
  for update;

  if stolen_row.id is null then
    raise exception 'Card not found.';
  end if;

  if stolen_row.owner_user_id = target_user then
    raise exception 'You cannot steal your own card.';
  end if;

  if stolen_row.deck_type = 'premium' or stolen_row.category = 'super' then
    raise exception 'Curse of the Thief cannot steal Super Cards.';
  end if;

  update public.league_cards
  set owner_user_id = target_user,
      updated_at = now()
  where id = stolen_row.id;

  update public.active_card_effects
  set target_user_id = stolen_row.owner_user_id,
      status = 'resolved',
      resolved_at = now()
  where id = target_source_card_effect_id;

  card_instance_id := stolen_row.id;
  card_id := stolen_row.card_id;
  card_name := stolen_row.name;
  previous_owner_user_id := stolen_row.owner_user_id;
  return next;
end;
$$;

grant execute on function public.draw_regular_cards_for_effect(uuid, uuid, integer) to authenticated;
grant execute on function public.steal_regular_card_from_opponent(uuid, uuid, uuid) to authenticated;
