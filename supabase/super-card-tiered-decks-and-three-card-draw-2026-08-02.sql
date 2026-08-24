-- Super Card tiers, live league deck reconciliation, late Super Duo timing,
-- and atomic three-card Super Medal redemption.
-- Run once in the Supabase SQL Editor.

begin;

with variants(deck_variant_id, member_count) as (
  values
    ('players_2', 2), ('players_3', 3), ('players_4', 4),
    ('players_5', 5), ('players_6', 6), ('players_7', 7),
    ('players_8', 8), ('players_9', 9), ('players_10', 10)
), super_cards(card_id) as (
  values
    ('super_star_man'), ('super_golden_gameweek'), ('super_sub'),
    ('super_score'), ('super_draw'), ('super_duo'), ('super_pen')
)
insert into public.card_deck_cards (deck_variant_id, card_id, quantity)
select
  variants.deck_variant_id,
  super_cards.card_id,
  case
    when variants.member_count <= 3 then 1
    when variants.member_count <= 6 then 2
    else 3
  end
from variants
cross join super_cards
on conflict (deck_variant_id, card_id) do update
set quantity = excluded.quantity;

update public.card_definitions
set description = case id
  when 'super_star_man' then 'Can only be played after you have saved a Star Man for this Gameweek. Star Man points are tripled; yellow and red cards are 0 points. Valid for 1 Gameweek.'
  when 'super_golden_gameweek' then 'Prediction League points for all games are doubled. Valid for 1 Gameweek.'
  when 'super_sub' then 'Star Man can be swapped at any time for any other Star Man whose first game in the Gameweek has not kicked-off. Yellow Cards and Red Cards don''t earn negative points. Curse Cards don''t apply on the Super Sub, Power Cards Apply. Valid for 1 Gameweek.'
  when 'super_score' then 'Choose one scoreline before the Gameweek''s first kick-off. Every game with this scoreline (Home vs Away) will earn +3 UC pts. Valid for 1 Gameweek.'
  when 'super_draw' then 'Draw 5 Regular Cards from the Regular Deck. Valid for 1 Gameweek.'
  when 'super_duo' then 'Choose a 2nd Star Man for this Gameweek. The Duo player can be chosen or changed until that player''s team''s first match in the Gameweek kicks off. They cannot be the same player as your main Star Man. Valid for 1 Gameweek.'
  when 'super_pen' then 'Gain 1 Medal any time a penalty is scored in the Gameweek. Valid for 1 Gameweek.'
end || ' Deck count: 1 card in 2-3 player leagues, 2 cards in 4-6 player leagues, and 3 cards in 7-10 player leagues.'
where id in (
  'super_star_man', 'super_golden_gameweek', 'super_sub',
  'super_score', 'super_draw', 'super_duo', 'super_pen'
);

