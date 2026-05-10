import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const rawPath = path.join(root, 'supabase', 'player-nationalities-2025-26.txt');
const existingSeedPath = path.join(root, 'supabase', 'seed-players-2025-26.sql');
const outputPath = path.join(root, 'supabase', 'player-identity-nationality-update-2025-26.sql');

const teamAliases = new Map([
  ['AFC Bournemouth', 'Bournemouth'],
  ['AFC Bournemouth U21', 'Bournemouth'],
  ['Arsenal', 'Arsenal'],
  ['Arsenal U21', 'Arsenal'],
  ['Aston Villa', 'Aston Villa'],
  ['Aston Villa U21', 'Aston Villa'],
  ['Brentford', 'Brentford'],
  ['Brentford U21', 'Brentford'],
  ['Brighton & Hove Albion', 'Brighton'],
  ['Brighton & Hove Albion U21', 'Brighton'],
  ['Burnley', 'Burnley'],
  ['Burnley U21', 'Burnley'],
  ['Chelsea', 'Chelsea'],
  ['Chelsea U21', 'Chelsea'],
  ['Crystal Palace', 'Crystal Palace'],
  ['Crystal Palace U21', 'Crystal Palace'],
  ['Everton', 'Everton'],
  ['Everton U21', 'Everton'],
  ['Fulham', 'Fulham'],
  ['Fulham U21', 'Fulham'],
  ['Leeds United', 'Leeds'],
  ['Leeds United U21', 'Leeds'],
  ['Liverpool', 'Liverpool'],
  ['Liverpool U21', 'Liverpool'],
  ['Manchester City', 'Manchester City'],
  ['Manchester City U21', 'Manchester City'],
  ['Manchester United', 'Manchester United'],
  ['Manchester United U21', 'Manchester United'],
  ['Newcastle United', 'Newcastle'],
  ['Newcastle United U21', 'Newcastle'],
  ['Nottingham Forest', 'Nottingham Forest'],
  ['Nottingham Forest U21', 'Nottingham Forest'],
  ['Sunderland', 'Sunderland'],
  ['Sunderland U21', 'Sunderland'],
  ['Tottenham Hotspur', 'Tottenham'],
  ['Tottenham Hotspur U21', 'Tottenham'],
  ['West Ham United', 'West Ham'],
  ['West Ham United U21', 'West Ham'],
  ['Wolverhampton Wanderers', 'Wolverhampton'],
  ['Wolverhampton Wanderers U21', 'Wolverhampton'],
]);

const homeNations = new Set(['England', 'Wales', 'Scotland', 'Northern Ireland']);

function sql(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseSqlTuple(line) {
  const start = line.indexOf('(');
  const end = line.lastIndexOf(')');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const body = line.slice(start + 1, end);
  const values = [];
  let i = 0;

  while (i < body.length) {
    while (body[i] === ' ' || body[i] === ',') i += 1;

    if (body[i] === "'") {
      i += 1;
      let value = '';

      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }

        if (body[i] === "'") {
          i += 1;
          break;
        }

        value += body[i];
        i += 1;
      }

      values.push(value);
      continue;
    }

    let value = '';
    while (i < body.length && body[i] !== ',') {
      value += body[i];
      i += 1;
    }

    value = clean(value);
    values.push(value.toLowerCase() === 'null' ? null : value);
  }

  return values;
}

function parseExistingSeed() {
  const text = fs.readFileSync(existingSeedPath, 'utf8');
  const rows = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("  ('")) {
      continue;
    }

    const values = parseSqlTuple(line);
    if (!values || values.length < 5) {
      continue;
    }

    rows.push({
      displayName: values[0],
      surname: values[1],
      teamName: values[3],
      squadStatus: values[4],
    });
  }

  return rows;
}

