import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const FPL_BOOTSTRAP_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const rosterPath = path.join(root, 'supabase', 'replace-star-man-player-pool-2026-05-19.sql');
const sqlOutputPath = path.join(root, 'supabase', 'generated-player-photo-fpl-update.sql');
const reportOutputPath = path.join(root, 'supabase', 'generated-player-photo-fpl-report.json');
const unmatchedOutputPath = path.join(root, 'supabase', 'generated-player-photo-fpl-unmatched.txt');

const teamAliases = new Map([
  ['afc bournemouth', 'bournemouth'],
  ['bournemouth', 'bournemouth'],
  ['arsenal', 'arsenal'],
  ['aston villa', 'aston villa'],
  ['brentford', 'brentford'],
  ['brighton', 'brighton'],
  ['brighton hove albion', 'brighton'],
  ['brighton and hove albion', 'brighton'],
  ['burnley', 'burnley'],
  ['chelsea', 'chelsea'],
  ['crystal palace', 'crystal palace'],
  ['everton', 'everton'],
  ['fulham', 'fulham'],
  ['leeds', 'leeds'],
  ['leeds united', 'leeds'],
  ['liverpool', 'liverpool'],
  ['man city', 'manchester city'],
  ['manchester city', 'manchester city'],
  ['man utd', 'manchester united'],
  ['man united', 'manchester united'],
  ['manchester united', 'manchester united'],
  ['newcastle', 'newcastle'],
  ['newcastle united', 'newcastle'],
  ['nottingham forest', 'nottingham forest'],
  ['nottm forest', 'nottingham forest'],
  ["nott'm forest", 'nottingham forest'],
  ['sunderland', 'sunderland'],
  ['spurs', 'tottenham'],
  ['tottenham', 'tottenham'],
  ['tottenham hotspur', 'tottenham'],
  ['west ham', 'west ham'],
  ['west ham united', 'west ham'],
  ['wolverhampton', 'wolverhampton'],
  ['wolverhampton wanderers', 'wolverhampton'],
  ['wolves', 'wolverhampton'],
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function repairMojibake(value) {
  const text = String(value || '');
  if (!/[ÃÂâ]/.test(text)) {
    return text;
  }

  try {
    return Buffer.from(text, 'latin1').toString('utf8');
  } catch {
    return text;
  }
}

function normalise(value) {
  return clean(repairMojibake(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function normaliseTeam(value) {
  const normalised = normalise(value);
  return teamAliases.get(normalised) || normalised;
}

function sql(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function splitName(fullName) {
  const parts = clean(repairMojibake(fullName)).split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '',
  };
}

function fplPhotoUrl(player) {
  if (!player?.code) {
    return '';
  }

  return `https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.code}.png`;
}

function parseRoster() {
  const text = fs.readFileSync(rosterPath, 'utf8');
  const match = text.match(/\$roster\$([\s\S]*?)\$roster\$/);
  if (!match) {
    throw new Error(`Could not find $roster$ block in ${rosterPath}`);
  }

  const rows = [];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = clean(repairMojibake(rawLine));
    if (!line || line === 'Name - Team - Country - Height') {
      continue;
    }

    const parts = line.split(' - ').map(clean);
    if (parts.length < 4) {
      continue;
    }

    const [displayName, teamName, nationality, height] = parts;
    rows.push({
      displayName,
      teamName,
      nationality,
      heightCm: Number(height) || null,
      normalisedName: normalise(displayName),
      normalisedTeam: normaliseTeam(teamName),
      ...splitName(displayName),
    });
  }

  rows.push({
    displayName: 'Felipe',
    teamName: 'Nottingham Forest',
    nationality: 'Brazil',
    heightCm: 190,
    normalisedName: normalise('Felipe'),
    normalisedTeam: normaliseTeam('Nottingham Forest'),
    ...splitName('Felipe'),
  });

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.normalisedTeam}|${row.normalisedName}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchFplPlayers() {
  const response = await fetch(FPL_BOOTSTRAP_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'PremPredicsPhotoImporter/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`FPL bootstrap request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const teams = new Map((data.teams || []).map((team) => [team.id, team]));

  return (data.elements || []).map((player) => {
    const team = teams.get(player.team);
    const fullName = clean(`${player.first_name || ''} ${player.second_name || ''}`);
    const webName = clean(player.web_name);
    const names = [
      fullName,
      webName,
      clean(`${player.first_name || ''} ${player.web_name || ''}`),
      clean(`${player.web_name || ''} ${player.second_name || ''}`),
    ].filter(Boolean);

    return {
      id: player.id,
      code: player.code,
      firstName: clean(player.first_name),
      secondName: clean(player.second_name),
      webName,
      fullName,
      teamName: team?.name || '',
      teamShortName: team?.short_name || '',
      normalisedTeam: normaliseTeam(team?.name || team?.short_name || ''),
      photoUrl: fplPhotoUrl(player),
      normalisedNames: [...new Set(names.map(normalise).filter(Boolean))],
    };
  });
}

function buildIndexes(fplPlayers) {
  const byTeamAndName = new Map();
  const byName = new Map();

  for (const player of fplPlayers) {
    for (const name of player.normalisedNames) {
      const teamKey = `${player.normalisedTeam}|${name}`;
      const teamGroup = byTeamAndName.get(teamKey) || [];
      teamGroup.push(player);
      byTeamAndName.set(teamKey, teamGroup);

      const nameGroup = byName.get(name) || [];
      nameGroup.push(player);
      byName.set(name, nameGroup);
    }
  }

  return { byTeamAndName, byName, fplPlayers };
}

function nameTokens(value) {
  return normalise(value).split(' ').filter(Boolean);
}

function isSafeSameTeamFuzzyName(rosterName, fplName) {
  const rosterTokens = nameTokens(rosterName);
  const fplTokens = nameTokens(fplName);

  if (rosterTokens.length < 2 || fplTokens.length < 2) {
    return false;
  }

  const rosterFirst = rosterTokens[0];
  const rosterLast = rosterTokens[rosterTokens.length - 1];
  const fplFirst = fplTokens[0];
  const fplLast = fplTokens[fplTokens.length - 1];

  if (rosterLast === fplLast && (rosterFirst === fplFirst || rosterFirst[0] === fplFirst[0])) {
    return true;
  }

  const fplTokenSet = new Set(fplTokens);
  return rosterFirst === fplFirst && rosterTokens.every((token) => fplTokenSet.has(token));
}

function matchRosterPlayer(row, indexes) {
  const exactTeam = indexes.byTeamAndName.get(`${row.normalisedTeam}|${row.normalisedName}`) || [];
  if (exactTeam.length === 1) {
    return { type: 'team-name-exact', player: exactTeam[0] };
  }

  const exactName = indexes.byName.get(row.normalisedName) || [];
  const uniqueName = exactName.length === 1 ? exactName[0] : null;
  if (uniqueName && uniqueName.normalisedTeam === row.normalisedTeam) {
    return { type: 'name-exact-team-confirmed', player: uniqueName };
  }

  const sameTeamCandidates = indexes.fplPlayers.filter((player) => {
    if (player.normalisedTeam !== row.normalisedTeam) {
      return false;
    }

    const candidateNames = [
      player.fullName,
      clean(`${player.firstName} ${player.webName}`),
      clean(`${player.webName} ${player.secondName}`),
    ].filter(Boolean);

    return candidateNames.some((name) => isSafeSameTeamFuzzyName(row.displayName, name));
  });

  const uniqueSameTeamCandidates = [...new Map(sameTeamCandidates.map((player) => [player.id, player])).values()];
  if (uniqueSameTeamCandidates.length === 1) {
    return { type: 'team-name-fuzzy-safe', player: uniqueSameTeamCandidates[0] };
  }

  const possible = [];
  for (const player of indexes.fplPlayers) {
    if (possible.length >= 6) {
      continue;
    }

    const candidateNames = [
      player.fullName,
      player.webName,
      clean(`${player.firstName} ${player.webName}`),
      clean(`${player.webName} ${player.secondName}`),
    ].filter(Boolean);

    if (candidateNames.some((name) => isSafeSameTeamFuzzyName(row.displayName, name))) {
      possible.push(player);
    }
  }

  return {
    type: 'unmatched',
    player: null,
    possible: (exactName.length ? exactName : possible).slice(0, 6).map((player) => ({
      name: player.fullName || player.webName,
      team: player.teamName,
      photoUrl: player.photoUrl,
    })),
  };
}

function renderSql(matches) {
  const values = matches
    .map(({ roster, fpl, matchType }) => `  (${sql(roster.displayName)}, ${sql(roster.teamName)}, ${sql(fpl.photoUrl)}, ${sql(matchType)}, ${sql(fpl.fullName || fpl.webName)}, ${sql(fpl.teamName)})`)
    .join(',\n');

  return `-- Generated by tools/generate-fpl-player-photo-sql.mjs.
-- Review this file, then run it in Supabase.
-- It only updates public.players.photo_url for matched players.

alter table public.players
  add column if not exists photo_url text;

drop table if exists pg_temp.player_photo_seed;
create temp table player_photo_seed (
  display_name text not null,
  team_name text not null,
  photo_url text not null,
  match_type text,
  source_player_name text,
  source_team_name text
);

${values ? `insert into pg_temp.player_photo_seed (display_name, team_name, photo_url, match_type, source_player_name, source_team_name)
values
${values};` : '-- No automatic matches were generated.'}

with normalised_seed as (
  select
    trim(display_name) as display_name,
    case trim(team_name)
      when 'Brighton & Hove Albion' then 'Brighton'
      when 'Leeds United' then 'Leeds'
      when 'Newcastle United' then 'Newcastle'
      when 'Tottenham Hotspur' then 'Tottenham'
      when 'West Ham United' then 'West Ham'
      when 'Wolverhampton Wanderers' then 'Wolverhampton'
      else trim(team_name)
    end as team_name,
    nullif(trim(photo_url), '') as photo_url
  from pg_temp.player_photo_seed
)
update public.players player
set photo_url = normalised_seed.photo_url
from normalised_seed
join public.teams team
  on team.name = normalised_seed.team_name
where player.team_id = team.id
  and lower(player.display_name) = lower(normalised_seed.display_name)
  and normalised_seed.photo_url is not null;

select
  player.display_name,
  team.name as team_name,
  player.photo_url
from public.players player
join public.teams team
  on team.id = player.team_id
where player.is_active = true
  and nullif(trim(coalesce(player.photo_url, '')), '') is null
order by team.name, player.display_name;
`;
}

function renderUnmatched(unmatched) {
  if (!unmatched.length) {
    return 'All roster players were matched automatically.\n';
  }

  return unmatched.map(({ roster, possible }) => {
    const suggestions = possible?.length
      ? possible.map((item) => `    maybe: ${item.name} - ${item.team} - ${item.photoUrl}`).join('\n')
      : '    no close FPL name match found';
    return `${roster.displayName} - ${roster.teamName}\n${suggestions}`;
  }).join('\n\n') + '\n';
}

async function main() {
  const roster = parseRoster();
  const fplPlayers = await fetchFplPlayers();
  const indexes = buildIndexes(fplPlayers);
  const matched = [];
  const unmatched = [];

  for (const rosterRow of roster) {
    const match = matchRosterPlayer(rosterRow, indexes);
    if (match.player) {
      matched.push({
        roster: rosterRow,
        fpl: match.player,
        matchType: match.type,
      });
    } else {
      unmatched.push({
        roster: rosterRow,
        possible: match.possible || [],
      });
    }
  }

  fs.writeFileSync(sqlOutputPath, renderSql(matched), 'utf8');
  fs.writeFileSync(unmatchedOutputPath, renderUnmatched(unmatched), 'utf8');
  fs.writeFileSync(reportOutputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: FPL_BOOTSTRAP_URL,
    rosterCount: roster.length,
    fplCount: fplPlayers.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched: matched.map(({ roster, fpl, matchType }) => ({
      displayName: roster.displayName,
      teamName: roster.teamName,
      photoUrl: fpl.photoUrl,
      matchType,
      sourcePlayerName: fpl.fullName || fpl.webName,
      sourceTeamName: fpl.teamName,
    })),
    unmatched: unmatched.map(({ roster, possible }) => ({
      displayName: roster.displayName,
      teamName: roster.teamName,
      possible,
    })),
  }, null, 2), 'utf8');

  console.log(`Roster players: ${roster.length}`);
  console.log(`FPL players: ${fplPlayers.length}`);
  console.log(`Matched photos: ${matched.length}`);
  console.log(`Unmatched players: ${unmatched.length}`);
  console.log(`SQL: ${path.relative(root, sqlOutputPath)}`);
  console.log(`Report: ${path.relative(root, reportOutputPath)}`);
  console.log(`Unmatched: ${path.relative(root, unmatchedOutputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
