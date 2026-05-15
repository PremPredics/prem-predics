# Card Impact Notes

This summarizes what the current `power-cards.html` card set implies for the future database.

## Core Decision

Predictions must be private-league-specific.

A user in multiple leagues may need different predictions in each league because cards played in one league can alter, duplicate, delete, force, or modify predictions only inside that league.

## Power Cards

Cards that mostly affect Star Man scoring:

- Power of the Goal: adds 1 Star Man goal for the player using it.
- Power of the Rocket Man: doubles outside-the-box goals and assists.
- Power of the Immigrants: doubles non-English Star Man points.
- Power of the Lanky Crouch: doubles Star Man points for players 185cm+.
- Power of the Small and Mighty: doubles Star Man points for players 175cm or shorter.
- Power of the Assist King: doubles Star Man assist points.
- Power of the Late Scout: extends Star Man deadline until after lineups for one match.
- Power of the Late Scout uses the selected player's fixture kickoff as the temporary Star Man deadline.
- The player's fixture is based on their live team assignment for the gameweek.

Cards that affect prediction scoring:

- Power of the Laundrette: double points for correct results with a clean sheet.
- Power of the Pessimist: double all prediction points if no team scores 3+ goals in the gameweek.
- Power of God: allows one prediction change before the second half.
- Power of God uses a separate `power_of_god` prediction slot and a Version 1 second-half deadline of kickoff + 60 minutes.
- Normal predictions lock 90 minutes before each fixture kicks off.
- Power of the Hedge: allows two scorelines for one match; best result counts.
- Power of the Snow: doubles points for predicted matches played in heavy snow.

Cards that affect card inventory:

- Power of the Swap: discard 2, draw 3, keep 2.
- Power of the Veto: cancels an opponent Curse.

Power of the Swap should be represented as one played card effect, two discarded card instances, three forced regular-medal draw tokens, and three immediate Regular Deck draw events.

## Curse Cards

Prediction constraints:

- Curse of the Hated: opponent must predict 8-2 in at least one game.
- Curse of the Random: opponent uses dice-generated scores for three games.
- Curse of the Glasses: opponent's 0-0 predictions score nothing.
- Curse of the Deleted Match: chosen opponent prediction scores nothing.
- Curse of the Even Number: opponent can only predict even team goal totals.
- Curse of the Odd Number: opponent can only predict odd team goal totals.

Curse prediction overrides:

- Curse of the Hated stores the target user and a random fixture selected by the app, then scores that target as an 8-2 prediction for that fixture.
- Curse of the Random stores three simulated dice-roll predictions. Rolls are 0-5 and become the forced scoreline directly.
- Curse-generated predictions override normal predictions for those fixtures.
- Prediction-override curse details such as Hated, Random, and Deleted Match stay hidden from the target until the 24-hour curse activation point before the gameweek's first kickoff.

Star Man constraints:

- Curse of the Bench Warmer: opponent Star Man must have been benched in previous GW.
- Curse of the Alphabet 15+: opponent Star Man surname Scrabble score must be 15+.
- Curse of the Alphabet 20+: opponent Star Man surname Scrabble score must be 20+.
- Curse of the Scoring Drought 3: opponent Star Man must have 0 goals in last 3 PL games.
- Curse of the Scoring Drought 5: opponent Star Man must have 0 goals in last 5 PL games.
- Curse Of The Microstate: opponent Star Man nationality must be from a country with a population under 1 million.
- Curse of the Tiny Club: opponent cannot pick a Star Man from a top-10 club.
- If a Star Man restriction is applied after the target has already submitted, the app auto-replaces an invalid current pick with a random eligible player when one exists.
- If the target has not submitted yet, the selection stays blank and only the restrictions are displayed.

Microstate:

- The old `curse_random_roulette` id now represents Curse Of The Microstate so existing hands and played effects migrate cleanly.
- The target's Star Man must have a nationality in the under-1-million country list once the curse activates.

Card inventory:

- Curse of the Thief: steal an opponent card, excluding Super Cards.

Play timing:

- Curse cards must be played at least 24 hours before the first fixture in the active gameweek.
- Power and Super cards must be played before the 90-minute gameweek lock, except Power of the Late Scout, which can still be played after that lock if the user has not already chosen a Star Man and at least one current-gameweek match has not kicked off.
- Power of the Veto therefore has a response window after the curse deadline and before the normal 90-minute lock.

## Super Cards

Scoring effects:

- Super Star Man: triples Star Man points; yellow/red cards become 0 points.
- Super Golden Gameweek: doubles all prediction league points for the user.
- Super Score: user chooses one scoreline for the gameweek; every real fixture that finishes with that exact scoreline earns +3 UC points.
- Super Score is exact home-away scoreline logic: 1-0 only counts when the home team wins 1-0, not when the away team wins 0-1.
- Super Duo: user may choose a second Star Man in a `super_duo` pick slot for however many gameweeks the card definition/effect states.
- Super Pen: draw a regular card whenever a penalty is scored in the gameweek.

Selection/editing effects:

- Super Sub: Star Man can be swapped before the new player's match kicks off.

Inventory effects:

- Super Draw: draw 3 regular cards in 2-3 player leagues, 4 in 4-6 player leagues, and 5 in 7-10 player leagues.

Medals:

- Regular cards are drawn by redeeming regular medals.
- Super Cards are drawn by redeeming super medals.
- Game Card winners earn super medals.
- Accolades and draw-card effects can create regular medals.
- Super Pen uses fixture-level `penalties_scored` totals to decide when Regular Deck draws are earned.

Player name data:

- Curse of the Alphabet uses `players.scrabble_name` and `players.surname_scrabble_score`.
- Scrabble score is calculated from the player's stored surname/last name, with `scrabble_name` retained as the scoring field.

Deck variants:

- The original 52-card regular list is the 2-player deck.
- Exact `players_2` through `players_10` variants exist.
- Each exact regular deck contains 26 cards per player, split as 15 Power and 11 Curse cards per player.
- A league freezes its actual member count and exact deck variant 90 minutes before the first kickoff of its starting gameweek.

## Game Cards

Game Cards are league-specific minigames:

- Game of Goals: predict total goals.
- Game of Corners: predict total corners.
- Game of The Underdog: predict number of teams beating a team above them.
- Game of The Goalhanger: predict number of players scoring 2+ goals.
- Game of War: predict total yellow cards.
- Game of The Early Worm: predict earliest goal minute.
- Game of Time: predict total 90+ minute goals.

Schedule:

- Round 1: GW1-GW5
- Round 2: GW6-GW10
- Round 3: GW11-GW15
- Round 4: GW16-GW20
- Round 5: GW21-GW25
- Round 6: GW26-GW30
- Round 7: GW31-GW35

The database now supports:

- per-league game card rounds
- per-user weekly minigame predictions
- global-admin actual minigame results
- weekly closest-player calculation
- best-of-five standings
- one winner only, using weekly wins, total difference, lowest UC points, then stored random tiebreak rank
- super medal rewards and +1 UC point for the winner

League start:

- If a league begins after GW1, Game Cards begin at the next scheduled Game Card start. For example, a GW2 league starts its Game Cards at GW6.
- The league's start gameweek should be the current global gameweek when the league is created.

Fixture/player data:

- Fixtures can be manually moved between gameweeks by the global admin.
- Player fixture stats are required for player history, Bench Warmer, Scoring Drought, and team-at-the-time logic.

Open decision:

- GW36-GW38 currently have no Game Card round under the seven-card, five-week schedule. That matches the current rules, but we should confirm before production.
