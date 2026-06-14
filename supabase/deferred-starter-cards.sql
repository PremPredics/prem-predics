-- Delay starter card dealing until the first league gameweek has passed.
--
-- Run this once in Supabase SQL Editor.

begin;

create or replace function public.ensure_competition_starter_cards(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition public.competitions;
  member_row record;
  starter_power_card_id uuid;
  starter_curse_card_id uuid;
  first_card_id uuid;
  second_card_id uuid;
  first_source text;
  second_source text;
  starter_unlock_at timestamptz;
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

  update public.league_cards
  set source = source || ':' || owner_user_id::text
  where competition_id = target_competition_id
    and owner_user_id is not null
    and source in ('starter_power', 'starter_curse');

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

  if starter_unlock_at is null or now() < starter_unlock_at then
    return;
  end if;

  for member_row in
    select cm.user_id
    from public.competition_members cm
    where cm.competition_id = target_competition_id
    order by cm.joined_at
  loop
    starter_power_card_id := null;
    starter_curse_card_id := null;
    first_card_id := null;
    second_card_id := null;
    first_source := null;
    second_source := null;

    if not exists (
      select 1
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and cd.category = 'power'
        and lc.source = 'starter_power:' || member_row.user_id::text
    ) then
      select lc.id
        into starter_power_card_id
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'regular_deck'
        and cd.category = 'power'
      order by random()
      limit 1
      for update skip locked;
    end if;

    if not exists (
      select 1
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and cd.category = 'curse'
        and lc.source = 'starter_curse:' || member_row.user_id::text
    ) then
      select lc.id
        into starter_curse_card_id
      from public.league_cards lc
      join public.card_definitions cd on cd.id = lc.card_id
      where lc.competition_id = target_competition_id
        and lc.owner_user_id is null
        and lc.zone = 'regular_deck'
        and cd.category = 'curse'
      order by random()
      limit 1
      for update skip locked;
    end if;

    if starter_power_card_id is not null and starter_curse_card_id is not null and random() < 0.5 then
      first_card_id := starter_curse_card_id;
      first_source := 'starter_curse:' || member_row.user_id::text;
      second_card_id := starter_power_card_id;
      second_source := 'starter_power:' || member_row.user_id::text;
    else
      first_card_id := starter_power_card_id;
      first_source := 'starter_power:' || member_row.user_id::text;
      second_card_id := starter_curse_card_id;
      second_source := 'starter_curse:' || member_row.user_id::text;
    end if;

    if first_card_id is not null then
      update public.league_cards
      set owner_user_id = member_row.user_id,
          zone = 'hand',
          source = first_source,
          updated_at = now()
      where id = first_card_id;
    end if;

    if second_card_id is not null then
      update public.league_cards
      set owner_user_id = member_row.user_id,
          zone = 'hand',
          source = second_source,
          updated_at = now() + interval '1 millisecond'
      where id = second_card_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.ensure_competition_starter_cards(uuid) to authenticated;

commit;
