-- Correct Super Medal redemption to match the league-size tier:
--   2-3 members: 1 Super Card
--   4-6 members: 2 Super Cards
--   7-10 members: 3 Super Cards
--
-- This is safe to run after super-card-tiered-decks-and-three-card-draw-2026-08-02.sql.

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

  for selected_card in
    select lc.id
    from public.league_cards lc
    where lc.competition_id = target_competition_id
      and lc.owner_user_id is null
      and lc.zone = 'premium_deck'
    order by random()
    limit draw_count
    for update skip locked
  loop
    selected_ids := array_append(selected_ids, selected_card.id);
  end loop;

  if cardinality(selected_ids) <> draw_count then
    raise exception 'The Super Card deck does not contain the % card(s) required for this league size.', draw_count;
  end if;

  update public.card_draw_tokens
  set status = 'redeemed', redeemed_at = now()
  where id = token_row.id;

  update public.league_cards
  set owner_user_id = target_user, zone = 'hand', updated_at = now()
  where id = any(selected_ids);

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

commit;
