drop policy if exists "users delete own game card predictions before gameweek lock"
on public.game_card_predictions;

create policy "users delete own game card predictions before gameweek lock"
on public.game_card_predictions for delete
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_card_rounds gcr
    join public.gameweeks gw on gw.id = game_card_predictions.gameweek_id
    where gcr.id = game_card_predictions.round_id
      and public.is_competition_member(gcr.competition_id)
      and now() < public.star_man_lock_at_for_gameweek(gcr.season_id, game_card_predictions.gameweek_id)
  )
);

grant delete on public.game_card_predictions to authenticated;
