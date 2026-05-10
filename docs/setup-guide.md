# Prem Predics Setup Guide

This gets the backend ready. It does not make the current HTML pages dynamic yet.

## 1. Create Supabase Project

Create a new Supabase project for Prem Predics.

Keep these values for later frontend work:

- Project URL
- anon public key

Do not put the service role key in the website.

## 2. Run SQL

Open the Supabase SQL editor and run these files in order:

1. `supabase/schema.sql`
2. `supabase/seed-cards.sql`
3. `supabase/auth-profile-trigger.sql`

Use a fresh project for the first run. The schema file is a first setup script, not a repeatable migration.

If the project was already created before the latest card-rule updates, run this once after the files above:

- `supabase/card-rule-updates.sql`

If importing squad player/U21 player metadata separately, run this once before the full player import:

- `supabase/player-squad-metadata.sql`

The full generated player seed also adds those columns if needed, so this is safe to skip if you run `supabase/seed-players-2025-26.sql`.

If the project was created before profile editing and final league-size rules, run:

- `supabase/profile-league-rules.sql`
- `supabase/player-data-upgrades.sql`

## 3. Create Your Account

Use Supabase Auth to create your own user account.

Then, in the SQL editor, find your user id:

```sql
select id, email
from auth.users
order by created_at desc;
```

Make yourself global admin:

```sql
insert into public.admins (user_id)
values ('PASTE-YOUR-USER-ID-HERE');
```

If your user was created before `auth-profile-trigger.sql` was run, also create your profile:

```sql
insert into public.profiles (id, display_name, first_name)
values ('PASTE-YOUR-USER-ID-HERE', 'Vas', 'Vas')
on conflict (id) do update
set
  display_name = excluded.display_name,
  first_name = excluded.first_name;
```

## 4. Add Season Data

Run:

1. `supabase/seed-season-2025-26.sql`
2. `supabase/seed-fixtures-2025-26.sql`

These create:

- one `seasons` row
- 38 `gameweeks` rows
- 20 `teams` rows
- 380 `fixtures` rows with temporary 15:00 kickoff times

Then import:

- full `players` and `player_team_assignments` rows using `supabase/seed-players-2025-26.sql`
- optional clean player display names/nationalities by pasting the list into `supabase/player-nationalities-2025-26.txt`, running `node tools/generate-player-identity-update.mjs`, then running the generated `supabase/player-identity-nationality-update-2025-26.sql`

Skip the old starter file if you are using the full player seed.

Fixture deadlines are set automatically from `kickoff_at`:

- `prediction_locks_at` = kickoff minus 90 minutes
- `second_half_deadline_at` = kickoff plus 60 minutes

Star Man deadlines are calculated from the first non-postponed fixture in each gameweek minus 90 minutes.

## 5. Create A Test League

Run:

1. `supabase/verify-reference-data.sql`
2. `supabase/create-test-league.sql`

The test league is owned by `goulasvasilios@gmail.com`, starts in GW38, and uses the 2-3 player deck.

Later, create private leagues from the app UI instead of inserting them manually.

The league needs:

- `season_id`
- `owner_id`
- `name`
- `slug`
- `max_members`
- `deck_variant_id`
- `starts_gameweek_id`
- `starts_at`
- `member_lock_at`

When the league starts, freeze:

- `locked_member_count`
- `locked_deck_variant_id`
- `accepts_new_members = false`
- `started_at`

## 6. Next Frontend Pages

Build in this order:

1. `login.html`
2. `leagues.html`
3. `predictions.html`
4. `star-man.html`
5. `admin.html`
6. live `leaderboard.html`
7. live `correct-scores.html`
8. live `statistics.html`
9. live card system

The current static site can stay online while these are built.
