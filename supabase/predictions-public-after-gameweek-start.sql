drop policy if exists "predictions visible to owner admin or after lock"
on public.predictions;

create policy "predictions visible to owner admin or after lock"
on public.predictions for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or (
    public.is_competition_member(competition_id)
    and exists (
      select 1
      from public.fixtures f
      where f.id = predictions.fixture_id
        and now() >= (
          select min(gwf.kickoff_at)
          from public.fixtures gwf
          where gwf.season_id = f.season_id
            and gwf.gameweek_id = f.gameweek_id
            and gwf.status <> 'postponed'
        )
    )
  )
);