function splitPlayerName(fullName) {
  const parts = clean(fullName).split(' ').filter(Boolean);

  if (parts.length <= 1) {
    const onlyName = parts[0] || clean(fullName);
    return { firstName: onlyName, lastName: onlyName };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function currentDisplayNameFromExistingSeed(row) {
  const firstName = clean(row.displayName).split(' ')[0] || row.displayName;
  const lastName = clean(row.surname);

  if (!lastName || firstName === lastName) {
    return firstName;
  }

  return `${firstName} ${lastName}`;
}

function parseRawList() {
  if (!fs.existsSync(rawPath)) {
    throw new Error(`Missing ${rawPath}. Paste the player-nationality list into that file first.`);
  }

  const text = fs.readFileSync(rawPath, 'utf8');
  const rows = [];
  let currentHeading = null;
  let currentTeamName = null;
  let currentSquadStatus = null;
  const counts = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = clean(rawLine);
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (!line.includes(' - ')) {
      currentHeading = line;
      currentTeamName = teamAliases.get(line);
      currentSquadStatus = line.endsWith(' U21') ? 'u21' : 'squad_player';

      if (!currentTeamName) {
        throw new Error(`Unknown team heading: ${line}`);
      }

      continue;
    }

    if (!currentTeamName || !currentSquadStatus) {
      throw new Error(`Player row appeared before a team heading: ${line}`);
    }

    const [rawFullName, ...nationalityParts] = line.split(' - ');
    const fullName = clean(rawFullName);
    const nationality = clean(nationalityParts.join(' - '));
    const key = `${currentTeamName}|${currentSquadStatus}`;
    const seedOrder = (counts.get(key) || 0) + 1;
    counts.set(key, seedOrder);
    const { firstName, lastName } = splitPlayerName(fullName);

    rows.push({
      heading: currentHeading,
      teamName: currentTeamName,
      squadStatus: currentSquadStatus,
      seedOrder,
      fullName,
      firstName,
      lastName,
      firstInitial: firstName.charAt(0).toUpperCase(),
      lastInitial: lastName.charAt(0).toUpperCase(),
      nationality,
      isHomeNation: homeNations.has(nationality),
    });
  }

  return rows;
}

function groupRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.teamName}|${row.squadStatus}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return groups;
}

const oldRows = parseExistingSeed();
const oldGroups = groupRows(oldRows);
const newRows = parseRawList();
if (newRows.length === 0) {
  throw new Error(`No player rows found in ${rawPath}. Paste the full list before running the generator.`);
}
const newGroups = groupRows(newRows);
const warnings = [];
const mappedRows = [];

for (const row of newRows) {
  const key = `${row.teamName}|${row.squadStatus}`;
  const oldGroup = oldGroups.get(key) || [];
  const oldRow = oldGroup[row.seedOrder - 1];

  if (!oldRow) {
    warnings.push(`No existing seed row for ${key} #${row.seedOrder}: ${row.fullName}`);
    continue;
  }

  mappedRows.push({
    ...row,
    oldDisplayName: oldRow.displayName,
    currentDisplayName: currentDisplayNameFromExistingSeed(oldRow),
  });
}

for (const [key, oldGroup] of oldGroups.entries()) {
  const newGroup = newGroups.get(key) || [];
  if (oldGroup.length !== newGroup.length) {
    warnings.push(`${key}: existing seed has ${oldGroup.length}, new list has ${newGroup.length}`);
  }
}

const sqlRows = mappedRows.map((row) => `(${[
  sql(row.teamName),
  sql(row.squadStatus),
  row.seedOrder,
  sql(row.oldDisplayName),
  sql(row.currentDisplayName),
  sql(row.fullName),
  sql(row.firstName),
  sql(row.lastName),
  sql(row.firstInitial),
  sql(row.lastInitial),
  sql(row.nationality),
  row.isHomeNation ? 'true' : 'false',
].join(', ')})`);

const output = `-- Generated by tools/generate-player-identity-update.mjs.
-- Source: supabase/player-nationalities-2025-26.txt
-- Updates existing seeded players by team/status/order, preserving double-barrelled and multi-part surnames from the clean display list.

create temporary table player_identity_seed (
  team_name text not null,
  squad_status text not null check (squad_status in ('squad_player', 'u21')),
  seed_order integer not null,
  old_display_name text not null,
  current_display_name text not null,
  full_name text not null,
  first_name text not null,
  last_name text not null,
  first_initial text not null,
  last_initial text not null,
  nationality text not null,
  is_home_nation boolean not null
) on commit drop;

insert into player_identity_seed (
  team_name,
  squad_status,
  seed_order,
  old_display_name,
  current_display_name,
  full_name,
  first_name,
  last_name,
  first_initial,
  last_initial,
  nationality,
  is_home_nation
)
values
  ${sqlRows.join(',\n  ')};

update public.players p
set
  display_name = seed.full_name,
  first_name = seed.first_name,
  last_name = seed.last_name,
  first_initial = seed.first_initial,
  last_initial = seed.last_initial,
  surname = seed.last_name,
  scrabble_name = seed.last_name,
  nationality = seed.nationality,
  is_home_nation = seed.is_home_nation
from player_identity_seed seed
join public.teams t
  on t.name = seed.team_name
where p.team_id = t.id
  and p.display_name in (seed.old_display_name, seed.current_display_name, seed.full_name);

select
  seed.team_name,
  seed.squad_status,
  seed.seed_order,
  seed.old_display_name,
  seed.full_name
from player_identity_seed seed
join public.teams t
  on t.name = seed.team_name
left join public.players p
  on p.team_id = t.id
  and p.display_name = seed.full_name
where p.id is null
order by seed.team_name, seed.squad_status, seed.seed_order;
`;

fs.writeFileSync(outputPath, output);

console.log(`Generated ${outputPath}`);
console.log(`Mapped rows: ${mappedRows.length}`);

if (warnings.length > 0) {
  console.warn('Warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}
