-- Guarantee that every multi-card Super Medal reward contains different
-- Super Card types:
--   2-3 league members: 1 Super Card
--   4-6 league members: 2 different Super Cards
--   7-10 league members: 3 different Super Cards
--
-- Run once in the Supabase SQL Editor. This replaces one function only. It
-- does not delete or rewrite leagues, existing hands, medals, or draw history.

begin;

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

  -- Take one physical card from each chosen type. Types with the most copies
  -- remaining are selected first, with random ordering between equal counts.
  -- That keeps later medal draws balanced and prevents the final player from
  -- being left with several copies of only one Super Card type.
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
    raise exception 'The Premium Deck does not contain the % different card(s) required for this league size.', draw_count;
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

notify pgrst, 'reload schema';

commit;

-- Read-only confirmation: should return one row with the function name.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'redeem_super_card_draw_token';
