-- Card rule updates after initial setup.
-- Run once after schema.sql, seed-cards.sql, and auth-profile-trigger.sql if your project is already set up.

alter table public.players add column if not exists surname text;
alter table public.players add column if not exists scrabble_name text;

create or replace function public.scrabble_score(input_text text)
returns integer
language plpgsql
immutable
as $$
declare
  clean_text text;
  total integer := 0;
  letter text;
begin
  clean_text := regexp_replace(upper(coalesce(input_text, '')), '[^A-Z]', '', 'g');

  for letter in select regexp_split_to_table(clean_text, '') loop
    total := total + case
      when letter in ('A', 'E', 'I', 'O', 'U', 'L', 'N', 'S', 'T', 'R') then 1
      when letter in ('D', 'G') then 2
      when letter in ('B', 'C', 'M', 'P') then 3
      when letter in ('F', 'H', 'V', 'W', 'Y') then 4
      when letter = 'K' then 5
      when letter in ('J', 'X') then 8
      when letter in ('Q', 'Z') then 10
      else 0
    end;
  end loop;

  return total;
end;
$$;

create or replace function public.set_player_scrabble_score()
returns trigger
language plpgsql
as $$
declare
  fallback_name text;
begin
  fallback_name := regexp_replace(coalesce(new.display_name, ''), '^.*\s', '');
  new.scrabble_name := coalesce(nullif(new.last_name, ''), nullif(new.surname, ''), nullif(new.scrabble_name, ''), nullif(fallback_name, ''), new.display_name);
  new.surname_scrabble_score := public.scrabble_score(new.scrabble_name);
  return new;
end;
$$;

drop trigger if exists players_set_scrabble_score on public.players;

create trigger players_set_scrabble_score
before insert or update of display_name, first_name, last_name, surname, scrabble_name on public.players
for each row execute function public.set_player_scrabble_score();

update public.players
set
  scrabble_name = coalesce(nullif(scrabble_name, ''), nullif(last_name, ''), nullif(surname, ''), nullif(regexp_replace(display_name, '^.*\s', ''), ''), display_name),
  surname_scrabble_score = public.scrabble_score(coalesce(nullif(scrabble_name, ''), nullif(last_name, ''), nullif(surname, ''), nullif(regexp_replace(display_name, '^.*\s', ''), ''), display_name));

alter table public.predictions drop constraint if exists predictions_prediction_slot_check;

alter table public.predictions
  add constraint predictions_prediction_slot_check
  check (prediction_slot in ('primary', 'hedge', 'power_of_god', 'curse_hated', 'curse_gambler'));

create table if not exists public.curse_random_roulette_inputs (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  roulette_number integer not null check (roulette_number between 1 and 36),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  unique (card_effect_id)
);

drop trigger if exists curse_random_roulette_inputs_set_updated_at on public.curse_random_roulette_inputs;

create trigger curse_random_roulette_inputs_set_updated_at
before update on public.curse_random_roulette_inputs
for each row execute function public.set_updated_at();

create table if not exists public.curse_hated_forced_predictions (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  home_goals integer not null default 8 check (home_goals = 8),
  away_goals integer not null default 2 check (away_goals = 2),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  unique (card_effect_id)
);

drop trigger if exists curse_hated_forced_predictions_set_updated_at on public.curse_hated_forced_predictions;

create trigger curse_hated_forced_predictions_set_updated_at
before update on public.curse_hated_forced_predictions
for each row execute function public.set_updated_at();

create table if not exists public.curse_gambler_rolls (
  id uuid primary key default gen_random_uuid(),
  card_effect_id uuid not null references public.active_card_effects(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  played_by_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  roll_number integer not null check (roll_number between 1 and 3),
  home_die_roll integer not null check (home_die_roll between 0 and 5),
  away_die_roll integer not null check (away_die_roll between 0 and 5),
  home_goals integer not null check (home_goals between 0 and 5),
  away_goals integer not null check (away_goals between 0 and 5),
  rolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id, season_id)
    references public.competitions(id, season_id) on delete cascade,
  foreign key (gameweek_id, season_id)
    references public.gameweeks(id, season_id) on delete cascade,
  foreign key (fixture_id, season_id)
    references public.fixtures(id, season_id) on delete cascade,
  unique (card_effect_id, roll_number),
  unique (card_effect_id, fixture_id)
);