create or replace function public.ensure_league_card_decks(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  target_deck_variant text;
  target_member_count integer;
begin
  select * into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  if auth.uid() is not null
    and not (public.is_admin() or public.is_competition_member(target_competition_id)) then
    raise exception 'You are not a member of this private league.';
  end if;

  select greatest(
    count(*)::integer,
    coalesce(target_competition.locked_member_count, 0),
    2
  ) into target_member_count
  from public.competition_members
  where competition_id = target_competition_id;

  target_deck_variant := coalesce(
    public.deck_variant_for_member_count(least(10, greatest(2, target_member_count))),
    target_competition.locked_deck_variant_id,
    target_competition.deck_variant_id,
    'players_2'
  );

  -- Membership growth only adds balanced deficits; existing cards are retained.
  insert into public.league_cards (competition_id, card_id, zone, sort_order, source)
  select
    target_competition_id,
    missing.card_id,
    case missing.deck_type when 'premium' then 'premium_deck' else 'regular_deck' end,
    coalesce((select max(sort_order) from public.league_cards where competition_id = target_competition_id), 0)
      + row_number() over (order by missing.card_id, copies.copy_number),
    'deck_top_up_' || target_deck_variant
  from (
    select
      cdc.card_id,
      cd.deck_type,
      greatest(cdc.quantity - count(lc.id), 0)::integer as missing_count
    from public.card_deck_cards cdc
    join public.card_definitions cd on cd.id = cdc.card_id
    left join public.league_cards lc
      on lc.competition_id = target_competition_id
     and lc.card_id = cdc.card_id
    where cdc.deck_variant_id = target_deck_variant
      and cd.deck_type in ('regular', 'premium')
    group by cdc.card_id, cd.deck_type, cdc.quantity
  ) missing
  cross join lateral generate_series(1, missing.missing_count) copies(copy_number)
  where missing.missing_count > 0;
end;
$$;

create or replace function public.sync_competition_decks_after_member_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_league_card_decks(new.competition_id);
  return new;
end;
$$;

drop trigger if exists competition_members_sync_card_decks on public.competition_members;
create trigger competition_members_sync_card_decks
after insert on public.competition_members
for each row execute function public.sync_competition_decks_after_member_join();

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
  selected_card record;
  selected_ids uuid[] := array[]::uuid[];
  member_count integer;
  draw_count integer;
  available_type_count integer;
  selected_type_count integer;
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

  -- Serialize Premium Deck redemptions inside each league so two simultaneous
  -- medal uses cannot select the same card instances or upset deck balance.
  perform pg_advisory_xact_lock(
    hashtextextended('prem_predics_super_draw:' || target_competition_id::text, 0)
  );

  perform public.sync_my_card_draw_tokens(target_competition_id);
  perform public.ensure_league_card_decks(target_competition_id);

  select count(*)::integer into member_count
  from public.competition_members cm
  where cm.competition_id = target_competition_id;

  draw_count := case
    when member_count <= 3 then 1
    when member_count <= 6 then 2
    else 3
  end;

  select * into token_row
  from public.card_draw_tokens cdt
  where cdt.competition_id = target_competition_id
    and cdt.user_id = target_user
    and cdt.deck_type = 'premium'
    and cdt.status = 'available'
  order by cdt.created_at
  limit 1
  for update skip locked;

  if token_row.id is null then
    raise exception 'You do not have an available premium medal.';
  end if;

  select count(distinct lc.card_id)::integer
    into available_type_count
  from public.league_cards lc
  where lc.competition_id = target_competition_id
    and lc.owner_user_id is null
    and lc.zone = 'premium_deck';

  if available_type_count < draw_count then
    raise exception 'The Premium Deck does not contain % different Super Card types for this draw.', draw_count;
  end if;

  for selected_card in
    with selected_types as materialized (
      select lc.card_id
      from public.league_cards lc
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'premium_deck'
      group by lc.card_id
      order by count(*) desc, random()
      limit draw_count
    )
    select picked.id
    from selected_types selected_type
    cross join lateral (
      select lc.id
      from public.league_cards lc
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'premium_deck'
        and lc.card_id = selected_type.card_id
      order by random()
      limit 1
      for update skip locked
    ) picked
  loop
    selected_ids := array_append(selected_ids, selected_card.id);
  end loop;

  if cardinality(selected_ids) <> draw_count then
    raise exception 'The Super Card deck does not contain the % card(s) required for this league size.', draw_count;
  end if;

  select count(distinct lc.card_id)::integer
    into selected_type_count
  from public.league_cards lc
  where lc.id = any(selected_ids);

  if selected_type_count <> draw_count then
    raise exception 'A Super Medal draw cannot contain duplicate Super Card types.';
  end if;

  update public.card_draw_tokens
  set status = 'redeemed', redeemed_at = now()
  where id = token_row.id;

  update public.league_cards
  set owner_user_id = target_user, zone = 'hand', updated_at = now()
  where id = any(selected_ids)
    and owner_user_id is null
    and zone = 'premium_deck';

  get diagnostics updated_card_count = row_count;
  if updated_card_count <> draw_count then
    raise exception 'The Premium Deck changed during this draw. No medal or cards were used; please try again.';
  end if;

  insert into public.card_draw_events (
    competition_id, season_id, user_id, token_id,
    card_instance_id, card_id, deck_type
  )
  select
    target_competition_id,
    target_competition.season_id,
    target_user,
    token_row.id,
    lc.id,
    lc.card_id,
    'premium'
  from public.league_cards lc
  where lc.id = any(selected_ids);

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
  where lc.id = any(selected_ids)
  order by array_position(selected_ids, lc.id);
end;
$$;

revoke all on function public.redeem_super_card_draw_token(uuid) from public;
grant execute on function public.redeem_super_card_draw_token(uuid) to authenticated;

-- The dedicated guard uses the final fixture kickoff, while the existing generic
-- deadline trigger is amended to exempt Super Duo from the 90-minute lock.
create or replace function public.guard_super_duo_final_kickoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_effect_key text;
  target_gameweek_id bigint;
begin
  select effect_key into target_effect_key
  from public.card_definitions
  where id = new.card_id;

  if target_effect_key <> 'super_duo' or public.is_admin() then
    return new;
  end if;

  target_gameweek_id := coalesce(new.start_gameweek_id, new.gameweek_id);
  if not exists (
    select 1
    from public.fixtures f
    where f.season_id = new.season_id
      and f.gameweek_id = target_gameweek_id
      and lower(coalesce(f.status, '')) <> 'postponed'
      and f.kickoff_at > now()
  ) then
    raise exception 'Super Duo cannot be played if all matches in the gameweek have Kicked-Off';
  end if;

  return new;
end;
$$;

drop trigger if exists aaa_guard_super_duo_final_kickoff on public.active_card_effects;
create trigger aaa_guard_super_duo_final_kickoff
before insert on public.active_card_effects
for each row execute function public.guard_super_duo_final_kickoff();

do $$
declare
  function_sql text;
  function_sql_lower text;
  updated_sql text;
  deadline_anchor integer;
  exemption_start integer;
  exemption_end integer;
  exemption_clause text;
  super_sub_position integer;
  insertion_text text;
begin
  function_sql := pg_get_functiondef('public.enforce_card_play_deadline()'::regprocedure);
  function_sql_lower := lower(function_sql);

  -- Locate the deadline-exemption list after the first-kickoff lookup instead
  -- of relying on the whitespace used when the function was created.
  deadline_anchor := strpos(function_sql_lower, 'select min(kickoff_at)');
  if deadline_anchor = 0 then
    raise exception 'Could not locate the first-kickoff lookup in enforce_card_play_deadline().';
  end if;

  exemption_start := strpos(
    substring(function_sql_lower from deadline_anchor),
    'if card_row.effect_key in ('
  );
  if exemption_start = 0 then
    raise exception 'Could not locate the deadline exemption list in enforce_card_play_deadline().';
  end if;
  exemption_start := deadline_anchor + exemption_start - 1;

  exemption_end := strpos(
    substring(function_sql_lower from exemption_start),
    ') then'
  );
  if exemption_end = 0 then
    raise exception 'Could not locate the end of the deadline exemption list.';
  end if;
  exemption_end := exemption_start + exemption_end + length(') then') - 2;

  exemption_clause := substring(
    function_sql from exemption_start for exemption_end - exemption_start + 1
  );

  if lower(exemption_clause) not like '%''super_duo''%' then
    super_sub_position := strpos(lower(exemption_clause), '''super_sub''');
    if super_sub_position = 0 then
      raise exception 'Could not locate Super Sub in the deadline exemption list.';
    end if;

    insertion_text := case
      when strpos(exemption_clause, E'\n') > 0
        then E',\n    ''super_duo'''
      else ', ''super_duo'''
    end;

    exemption_clause := overlay(
      exemption_clause
      placing insertion_text
      from super_sub_position + length('''super_sub''')
      for 0
    );
    updated_sql := overlay(
      function_sql
      placing exemption_clause
      from exemption_start
      for exemption_end - exemption_start + 1
    );
    execute updated_sql;
  end if;
end;
$$;

-- Reconcile every existing league once. This is idempotent and adds only deficits.
do $$
declare
  competition_row record;
begin
  for competition_row in select id from public.competitions loop
    perform public.ensure_league_card_decks(competition_row.id);
  end loop;
end;
$$;

commit;
