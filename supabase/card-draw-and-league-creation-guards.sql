-- Guards for late-season league creation and medal card draws before a league's first week is over.
-- Run this once in Supabase SQL Editor after deploying the matching site/app changes.

create or replace function public.league_card_draws_unlocked(target_competition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  starter_unlock_at timestamptz;
  starter_gameweek_complete boolean := false;
begin
  select *
    into target_competition
  from public.competitions
  where id = target_competition_id;

  if target_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  select next_deadline.first_fixture_kickoff_at
    into starter_unlock_at
  from public.gameweek_deadlines start_deadline
  left join lateral (
    select gd.first_fixture_kickoff_at
    from public.gameweek_deadlines gd
    where gd.season_id = target_competition.season_id
      and gd.gameweek_number > start_deadline.gameweek_number
      and gd.first_fixture_kickoff_at is not null
    order by gd.gameweek_number
    limit 1
  ) next_deadline on true
  where start_deadline.season_id = target_competition.season_id
    and start_deadline.gameweek_id = target_competition.starts_gameweek_id;

  if starter_unlock_at is null then
    select start_deadline.first_fixture_kickoff_at + interval '7 days'
      into starter_unlock_at
    from public.gameweek_deadlines start_deadline
    where start_deadline.season_id = target_competition.season_id
      and start_deadline.gameweek_id = target_competition.starts_gameweek_id
      and start_deadline.first_fixture_kickoff_at is not null;
  end if;

  select exists (
      select 1
      from public.fixtures f
      where f.season_id = target_competition.season_id
        and f.gameweek_id = target_competition.starts_gameweek_id
        and f.status <> 'postponed'
    )
    and not exists (
      select 1
      from public.fixtures f
      where f.season_id = target_competition.season_id
        and f.gameweek_id = target_competition.starts_gameweek_id
        and f.status <> 'postponed'
        and f.status <> 'final'
    )
    into starter_gameweek_complete;

  return starter_gameweek_complete
    or (starter_unlock_at is not null and now() >= starter_unlock_at);
end;
$$;

grant execute on function public.league_card_draws_unlocked(uuid) to authenticated;

create or replace function public.prevent_late_season_competition_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_gameweek_number integer;
begin
  select number
    into start_gameweek_number
  from public.gameweeks
  where id = new.starts_gameweek_id;

  if coalesce(start_gameweek_number, 0) >= 37 then
    raise exception 'Leagues cannot be created in the final 2 Gameweeks of the Season.';
  end if;

  return new;
end;
$$;

drop trigger if exists competitions_prevent_late_season_creation on public.competitions;
create trigger competitions_prevent_late_season_creation
before insert on public.competitions
for each row
execute function public.prevent_late_season_competition_creation();

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

  if not public.league_card_draws_unlocked(target_competition_id) then
    raise exception 'Cards can only be drawn after Gameweek 1';
  end if;

  perform public.sync_my_card_draw_tokens(target_competition_id);
  perform public.ensure_league_card_decks(target_competition_id);

  select *
    into token_row
  from public.card_draw_tokens cdt
  where cdt.competition_id = target_competition_id
    and cdt.user_id = target_user
    and cdt.deck_type = target_deck_type
    and cdt.status = 'available'
  order by cdt.created_at
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

grant execute on function public.redeem_card_draw_token(uuid, text) to authenticated;
