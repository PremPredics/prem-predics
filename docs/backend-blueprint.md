# Prem Predics Backend Blueprint

This is the path from the current static site plus Excel workbook to a real web app with accounts, predictions, Star Man picks, and live leaderboards.

## North Star

The Excel workbook is the rulebook. The website backend should store raw inputs and calculate the same outputs.

Raw inputs:

- Users
- Private leagues
- Premier League fixtures
- Private-league-specific user score predictions
- Actual match results
- Star Man picks
- Star Man player stats for each fixture and gameweek
- Card decks, hands, played card effects, and game-card minigames

Calculated outputs:

- Prediction points
- Star Man points
- Ultimate Champion total points
- Leaderboard
- Correct scores
- Detailed statistics by gameweek

## Current Rules From Workbook

Prediction scoring:

- Exact correct score: 3 points
- Correct result/outcome only: 1 point
- Wrong outcome: 0 points

Star Man scoring:

- Goal: 3 points
- Assist: 1 point
- Yellow card: -1 point
- Red card: -3 points

Ultimate Champion total:

```text
Prediction League points + Star Man points + Game Card UC bonuses + Super Score bonuses
```

## Recommended Stack

Use Supabase for Version 1:

- Supabase Auth for sign up and login
- Supabase Postgres for data
- Row Level Security so users can only edit their own predictions and picks
- SQL views for leaderboard, correct scores, and stats

Keep the existing HTML pages at first. Add JavaScript to talk to Supabase. Only move to a bigger framework later if the site outgrows static HTML.

## Access Flow

Version 1 is private-league-only.

Logged out users can only see:

- login/sign-up
- how it works / how to play information

Logged in users who have not joined or created a private league can see:

- homepage
- how it works / how to play
- create private league
- join private league

All other pages should show a clear blocked state:

```text
You need to join or create a private league first.
```

Logged in users inside a private league can use:

- predictions
- Star Man
- leaderboard
- statistics
- correct scores
- power cards, if included as part of the league experience

## Core Pages

Keep:

- `index.html`
- `how-to-play.html`
- `power-cards.html`

Upgrade:

- `leaderboard.html`: replace the image with live leaderboard data
- `statistics.html`: replace the image with live stats/charts
- `correct-scores.html`: replace the image with live correct-score rows

Add:

- `login.html`: sign in/sign up
- `leagues.html`: create a private league, view join code, join a league by code
- `predictions.html`: submit fixture score predictions
- `star-man.html`: choose Star Man
- `admin.html`: global-admin-only page for entering actual match results and Star Man stats

## Data Model

Reference data:

- `seasons`
- `gameweeks`
- `teams`
- `fixtures`
- `players`: full squad player/U21 player pool, including surname Scrabble score and homegrown flag
- `player_team_assignments`: gameweek-specific team history for transfers and Star Man eligibility

Users and private leagues:

- `profiles`
- `admins`: global admins only
- `competitions`: private leagues
- `competition_members`: users inside each league, with owner/admin/member roles

User inputs:

- `predictions`
- `star_man_picks`
- `game_card_predictions`

Admin inputs:

- `match_results`
- `fixture_schedule_changes`
- `player_fixture_stats`
- `player_gameweek_stats`: optional aggregate/manual fallback; fixture-level stats are the primary source
- `fixture_game_stats`
- `team_gameweek_standings`
- `game_card_results`
- `game_card_round_tiebreaks`
- `curse_random_roulette_inputs`
- `curse_hated_forced_predictions`
- `curse_gambler_rolls`

Calculated views:

- `prediction_score_details`
- `prediction_fixture_scores`
- `prediction_totals`
- `gameweek_deadlines`
- `player_gameweek_stat_totals`
- `star_man_score_details`
- `star_man_totals`
- `game_card_week_scores`
- `game_card_round_standings`
- `game_card_bonus_totals`
- `leaderboard`
- `correct_scores`
- `user_gameweek_stats`

## Important Product Decisions

