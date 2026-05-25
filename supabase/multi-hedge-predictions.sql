-- Enables multiple Power of the Hedge predictions for the same fixture.
-- Run this once in Supabase after deploying the frontend change.

alter table public.predictions drop constraint if exists predictions_prediction_slot_check;

alter table public.predictions
  add constraint predictions_prediction_slot_check
  check (
    prediction_slot in ('primary', 'hedge', 'power_of_god', 'curse_hated', 'curse_gambler')
    or prediction_slot ~ '^hedge_[0-9]+$'
  );

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
          (predictions.prediction_slot = 'hedge' or predictions.prediction_slot like 'hedge_%')
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
          (predictions.prediction_slot = 'hedge' or predictions.prediction_slot like 'hedge_%')
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
          (predictions.prediction_slot = 'hedge' or predictions.prediction_slot like 'hedge_%')
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

create or replace view public.prediction_fixture_scores
with (security_invoker = true)
as
with prediction_modes as (
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
      and (
        prediction_slot = 'primary'
        or prediction_slot = 'hedge'
        or prediction_slot like 'hedge_%'
      )
    )
)
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  fixture_id,
  bool_or(is_correct_score and prediction_slot <> 'curse_hated' and points > 0) as is_correct_score,
  bool_or(is_correct_result and prediction_slot <> 'curse_hated' and points > 0) as is_correct_result,
  max(case when prediction_slot = 'curse_hated' then 0 else points end) as points
from considered_predictions
group by competition_id, user_id, season_id, gameweek_id, gameweek_number, fixture_id;
