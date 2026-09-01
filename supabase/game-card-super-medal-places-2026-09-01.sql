-- Game Card Super Medal places and one-card Premium Deck redemption.
--
-- Completed five-Gameweek Game Cards award:
--   2-3 members:  1st = 1 Super Medal
--   4-6 members:  1st = 2 Super Medals
--   7-10 members: 1st = 2 Super Medals, 2nd = 1 Super Medal
--
-- Each Super Medal now redeems exactly one Super Card. A player cannot draw a
-- Super Card type already present in their hand. Existing leagues, rankings,
-- hands, draw history, available/redeemed medals and first-place UC bonuses are
-- preserved. Re-running this migration is safe.

begin;

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
  target_member_count integer;
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

  select least(10, greatest(2, coalesce(
    target_competition.locked_member_count,
    (select count(*)::integer
     from public.competition_members cm
     where cm.competition_id = target_competition_id)
  )))
  into target_member_count;

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
          competition_id, season_id, user_id, token_type, deck_type, source_type, source_key
        ) values (
          target_competition_id, target_competition.season_id, target_user,
          'regular_medal', 'regular', 'accolade', 'uc_points_' || uc_threshold
        )
        on conflict do nothing;
      end if;
    end loop;

    foreach smg_threshold in array array[1,3,5,8,12,15,20]
    loop
      if ranking.star_man_goals >= smg_threshold then
        insert into public.card_draw_tokens (
          competition_id, season_id, user_id, token_type, deck_type, source_type, source_key
        ) values (
          target_competition_id, target_competition.season_id, target_user,
          'regular_medal', 'regular', 'accolade', 'star_man_goals_' || smg_threshold
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.ensure_game_card_tiebreaks(target_competition_id);

  with eligible_rounds as (
    select
      gcr.id as round_id,
      gcr.competition_id,
      gcr.season_id,
      gcs.round_rank,
      case
        when gcs.round_rank = 1 and target_member_count <= 3 then 1
        when gcs.round_rank = 1 then 2
        when gcs.round_rank = 2 and target_member_count >= 7 then 1
        else 0
      end as medal_count
    from public.game_card_round_standings gcs
    join public.game_card_rounds gcr on gcr.id = gcs.round_id
    where gcr.competition_id = target_competition_id
      and gcs.user_id = target_user
      and gcs.completed_gameweeks >= 5
  ),
  awards as (
    select eligible.*, medal_number
    from eligible_rounds eligible
    cross join lateral generate_series(1, eligible.medal_count) as medal_number
    where eligible.medal_count > 0
  )
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
    awards.competition_id,
    awards.season_id,
    target_user,
    'super_medal',
    'premium',
    'game_card',
    awards.round_id,
    case
      -- Preserve the legacy key as medal one for the first-place player.
      when awards.round_rank = 1 and awards.medal_number = 1
        then 'game_card_round_' || awards.round_id::text
      else 'game_card_round_' || awards.round_id::text
        || '_rank_' || awards.round_rank::text
        || '_medal_' || awards.medal_number::text
    end
  from awards
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
    'super_pen_' || ace.id::text || '_' || fixture_gw.id::text || '_' || penalty_series.penalty_number::text
  from public.active_card_effects ace
  join public.card_definitions cd on cd.id = ace.card_id
  join public.gameweeks start_gw on start_gw.id = coalesce(ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks end_gw on end_gw.id = coalesce(ace.end_gameweek_id, ace.start_gameweek_id, ace.gameweek_id)
  join public.gameweeks fixture_gw
    on fixture_gw.season_id = ace.season_id
    and fixture_gw.number between start_gw.number and end_gw.number
  join public.game_card_actual_results gcar
    on gcar.season_id = ace.season_id
    and gcar.gameweek_id = fixture_gw.id
    and gcar.card_id = 'super_pen'
  cross join lateral generate_series(1, coalesce(gcar.actual_value, 0)::integer) as penalty_series(penalty_number)
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

create or replace function public.redeem_super_card_draw_token(target_competition_id uuid)
returns table (
  card_instance_id uuid,
  card_id text,
  card_name text,
  card_description text,
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
  selected_card_id uuid;
  selected_card_type text;
  updated_card_count integer;
begin
  if target_user is null then
    raise exception 'You must be logged in.';
  end if;

  select * into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;
  if not public.is_competition_member(target_competition_id) then
    raise exception 'You are not a member of this private league.';
  end if;
  if not public.league_card_draws_unlocked(target_competition_id) then
    raise exception 'Cards can only be drawn after Gameweek 1';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('prem_predics_super_draw:' || target_competition_id::text, 0)
  );

  perform public.sync_my_card_draw_tokens(target_competition_id);
  perform public.ensure_league_card_decks(target_competition_id);

  select * into token_row
  from public.card_draw_tokens cdt
  where cdt.competition_id = target_competition_id
    and cdt.user_id = target_user
    and cdt.deck_type = 'premium'
    and cdt.status = 'available'
  order by cdt.created_at, cdt.id
  limit 1
  for update skip locked;

  if token_row.id is null then
    raise exception 'You do not have an available premium medal.';
  end if;

  -- Exclude every Super Card type already in this player's live hand.
  select available.card_id
    into selected_card_type
  from public.league_cards available
  where available.competition_id = target_competition_id
    and available.owner_user_id is null
    and available.zone = 'premium_deck'
    and not exists (
      select 1
      from public.league_cards held
      join public.card_definitions held_definition on held_definition.id = held.card_id
      where held.competition_id = target_competition_id
        and held.owner_user_id = target_user
        and held.zone = 'hand'
        and held_definition.category = 'super'
        and held.card_id = available.card_id
    )
  group by available.card_id
  order by count(*) desc, random()
  limit 1;

  if selected_card_type is null then
    raise exception 'No eligible Super Card is available: you already hold every remaining Super Card type.';
  end if;

  select available.id
    into selected_card_id
  from public.league_cards available
  where available.competition_id = target_competition_id
    and available.owner_user_id is null
    and available.zone = 'premium_deck'
    and available.card_id = selected_card_type
  order by random()
  limit 1
  for update skip locked;

  if selected_card_id is null then
    raise exception 'The Premium Deck changed during this draw. No medal was used; please try again.';
  end if;

  update public.card_draw_tokens
  set status = 'redeemed', redeemed_at = now()
  where id = token_row.id;

  update public.league_cards
  set owner_user_id = target_user, zone = 'hand', updated_at = now()
  where id = selected_card_id
    and owner_user_id is null
    and zone = 'premium_deck';

  get diagnostics updated_card_count = row_count;
  if updated_card_count <> 1 then
    raise exception 'The Premium Deck changed during this draw. No medal or card was used; please try again.';
  end if;

  insert into public.card_draw_events (
    competition_id, season_id, user_id, token_id,
    card_instance_id, card_id, deck_type
  ) values (
    target_competition_id,
    target_competition.season_id,
    target_user,
    token_row.id,
    selected_card_id,
    selected_card_type,
    'premium'
  );

  return query
  select
    lc.id,
    cd.id::text,
    cd.name::text,
    cd.description::text,
    'premium'::text,
    (select count(*)::integer from public.card_draw_tokens cdt
      where cdt.competition_id = target_competition_id and cdt.user_id = target_user
        and cdt.token_type = 'regular_medal' and cdt.status = 'available'),
    (select count(*)::integer from public.card_draw_tokens cdt
      where cdt.competition_id = target_competition_id and cdt.user_id = target_user
        and cdt.token_type = 'super_medal' and cdt.status = 'available')
  from public.league_cards lc
  join public.card_definitions cd on cd.id = lc.card_id
  where lc.id = selected_card_id;
end;
$$;

-- Keep database-backed Game Card descriptions aligned with the live rules.
update public.card_definitions
set description = case id
  when 'game_goals' then 'Best-of-5 minigame: predict total goals each Gameweek. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_corners' then 'Best-of-5 minigame: predict total corners each Gameweek. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_underdog' then 'Best-of-5 minigame: predict teams beating a team above them. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_goalhanger' then 'Best-of-5 minigame: predict players scoring 2+ goals. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_war' then 'Best-of-5 minigame: predict total yellow cards. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_early_worm' then 'Best-of-5 minigame: predict the earliest goal minute. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  when 'game_time' then 'Best-of-5 minigame: predict total 90+ minute goals. The winner earns +1 UC point; Super Medals are awarded by league size and final place.'
  else description
end
where category = 'game';

revoke all on function public.sync_my_card_draw_tokens(uuid) from public;
grant execute on function public.sync_my_card_draw_tokens(uuid) to authenticated;
revoke all on function public.redeem_super_card_draw_token(uuid) from public;
grant execute on function public.redeem_super_card_draw_token(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Read-only audit: completed rounds and the Super Medal count each place earns.
select
  c.name as league_name,
  gcr.round_number,
  gcs.round_rank,
  p.display_name,
  case
    when gcs.round_rank = 1 and coalesce(c.locked_member_count, member_totals.member_count) <= 3 then 1
    when gcs.round_rank = 1 then 2
    when gcs.round_rank = 2 and coalesce(c.locked_member_count, member_totals.member_count) >= 7 then 1
    else 0
  end as super_medals_awarded
from public.game_card_round_standings gcs
join public.game_card_rounds gcr on gcr.id = gcs.round_id
join public.competitions c on c.id = gcr.competition_id
join public.profiles p on p.id = gcs.user_id
cross join lateral (
  select count(*)::integer as member_count
  from public.competition_members cm
  where cm.competition_id = c.id
) member_totals
where gcs.completed_gameweeks >= 5
order by c.name, gcr.round_number, gcs.round_rank, p.display_name;