create or replace function public.set_curse_gambler_roll_goals()
returns trigger
language plpgsql
as $$
begin
  new.home_goals = new.home_die_roll;
  new.away_goals = new.away_die_roll;
  return new;
end;
$$;

drop trigger if exists curse_gambler_rolls_set_goals on public.curse_gambler_rolls;

create trigger curse_gambler_rolls_set_goals
before insert or update of home_die_roll, away_die_roll on public.curse_gambler_rolls
for each row execute function public.set_curse_gambler_roll_goals();

drop trigger if exists curse_gambler_rolls_set_updated_at on public.curse_gambler_rolls;

create trigger curse_gambler_rolls_set_updated_at
before update on public.curse_gambler_rolls
for each row execute function public.set_updated_at();

create index if not exists curse_random_roulette_inputs_competition_idx
on public.curse_random_roulette_inputs(competition_id, gameweek_id, target_user_id);

create index if not exists curse_hated_forced_predictions_competition_idx
on public.curse_hated_forced_predictions(competition_id, gameweek_id, target_user_id);

create index if not exists curse_gambler_rolls_competition_idx
on public.curse_gambler_rolls(competition_id, gameweek_id, target_user_id);

create or replace view public.prediction_score_details
with (security_invoker = true)
as
with all_prediction_rows as (
  select
    p.id as prediction_id,
    p.competition_id,
    p.user_id,
    f.season_id,
    f.gameweek_id,
    gw.number as gameweek_number,
    p.fixture_id,
    p.prediction_slot,
    p.home_goals as predicted_home_goals,
    p.away_goals as predicted_away_goals,
    p.source_card_effect_id
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  join public.gameweeks gw on gw.id = f.gameweek_id

  union all

  select
    chfp.id as prediction_id,
    chfp.competition_id,
    chfp.target_user_id as user_id,
    chfp.season_id,
    chfp.gameweek_id,
    gw.number as gameweek_number,
    chfp.fixture_id,
    'curse_hated'::text as prediction_slot,
    chfp.home_goals as predicted_home_goals,
    chfp.away_goals as predicted_away_goals,
    chfp.card_effect_id as source_card_effect_id
  from public.curse_hated_forced_predictions chfp
  join public.gameweeks gw on gw.id = chfp.gameweek_id

  union all

  select
    cgr.id as prediction_id,
    cgr.competition_id,
    cgr.target_user_id as user_id,
    cgr.season_id,
    cgr.gameweek_id,
    gw.number as gameweek_number,
    cgr.fixture_id,
    'curse_gambler'::text as prediction_slot,
    cgr.home_goals as predicted_home_goals,
    cgr.away_goals as predicted_away_goals,
    cgr.card_effect_id as source_card_effect_id
  from public.curse_gambler_rolls cgr
  join public.gameweeks gw on gw.id = cgr.gameweek_id
)
select
  apr.prediction_id,
  apr.competition_id,
  apr.user_id,
  apr.season_id,
  apr.gameweek_id,
  apr.gameweek_number,
  apr.fixture_id,
  apr.prediction_slot,
  apr.predicted_home_goals,
  apr.predicted_away_goals,
  mr.home_goals as actual_home_goals,
  mr.away_goals as actual_away_goals,
  (apr.predicted_home_goals = mr.home_goals and apr.predicted_away_goals = mr.away_goals) as is_correct_score,
  (sign(apr.predicted_home_goals - apr.predicted_away_goals) = sign(mr.home_goals - mr.away_goals)) as is_correct_result,
  case
    when mr.fixture_id is null then 0
    when apr.predicted_home_goals = mr.home_goals and apr.predicted_away_goals = mr.away_goals then 3
    when sign(apr.predicted_home_goals - apr.predicted_away_goals) = sign(mr.home_goals - mr.away_goals) then 1
    else 0
  end as points,
  apr.source_card_effect_id
