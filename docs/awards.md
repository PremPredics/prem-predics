# League Awards

Run all of `supabase/league-awards-2026-10-05.sql` in Supabase SQL Editor once (reruns are safe). This adds `get_league_awards(uuid)` only. It neither backfills nor alters game data. The static page is `awards.html?competition_id=<competition-id>`; use the Hub link to preserve the existing URL convention.

## Data and rules

- Scope: current members of the requested league, its season, and its starting Gameweek onwards. Members alone may call the authenticated, SECURITY INVOKER function. Existing RLS remains enforced. Anonymous execution is revoked. No unpublished prediction data is returned.
- Nostradamus: final-fixture CS flags from `prediction_fixture_scores`, including the existing scoring rules for card effects.
- Copycats: pairwise equality of the effective main scoreline on the same final fixture. Each fixture counts once per unordered pair. Extra Hedge predictions do not inflate it.
- Superman: `active_card_effects` joined to `card_definitions`, category `power`. Cancelled plays and unfinished Power of the Swap plays excluded; Super Cards excluded.
- Why Always Me?: distinct Curse effects targeted at a member, unioning the direct target and `card_effect_targets`. Self-targets excluded. Vetoed curses count; cancelled curses and incomplete Thief plays do not.
- Hit The Post!: combined absolute home/away goal error exactly one for the effective main prediction, excluding fixtures credited as CS (including a successful Hedge).
- The Entertainer: total predicted home+away goals divided by submitted final-fixture main predictions. Missing entries are not zeroes. Compare exact ratios before formatting to two decimals; no minimum sample beyond one submission.
- The Jinx: distinct Curse plays with at least one other target. A multi-target curse is one play, even though each recipient receives it.
- Best Prediction: maximum actual total goals in a credited CS; shows a matching fixture. A 0–0 CS can qualify.
- Against The World: credited CR on a final fixture, all current members submitted effective predictions, and no other member predicted the actual outcome (including their Hedge alternatives). Missing submissions cannot produce a win by default. CS also qualifies as CR, matching the existing scoring system.
- The Passport Collector: distinct nonempty, trimmed, case-normalised nationalities of revealed Star Man selections. Uses the player database’s recorded nationality. All valid pick slots count; repeated countries count once.
- The Starboy: sum of `star_man_score_details.points` for revealed picks; the same card-adjusted points used by the leaderboard. Picks must pass the normal Gameweek lock and the selected player’s kickoff, for identical visibility across owners and other members. An eligible holder can have zero or negative points.
- Gameweek Champion: `user_gameweek_stats.ultimate_champion_points`, including existing bonuses. Every member tied for the maximum earns one win when all non-postponed fixtures have final results and have kicked off. Corrected statistics recalculate past wins. There is no permanent award latch or game-currency grant.

Prediction overrides follow the current main scoring order: latest active forced Hated/Gambler result, then Power of God, then primary/Hedge predictions. Random’s forced primary prediction is already recorded in `predictions`. Personality comparisons use the main scoreline only.

## Presentation

Unearned awards are hidden. All maximum holders/pairs share their award. Champion standings use competition ranking (1, 1, 3); all users occupying the first three rank positions appear on the podium, or the first two in a two-person league. Consequently tied podium places can contain more than three users. An expandable table shows every member. Gold/silver/bronze are purely visual.

One bounded RPC loads the whole collection after the existing membership check. Refreshes run at most once per 30 seconds on return/focus, and every minute while visible. There is no full-page animation or persisted awards cache. A pending SQL installation displays a preparation message with Retry.

## Checks

`node --test tests/awards.test.mjs` checks eligibility, zero/negative values, exact average comparisons, pairs and shared champion ranks. `node tools/check-awards-layout.cjs` checks actual page rendering at 320, 390, 768 and 1280 CSS pixels with long names and ties. The SQL SELECT body was also executed in read-only transactions under real member, non-member and signed-out contexts before publishing. No production DDL was applied during development.