### Prediction visibility

Recommended:

- A user can see and edit their own prediction until that fixture locks.
- A normal fixture prediction locks 90 minutes before that fixture kicks off.
- Power of God creates a special `power_of_god` prediction slot that can be submitted until `kickoff_at + 60 minutes`, which acts as the Version 1 second-half deadline until APIs are added.
- Other users can see predictions only after the lock.

### Star Man visibility

Recommended:

- A user can see and edit their own Star Man pick until the gameweek Star Man deadline.
- The normal Star Man deadline is 90 minutes before the first fixture in that gameweek.
- Power of the Late Scout can extend a user's Star Man deadline until the selected player's match kicks off.
- The selected player's fixture is resolved from their live team assignment for that gameweek, so manual transfers/player-team updates keep the deadline correct.
- Other users can see picks only after the gameweek locks.

### Private Leagues

Users should be able to create private leagues. Each private league has:

- an owner
- a name
- a join code
- its own members
- its own leaderboard and stats

Predictions are specific to a private league.

This matters because cards can change prediction rules in one league without affecting another league. If a user is in three leagues, they submit three separate sets of predictions.

Star Man picks are league-specific, because the Star Man game is part of the private league competition.

Users cannot submit predictions until they belong to the relevant private league for the season.

### Star Man Uniqueness

The rule is:

- Each user can only choose a Star Man player once per season inside a league.
- Different users in the same league can choose the same Star Man if they have not personally used that player yet.

Example:

- Player A chooses Erling Haaland in Gameweek 1.
- Player A cannot choose Erling Haaland again that season in that league.
- Player B can still choose Erling Haaland later, as long as Player B has not used him before.

The schema enforces:

```text
One Star Man player can only be picked once per user, per competition, per season.
One normal Star Man pick is allowed per user, per league, per gameweek.
Super Duo unlocks a second `super_duo` pick slot for the active card's gameweek range.
```

Constraint:

```text
star_man_picks_unique_player_per_user_competition_season
```

## Build Order

### Phase 1: Backend foundation

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create your own account.
4. Add your user id to `admins`.
5. Add the active season, gameweeks, teams, players, and fixtures.
6. Add player team assignments so transferred players can be resolved by gameweek.
7. Create a first private league with `starts_gameweek_id`, `starts_at`, and `member_lock_at`.
8. Share its join code with test users before the league starts.

### Phase 2: Live predictions

1. Add Supabase client config to the site.
2. Build `login.html`.
3. Build private league create/join UI.
4. Build `predictions.html`.
5. Let users submit predictions.
6. Confirm Row Level Security prevents users editing other people's rows.

### Phase 3: Admin scoring

1. Build `admin.html` as a global-admin-only page.
2. Add result entry.
3. Add fixture schedule editing so postponed or moved matches can be assigned to the correct gameweek.
4. Add fixture-level player stat entry.
5. Add fixture/game-card result entry.
6. Confirm leaderboard views update automatically.

League owners are not global admins. They can manage their private league membership, but they cannot enter official match results or Star Man stat results.

### Phase 4: Replace image pages

1. `leaderboard.html` reads from `leaderboard`.
2. `correct-scores.html` reads from `correct_scores`.
3. `statistics.html` reads from `user_gameweek_stats`, `prediction_totals`, and `star_man_totals`.

### Phase 5: Polish

1. Add mobile-friendly prediction forms.
2. Add locked/unlocked states.
3. Add loading/error states.
4. Add admin import helpers for fixtures and players.
5. Add charts.

## Admin Workflow

This mirrors the Excel workflow:

1. Users submit predictions.
2. Users pick Star Men.
3. You, as global admin, enter final match scores.
4. You, as global admin, move fixtures between gameweeks if the Premier League schedule changes.
5. You, as global admin, enter player fixture stats: goals, assists, yellows, reds, starts, bench status, minutes, team played for, and opponent.
6. You, as global admin, enter any required fixture/game-card results.
7. You, as global admin, finalize Game Card tiebreak data if two users are still tied after weekly wins and total difference.
8. The database views calculate all totals.