from all_prediction_rows apr
left join public.match_results mr on mr.fixture_id = apr.fixture_id;

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
      and prediction_slot in ('primary', 'hedge')
    )
)
select
  competition_id,
  user_id,
  season_id,
  gameweek_id,
  gameweek_number,
  fixture_id,
  bool_or(is_correct_score) as is_correct_score,
  bool_or(is_correct_result) as is_correct_result,
  max(points) as points
from considered_predictions
group by competition_id, user_id, season_id, gameweek_id, gameweek_number, fixture_id;

alter table public.curse_random_roulette_inputs enable row level security;
alter table public.curse_hated_forced_predictions enable row level security;
alter table public.curse_gambler_rolls enable row level security;

drop policy if exists "curse random roulette inputs visible to league members" on public.curse_random_roulette_inputs;
create policy "curse random roulette inputs visible to league members"
on public.curse_random_roulette_inputs for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

drop policy if exists "card player manages random roulette input before gameweek lock" on public.curse_random_roulette_inputs;
create policy "card player manages random roulette input before gameweek lock"
on public.curse_random_roulette_inputs for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_random_roulette_inputs.card_effect_id
      and ace.competition_id = curse_random_roulette_inputs.competition_id
      and ace.played_by_user_id = curse_random_roulette_inputs.played_by_user_id
      and ace.target_user_id = curse_random_roulette_inputs.target_user_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_random_roulette'
  )
);

drop policy if exists "admins manage curse random roulette inputs" on public.curse_random_roulette_inputs;
create policy "admins manage curse random roulette inputs"
on public.curse_random_roulette_inputs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "curse hated forced predictions visible to league members" on public.curse_hated_forced_predictions;
create policy "curse hated forced predictions visible to league members"
on public.curse_hated_forced_predictions for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

drop policy if exists "card player manages hated forced prediction before gameweek lock" on public.curse_hated_forced_predictions;
create policy "card player manages hated forced prediction before gameweek lock"
on public.curse_hated_forced_predictions for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_hated_forced_predictions.card_effect_id
      and ace.competition_id = curse_hated_forced_predictions.competition_id
      and ace.played_by_user_id = curse_hated_forced_predictions.played_by_user_id
      and ace.target_user_id = curse_hated_forced_predictions.target_user_id
      and ace.fixture_id = curse_hated_forced_predictions.fixture_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_hated'
  )
);

drop policy if exists "admins manage curse hated forced predictions" on public.curse_hated_forced_predictions;
create policy "admins manage curse hated forced predictions"
on public.curse_hated_forced_predictions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "curse gambler rolls visible to league members" on public.curse_gambler_rolls;
create policy "curse gambler rolls visible to league members"
on public.curse_gambler_rolls for select
to authenticated
using (
  public.is_admin()
  or public.is_competition_member(competition_id)
);

drop policy if exists "card player manages gambler rolls before gameweek lock" on public.curse_gambler_rolls;
create policy "card player manages gambler rolls before gameweek lock"
on public.curse_gambler_rolls for all
to authenticated
using (
  played_by_user_id = auth.uid()
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
)
with check (
  played_by_user_id = auth.uid()
  and public.is_competition_member(competition_id)
  and now() < public.star_man_lock_at_for_gameweek(season_id, gameweek_id)
  and exists (
    select 1
    from public.active_card_effects ace
    join public.card_definitions cd on cd.id = ace.card_id
    where ace.id = curse_gambler_rolls.card_effect_id
      and ace.competition_id = curse_gambler_rolls.competition_id
      and ace.played_by_user_id = curse_gambler_rolls.played_by_user_id
      and ace.target_user_id = curse_gambler_rolls.target_user_id
      and ace.status = 'active'
      and cd.effect_key = 'curse_gambler'
  )
);

drop policy if exists "admins manage curse gambler rolls" on public.curse_gambler_rolls;
create policy "admins manage curse gambler rolls"
on public.curse_gambler_rolls for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on
  public.curse_random_roulette_inputs,
  public.curse_hated_forced_predictions,
  public.curse_gambler_rolls
to authenticated;

grant insert, update, delete on
  public.curse_random_roulette_inputs,
  public.curse_hated_forced_predictions,
  public.curse_gambler_rolls
to authenticated;

grant execute on function public.scrabble_score(text) to authenticated;
