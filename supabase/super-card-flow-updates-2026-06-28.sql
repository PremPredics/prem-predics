-- Super-card flow updates:
-- - Super Draw now draws 5 Regular cards.
-- - Super Score and Super Duo use first-kickoff timing.
-- - Super Score / Super Duo deck counts are 1 copy for 2-5 player leagues,
--   and 2 copies for 6-10 player leagues.
-- - Super Duo Star Man saves are allowed until the Duo player's team's first
--   fixture kicks off in that Gameweek.

begin;

update public.card_definitions
set description = case id
  when 'super_sub' then 'Star Man can be swapped at any time for any other Star Man whose first game in the Gameweek has not kicked-off. Yellow Cards and Red Cards don''t earn negative points. Curse Cards don''t apply on the Super Sub, Power Cards Apply.'
  when 'super_score' then 'Choose one scoreline before the Gameweek''s first kick-off. Every game with this scoreline (Home vs Away) will earn +3 UC pts. Valid for 1 Gameweek. Deck count: 1 card in 2-5 player leagues, 2 cards in 6-10 player leagues.'
  when 'super_draw' then 'Draw 5 Regular Cards from the Regular Deck.'
  when 'super_duo' then 'Choose a 2nd Star Man for this Gameweek. The Duo player can be chosen or changed until that player''s team''s first match in the Gameweek kicks off. They cannot be the same player as your main Star Man. Valid for 1 Gameweek. Deck count: 1 card in 2-5 player leagues, 2 cards in 6-10 player leagues.'
  else description
end
where id in ('super_sub', 'super_score', 'super_draw', 'super_duo');

update public.card_deck_cards cdc
set quantity = case
  when cdv.min_members >= 6 then 2
  else 1
end
from public.card_deck_variants cdv
where cdc.deck_variant_id = cdv.id
  and cdc.card_id in ('super_score', 'super_duo');

create or replace function public.first_fixture_kickoff_at_for_gameweek(
  target_season_id uuid,
  target_gameweek_id bigint
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select min(f.kickoff_at)
      from public.fixtures f
      where f.season_id = target_season_id
        and f.gameweek_id = target_gameweek_id
        and f.status <> 'postponed'
    ),
    (
      select gw.star_man_locks_at + interval '90 minutes'
      from public.gameweeks gw
      where gw.season_id = target_season_id
        and gw.id = target_gameweek_id
    )
  );
$$;

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
            and exists (
              select 1
              from public.players p
              join public.fixtures f
                on f.season_id = target_season_id
                and f.gameweek_id = target_gameweek_id
                and f.status <> 'postponed'
              where p.id = target_player_id
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
            )
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
                  and f.kickoff_at = (
                    select min(f2.kickoff_at)
                    from public.fixtures f2
                    where f2.season_id = target_season_id
                      and f2.gameweek_id = target_gameweek_id
                      and f2.status <> 'postponed'
                      and (
                        p.team_id in (f2.home_team_id, f2.away_team_id)
                        or exists (
                          select 1
                          from public.player_team_assignments pta2
                          where pta2.player_id = target_player_id
                            and pta2.season_id = target_season_id
                            and pta2.team_id in (f2.home_team_id, f2.away_team_id)
                            and pta2.starts_gameweek_id <= target_gameweek_id
                            and (pta2.ends_gameweek_id is null or pta2.ends_gameweek_id >= target_gameweek_id)
                        )
                      )
                  )
                  and now() < f.kickoff_at
              )
            )
          )
          or (
            target_pick_slot = 'super_duo'
            and not exists (
              select 1
              from public.star_man_picks smp
              where smp.competition_id = target_competition_id
                and smp.gameweek_id = target_gameweek_id
                and smp.user_id = target_user_id
                and smp.pick_slot = 'primary'
                and smp.player_id = target_player_id
            )
            and exists (
              select 1
              from public.active_card_effects ace
              join public.card_definitions cd on cd.id = ace.card_id
              join public.players p on p.id = target_player_id
              join public.fixtures f
                on f.season_id = target_season_id
                and f.gameweek_id = target_gameweek_id
                and f.status <> 'postponed'
              where ace.id = target_source_card_effect_id
                and ace.competition_id = target_competition_id
                and ace.played_by_user_id = target_user_id
                and ace.status = 'active'
                and cd.effect_key = 'super_duo'
                and (ace.start_gameweek_id is null or ace.start_gameweek_id <= target_gameweek_id)
                and (ace.end_gameweek_id is null or ace.end_gameweek_id >= target_gameweek_id)
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
                and f.kickoff_at = (
                  select min(f2.kickoff_at)
                  from public.fixtures f2
                  where f2.season_id = target_season_id
                    and f2.gameweek_id = target_gameweek_id
                    and f2.status <> 'postponed'
                    and (
                      p.team_id in (f2.home_team_id, f2.away_team_id)
                      or exists (
                        select 1
                        from public.player_team_assignments pta2
                        where pta2.player_id = target_player_id
                          and pta2.season_id = target_season_id
                          and pta2.team_id in (f2.home_team_id, f2.away_team_id)
                          and pta2.starts_gameweek_id <= target_gameweek_id
                          and (pta2.ends_gameweek_id is null or pta2.ends_gameweek_id >= target_gameweek_id)
                      )
                    )
                )
                and now() < f.kickoff_at
            )
          )
        )
    );
$$;

drop policy if exists "super score picks visible to owner admin or after gameweek lock" on public.super_score_picks;
drop policy if exists "super score picks visible to owner admin or after first kickoff" on public.super_score_picks;
drop policy if exists "users insert own super score pick before gameweek lock" on public.super_score_picks;
drop policy if exists "users insert own super score pick before first kickoff" on public.super_score_picks;
drop policy if exists "users update own super score pick before gameweek lock" on public.super_score_picks;
drop policy if exists "users update own super score pick before first kickoff" on public.super_score_picks;

create policy "super score picks visible to owner admin or after first kickoff"
on public.super_score_picks for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or (
    public.is_competition_member(competition_id)
    and exists (
      select 1
      from public.gameweeks gw
      where gw.id = super_score_picks.gameweek_id
        and gw.season_id = super_score_picks.season_id
        and now() >= public.first_fixture_kickoff_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
    )
  )
);

create policy "users insert own super score pick before first kickoff"
on public.super_score_picks for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and gw.season_id = super_score_picks.season_id
      and now() < public.first_fixture_kickoff_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = super_score_picks.card_effect_id
      and ace.competition_id = super_score_picks.competition_id
      and ace.played_by_user_id = super_score_picks.user_id
      and cd.effect_key = 'super_score'
  )
);

create policy "users update own super score pick before first kickoff"
on public.super_score_picks for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and gw.season_id = super_score_picks.season_id
      and now() < public.first_fixture_kickoff_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
)
with check (
  auth.uid() = user_id
  and public.is_competition_member(competition_id)
  and exists (
    select 1
    from public.gameweeks gw
    where gw.id = super_score_picks.gameweek_id
      and gw.season_id = super_score_picks.season_id
      and now() < public.first_fixture_kickoff_at_for_gameweek(super_score_picks.season_id, super_score_picks.gameweek_id)
  )
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = super_score_picks.card_effect_id
      and ace.competition_id = super_score_picks.competition_id
      and ace.played_by_user_id = super_score_picks.user_id
      and cd.effect_key = 'super_score'
  )
);

grant execute on function public.first_fixture_kickoff_at_for_gameweek(uuid, bigint) to authenticated;
grant execute on function public.can_submit_star_man_pick(uuid, uuid, bigint, uuid, uuid, text, uuid) to authenticated;

commit;