This keeps Version 1 realistic. Automated football data APIs can come later.

## Card System

The power-card page is no longer only local game state. The backend needs to store league-specific decks, hands, active effects, and game-card rounds.

Core card tables:

- `card_deck_variants`: exact league-size deck options for 2 through 10 player leagues
- `card_definitions`: the master list of Power, Curse, Super, and Game cards
- `card_deck_cards`: the quantity of each card in each deck variant
- `league_cards`: physical/virtual card instances inside one private league
- `active_card_effects`: cards that have been played and need to affect a gameweek, fixture, user, prediction, or Star Man pick
- `card_effect_targets`: explicit chosen targets for cards played against one or more opponents
- `super_score_picks`: the scoreline selected when a user plays Super Score
- `card_draw_tokens`: regular medals and super medals used to redeem Regular and Premium deck cards
- `card_draw_events`: audit trail for cards drawn from a deck
- `curse_random_roulette_inputs`: stores the 1-36 roulette number submitted by the card player
- `curse_hated_forced_predictions`: stores the chosen fixture where the target is forced to predict 8-2
- `curse_gambler_rolls`: stores dice rolls and their converted scoreline predictions

Deck variants:

- The original 52-card regular deck is now the 2-player deck.
- Exact variants exist for `players_2` through `players_10`.
- Each regular deck uses 26 regular cards per player: 15 Power cards and 11 Curse cards per player.
- Unlocked leagues can accept up to 10 members, then freeze `locked_member_count` and `locked_deck_variant_id` at the 90-minute pre-kickoff member lock.
- Before lock, leagues seed from the 2-player deck. Once locked, they top up to the exact deck for the final player count.

Prediction cards require `predictions.competition_id`, because a prediction changed by cards in one league must not affect another league.

Prediction support:

- `prediction_slot = primary`: normal prediction
- `prediction_slot = hedge`: second scoreline from Power of the Hedge
- `prediction_slot = power_of_god`: late changed prediction
- `prediction_slot = curse_hated`: forced 8-2 prediction
- `prediction_slot = curse_gambler`: dice-generated prediction

Prediction scoring priority:

- Curse of the Hated and Curse of the Gambler override the target user's normal prediction for that fixture.
- Power of God overrides the normal prediction for that fixture.
- Power of the Hedge only uses best-of-two behavior when no override card is active.

Medals and deck draws:

- Regular deck cards are redeemed with `regular_medal` tokens.
- Super Cards are redeemed with `super_medal` tokens.
- Game Card winners earn a super medal and +1 UC point.
- Accolades can create regular medals.
- Card effects such as Power of the Swap or Super Draw can create forced regular medals with `auto_redeem_required = true`, then immediately redeem those medals into draw events.
- Power of the Swap's discard 2 / draw 3 flow should be recorded as a card effect plus three forced regular-medal draw tokens and three draw events.

Game Cards:

- Game Cards are generated per private league.
- They start in Gameweeks 1, 6, 11, 16, 21, 26, and 31.
- Each Game Card lasts five gameweeks.
- Each member submits one numeric minigame prediction per active gameweek.
- You enter the actual minigame result each gameweek as global admin.
- The site calculates closest prediction per week.
- The best-of-five winner earns +1 UC point and a super medal for that league.
- Tiebreak order is weekly wins, then total difference, then lowest UC points at finalization, then a stored random tiebreak rank.
- Only one user wins the Game Card reward.

Game-card tables:

- `game_card_rounds`
- `game_card_predictions`
- `game_card_results`
- `game_card_round_tiebreaks`
- `game_card_week_scores`
- `game_card_round_standings`
- `game_card_bonus_totals`

Current Game Card metrics:

- Game of Goals: total goals in the gameweek
- Game of Corners: total corners in the gameweek
- Game of The Underdog: teams beating a team above them in the table
- Game of The Goalhanger: players scoring 2+ goals in the gameweek
- Game of War: total yellow cards in the gameweek
- Game of The Early Worm: earliest goal minute in the gameweek
- Game of Time: total 90+ minute goals in the gameweek

Extra data needed for card effects:

- player nationality for Power of the Immigrants
- player height for Power of the Lanky Crouch and Power of the Small and Mighty
- player squad number for Curse of the Random Roulette
- `players.scrabble_name` and `players.surname_scrabble_score` for Curse of the Alphabet; the score is calculated automatically from the stored Scrabble name
- previous bench status and recent scoring history for Bench Warmer / Scoring Drought curses
- team standings by gameweek for Tiny Club and Underdog logic
- player team assignments by gameweek for transfers and Star Man eligibility
- fixture-level player stats for Bench Warmer, Scoring Drought, and historical player form
- fixture corners, yellow cards, earliest goal minute, stoppage-time goals, penalties, and snow flag for Game Cards and related card effects

Specific card data:

- Super Pen uses `fixture_game_stats.penalties_scored`.
- Curse of the Random Roulette requires the card player to submit a number from 1 to 36 before the gameweek lock. If no number is submitted before lock, the app should treat the card as not played.
- Curse of the Hated stores the selected target user and fixture, and creates an effective 8-2 prediction for scoring.
- Curse of the Gambler stores up to three fixture dice rolls. Die rolls are 1-6, with 6 converting to 0 goals.

Fixture movement:

- `fixtures.gameweek_id` is the current scoring gameweek.
- `fixtures.original_gameweek_id` records where the match was first listed.
- `fixtures.prediction_locks_at` is set automatically as `kickoff_at - 90 minutes`.
- `fixtures.second_half_deadline_at` is set automatically as `kickoff_at + 60 minutes`.
- `fixture_schedule_changes` logs admin changes.
- The global admin page should let you edit a fixture's gameweek and kickoff time manually until an API is added.
- `gameweek_deadlines` calculates the Star Man deadline from the first non-postponed fixture in that gameweek minus 90 minutes.

League start and no late joining:

- Private leagues store `starts_gameweek_id`, `starts_at`, `member_lock_at`, and `accepts_new_members`.
- `starts_gameweek_id` should be set to the current global gameweek at the time the league is created.
- `member_lock_at` should normally match the start moment for that league, after which `locked_member_count` and `locked_deck_variant_id` are frozen.
- Once `member_lock_at` has passed or `accepts_new_members = false`, new members cannot join.
- If a league starts in GW2, its first Game Card round starts at the next scheduled Game Card start, GW6.

Super Score:

- Super Score is the replacement super card.
- When playing Super Score, the user chooses one scoreline for the gameweek, such as 0-0, 1-0, or 1-2.
- Each real fixture in that gameweek that finishes with the selected scoreline gives the user +3 UC points.
- The selected scoreline is stored per league, per user, per gameweek, and tied to the played card effect.

## First Manual Setup Checklist

After running the schema:

1. Create a row in `seasons`.
2. Create 38 rows in `gameweeks`.
3. Create 20 rows in `teams`.
4. Create fixture rows with `kickoff_at` and `original_gameweek_id`; prediction and second-half deadlines are set automatically from kickoff.
5. Create player rows and player team assignments.
6. Create card definitions and deck quantities for each `card_deck_variants` row.
7. Create a private league from the app, or create a row in `competitions` with the right `max_members`, `deck_variant_id`, start gameweek, start time, and member lock time.
8. Add users by sharing the league `join_code` before the league locks.
9. Add your user id to `admins`.

## Notes

- Do not expose a Supabase service role key in browser code.
- Browser code should use the public anon key only.
- Admin-only writes are controlled by Row Level Security plus the `admins` table.
- Private league ownership is separate from global admin access.
- Logged-out users should not fetch app data from Supabase; the public pages should be static information only.
- If the scoring rules change later, update the SQL views rather than changing stored user inputs.
