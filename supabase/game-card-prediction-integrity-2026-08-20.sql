-- Prem Predics: validate Game Card predictions at the database boundary.
-- Safe to run more than once. It does not rewrite or delete existing rows and
-- does not touch leagues, members, fixtures, users, predictions, or picks.

begin;

create or replace function public.validate_game_card_prediction_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  round_card_id text;
  round_status text;
  start_number integer;
  end_number integer;
  target_number integer;
  card_category text;
  card_deck_type text;
  minimum_value numeric;
  maximum_value numeric;
begin
  select
    gcr.card_id,
    gcr.status,
    start_gameweek.number,
    end_gameweek.number,
    target_gameweek.number,
    card.category,
    card.deck_type
  into
    round_card_id,
    round_status,
    start_number,
    end_number,
    target_number,
    card_category,
    card_deck_type
  from public.game_card_rounds gcr
  join public.gameweeks start_gameweek
    on start_gameweek.id = gcr.start_gameweek_id
    and start_gameweek.season_id = gcr.season_id
  join public.gameweeks end_gameweek
    on end_gameweek.id = gcr.end_gameweek_id
    and end_gameweek.season_id = gcr.season_id
  join public.gameweeks target_gameweek
    on target_gameweek.id = new.gameweek_id
    and target_gameweek.season_id = gcr.season_id
  join public.card_definitions card on card.id = gcr.card_id
  where gcr.id = new.round_id
  for share of gcr;

  if not found
    or start_number > end_number
    or target_number not between start_number and end_number then
    raise exception 'This Gameweek does not belong to this Game Card round.'
      using errcode = '23514';
  end if;

  if round_status not in ('scheduled', 'active') then
    raise exception 'This Game Card round is no longer editable.'
      using errcode = '23514';
  end if;

  if card_category <> 'game' or card_deck_type <> 'game' then
    raise exception 'This round does not use a valid Game Card.'
      using errcode = '23514';
  end if;

  case round_card_id
    when 'game_goals' then minimum_value := 0; maximum_value := 150;
    when 'game_corners' then minimum_value := 0; maximum_value := 300;
    when 'game_underdog' then minimum_value := 0; maximum_value := 10;
    when 'game_goalhanger' then minimum_value := 0; maximum_value := 99;
    when 'game_war' then minimum_value := 0; maximum_value := 99;
    when 'game_early_worm' then minimum_value := 1; maximum_value := 90;
    when 'game_time' then minimum_value := 0; maximum_value := 99;
    else
      raise exception 'This Game Card does not have a configured prediction rule.'
        using errcode = '23514';
  end case;

  if new.predicted_value is null
    or new.predicted_value <> trunc(new.predicted_value)
    or new.predicted_value < minimum_value
    or new.predicted_value > maximum_value then
    raise exception 'Enter a whole number between % and % for this Game Card.', minimum_value, maximum_value
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_game_card_prediction_row() from public;

drop trigger if exists game_card_predictions_validate_row on public.game_card_predictions;

create trigger game_card_predictions_validate_row
before insert or update of round_id, gameweek_id, predicted_value
on public.game_card_predictions
for each row execute function public.validate_game_card_prediction_row();

commit;

select
  'GAME_CARD_PREDICTION_GUARD_READY' as status,
  pg_get_triggerdef(trigger_row.oid) as trigger_definition
from pg_trigger trigger_row
where trigger_row.tgrelid = 'public.game_card_predictions'::regclass
  and trigger_row.tgname = 'game_card_predictions_validate_row'
  and not trigger_row.tgisinternal;
