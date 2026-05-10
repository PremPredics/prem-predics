$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$htmlPath = Join-Path $root 'supabase\premier-league-squad-list-2025-26.html'
$outputPath = Join-Path $root 'supabase\seed-players-2025-26.sql'
$summaryPath = Join-Path $root 'supabase\seed-players-2025-26-summary.csv'

if (-not (Test-Path -LiteralPath $htmlPath)) {
  throw "Missing $htmlPath. Download the Premier League squad-list page first."
}

$clubMap = @{
  'AFC Bournemouth' = 'Bournemouth'
  'Arsenal' = 'Arsenal'
  'Aston Villa' = 'Aston Villa'
  'Brentford' = 'Brentford'
  'Brighton & Hove Albion' = 'Brighton'
  'Burnley' = 'Burnley'
  'Chelsea' = 'Chelsea'
  'Crystal Palace' = 'Crystal Palace'
  'Everton' = 'Everton'
  'Fulham' = 'Fulham'
  'Leeds United' = 'Leeds'
  'Liverpool' = 'Liverpool'
  'Manchester City' = 'Manchester City'
  'Manchester United' = 'Manchester United'
  'Newcastle United' = 'Newcastle'
  'Nottingham Forest' = 'Nottingham Forest'
  'Sunderland' = 'Sunderland'
  'Tottenham Hotspur' = 'Tottenham'
  'West Ham United' = 'West Ham'
  'Wolverhampton Wanderers' = 'Wolverhampton'
}

function Normalize-Whitespace($value) {
  return (($value -replace [char]0x00A0, ' ') -replace '\s+', ' ').Trim()
}

function Sql-Text($value) {
  if ($null -eq $value -or $value -eq '') {
    return 'null'
  }
  return "'" + ($value -replace "'", "''") + "'"
}

function Parse-PlayerName($rawName) {
  $clean = Normalize-Whitespace ($rawName -replace '\s+,', ',')
  $isHomegrown = $clean.EndsWith('*')
  if ($isHomegrown) {
    $clean = Normalize-Whitespace ($clean.Substring(0, $clean.Length - 1))
  }

  $commaIndex = $clean.IndexOf(',')
  if ($commaIndex -lt 0) {
    $bits = $clean -split '\s+'
    $surname = if ($bits.Count -gt 0) { $bits[$bits.Count - 1] } else { $clean }
    return [pscustomobject]@{
      DisplayName = $clean
      Surname = $surname
      IsHomegrown = $isHomegrown
    }
  }

  $surname = Normalize-Whitespace $clean.Substring(0, $commaIndex)
  $givenNames = Normalize-Whitespace $clean.Substring($commaIndex + 1)
  return [pscustomobject]@{
    DisplayName = Normalize-Whitespace "$givenNames $surname"
    Surname = $surname
    IsHomegrown = $isHomegrown
  }
}

$html = Get-Content -LiteralPath $htmlPath -Raw
$articleStart = $html.IndexOf('<article')
if ($articleStart -ge 0) {
  $html = $html.Substring($articleStart)
}

$clubPattern = '(?s)<h5><a[^>]*>(?<club>.*?)</a></h5>(?<body>.*?)(?=<h5><a|<h4|</article>)'
$matches = [regex]::Matches($html, $clubPattern)
$players = [System.Collections.Generic.List[object]]::new()

foreach ($match in $matches) {
  $rawClub = [System.Net.WebUtility]::HtmlDecode(($match.Groups['club'].Value -replace '<.*?>', ''))
  $club = Normalize-Whitespace $rawClub
  if (-not $clubMap.ContainsKey($club)) {
    continue
  }

  $teamName = $clubMap[$club]
  $body = $match.Groups['body'].Value
  $body = $body -replace '(?i)<br\s*/?>', "`n"
  $body = $body -replace '(?i)</p>', "`n"
  $body = $body -replace '<.*?>', ''
  $body = [System.Net.WebUtility]::HtmlDecode($body)

  $status = $null
  foreach ($line in ($body -split "`n")) {
    $lineText = Normalize-Whitespace $line
    if ($lineText -eq '' -or $lineText -eq 'Premier League - Squad List 2025/26') {
      continue
    }
    if ($lineText -like '25 Squad players*') {
      $status = 'squad_player'
      continue
    }
    if ($lineText -like 'U21 players*') {
      $status = 'u21'
      continue
    }

    $lineMatch = [regex]::Match($lineText, '^\d+\s+(?<name>.+)$')
    if (-not $lineMatch.Success -or $null -eq $status) {
      continue
    }

    $parsed = Parse-PlayerName $lineMatch.Groups['name'].Value
    $players.Add([pscustomobject]@{
      TeamName = $teamName
      SquadStatus = $status
      DisplayName = $parsed.DisplayName
      Surname = $parsed.Surname
      IsHomegrown = [bool]$parsed.IsHomegrown
    })
  }
}

$expectedTeams = $clubMap.Values | Sort-Object -Unique
$actualTeams = $players.TeamName | Sort-Object -Unique
$missingTeams = @($expectedTeams | Where-Object { $_ -notin $actualTeams })
if ($missingTeams.Count -gt 0) {
  throw "Missing teams in parsed squad list: $($missingTeams -join ', ')"
}

if ($players.Count -lt 900) {
  throw "Parsed only $($players.Count) players; expected the full Premier League squad pool."
}

$duplicateRows = $players |
  Group-Object TeamName, DisplayName |
  Where-Object { $_.Count -gt 1 }
if ($duplicateRows.Count -gt 0) {
  throw "Duplicate player rows found for same team/display name."
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('-- Premier League 2025-26 full player seed.')
$lines.Add('-- Generated from the official Premier League updated squad-list page.')
$lines.Add('-- Run after supabase/seed-season-2025-26.sql and supabase/seed-fixtures-2025-26.sql.')
$lines.Add('')
$lines.Add('alter table public.players')
$lines.Add("add column if not exists squad_status text check (squad_status is null or squad_status in ('squad_player', 'u21')),")
$lines.Add('add column if not exists is_homegrown boolean not null default false,')
$lines.Add('add column if not exists position text,')
$lines.Add('add column if not exists date_of_birth date;')
$lines.Add('')
$lines.Add('create temporary table player_team_seed (')
$lines.Add('  display_name text not null,')
$lines.Add('  surname text,')
$lines.Add('  scrabble_name text,')
$lines.Add('  team_name text not null,')
$lines.Add("  squad_status text not null check (squad_status in ('squad_player', 'u21')),")
$lines.Add('  is_homegrown boolean not null default false,')
$lines.Add('  position text,')
$lines.Add('  date_of_birth date,')
$lines.Add('  starts_gameweek_number integer not null check (starts_gameweek_number between 1 and 38),')
$lines.Add('  ends_gameweek_number integer check (ends_gameweek_number between 1 and 38),')
$lines.Add('  check (ends_gameweek_number is null or ends_gameweek_number >= starts_gameweek_number)')
$lines.Add(') on commit drop;')
$lines.Add('')
$lines.Add('insert into player_team_seed (')
$lines.Add('  display_name,')
$lines.Add('  surname,')
$lines.Add('  scrabble_name,')
$lines.Add('  team_name,')
$lines.Add('  squad_status,')
$lines.Add('  is_homegrown,')
$lines.Add('  position,')
$lines.Add('  date_of_birth,')
$lines.Add('  starts_gameweek_number,')
$lines.Add('  ends_gameweek_number')
$lines.Add(')')
$lines.Add('values')

$valueLines = [System.Collections.Generic.List[string]]::new()
foreach ($player in $players) {
  $valueLines.Add((
    '  ({0}, {1}, null, {2}, {3}, {4}, null, null, 1, null)' -f
      (Sql-Text $player.DisplayName),
      (Sql-Text $player.Surname),
      (Sql-Text $player.TeamName),
      (Sql-Text $player.SquadStatus),
      ($(if ($player.IsHomegrown) { 'true' } else { 'false' }))
  ))
}

for ($index = 0; $index -lt $valueLines.Count; $index++) {
  if ($index -eq $valueLines.Count - 1) {
    $lines.Add($valueLines[$index] + ';')
  }
  else {
    $lines.Add($valueLines[$index] + ',')
  }
}

$lines.Add('')
$lines.Add('insert into public.players (display_name, surname, scrabble_name, team_id, squad_status, is_homegrown, position, date_of_birth)')
$lines.Add('select distinct')
$lines.Add('  seed.display_name,')
$lines.Add('  seed.surname,')
$lines.Add('  seed.scrabble_name,')
$lines.Add('  t.id,')
$lines.Add('  seed.squad_status,')
$lines.Add('  seed.is_homegrown,')
$lines.Add('  seed.position,')
$lines.Add('  seed.date_of_birth')
$lines.Add('from player_team_seed seed')
$lines.Add('join public.teams t')
$lines.Add('  on t.name = seed.team_name')
$lines.Add('where not exists (')
$lines.Add('  select 1')
$lines.Add('  from public.players existing')
$lines.Add('  where existing.display_name = seed.display_name')
$lines.Add('    and existing.team_id = t.id')
$lines.Add(');')
$lines.Add('')
$lines.Add('update public.players existing')
$lines.Add('set')
$lines.Add('  surname = coalesce(seed.surname, existing.surname),')
$lines.Add('  scrabble_name = coalesce(seed.scrabble_name, existing.scrabble_name),')
$lines.Add('  squad_status = seed.squad_status,')
$lines.Add('  is_homegrown = seed.is_homegrown,')
$lines.Add('  position = coalesce(seed.position, existing.position),')
$lines.Add('  date_of_birth = coalesce(seed.date_of_birth, existing.date_of_birth)')
$lines.Add('from player_team_seed seed')
$lines.Add('join public.teams t')
$lines.Add('  on t.name = seed.team_name')
$lines.Add('where existing.display_name = seed.display_name')
$lines.Add('  and existing.team_id = t.id;')
$lines.Add('')
$lines.Add('with target_season as (')
$lines.Add('  select id')
$lines.Add('  from public.seasons')
$lines.Add("  where name = 'Premier League 2025-26'")
$lines.Add('  order by created_at desc')
$lines.Add('  limit 1')
$lines.Add('),')
$lines.Add('resolved_seed as (')
$lines.Add('  select')
$lines.Add('    p.id as player_id,')
$lines.Add('    t.id as team_id,')
$lines.Add('    target_season.id as season_id,')
$lines.Add('    start_gw.id as starts_gameweek_id,')
$lines.Add('    end_gw.id as ends_gameweek_id')
$lines.Add('  from player_team_seed seed')
$lines.Add('  cross join target_season')
$lines.Add('  join public.teams t')
$lines.Add('    on t.name = seed.team_name')
$lines.Add('  join public.players p')
$lines.Add('    on p.display_name = seed.display_name')
$lines.Add('   and p.team_id = t.id')
$lines.Add('  join public.gameweeks start_gw')
$lines.Add('    on start_gw.season_id = target_season.id')
$lines.Add('   and start_gw.number = seed.starts_gameweek_number')
$lines.Add('  left join public.gameweeks end_gw')
$lines.Add('    on end_gw.season_id = target_season.id')
$lines.Add('   and end_gw.number = seed.ends_gameweek_number')
$lines.Add(')')
$lines.Add('insert into public.player_team_assignments (')
$lines.Add('  season_id,')
$lines.Add('  player_id,')
$lines.Add('  team_id,')
$lines.Add('  starts_gameweek_id,')
$lines.Add('  ends_gameweek_id')
$lines.Add(')')
$lines.Add('select')
$lines.Add('  resolved_seed.season_id,')
$lines.Add('  resolved_seed.player_id,')
$lines.Add('  resolved_seed.team_id,')
$lines.Add('  resolved_seed.starts_gameweek_id,')
$lines.Add('  resolved_seed.ends_gameweek_id')
$lines.Add('from resolved_seed')
$lines.Add('where not exists (')
$lines.Add('  select 1')
$lines.Add('  from public.player_team_assignments existing')
$lines.Add('  where existing.season_id = resolved_seed.season_id')
$lines.Add('    and existing.player_id = resolved_seed.player_id')
$lines.Add('    and existing.team_id = resolved_seed.team_id')
$lines.Add('    and existing.starts_gameweek_id = resolved_seed.starts_gameweek_id')
$lines.Add('    and coalesce(existing.ends_gameweek_id, -1) = coalesce(resolved_seed.ends_gameweek_id, -1)')
$lines.Add(');')
$lines.Add('')
$lines.Add('select')
$lines.Add('  t.name as team,')
$lines.Add('  count(*) filter (where p.squad_status = ''squad_player'') as squad_players,')
$lines.Add('  count(*) filter (where p.squad_status = ''u21'') as u21_players,')
$lines.Add('  count(*) as total_players')
$lines.Add('from public.players p')
$lines.Add('join public.teams t on t.id = p.team_id')
$lines.Add('group by t.name')
$lines.Add('order by t.name;')

Set-Content -LiteralPath $outputPath -Value $lines -Encoding UTF8

$players |
  Group-Object TeamName |
  ForEach-Object {
    [pscustomobject]@{
      team = $_.Name
      squad_players = @($_.Group | Where-Object { $_.SquadStatus -eq 'squad_player' }).Count
      u21_players = @($_.Group | Where-Object { $_.SquadStatus -eq 'u21' }).Count
      total_players = $_.Count
    }
  } |
  Sort-Object team |
  Export-Csv -LiteralPath $summaryPath -NoTypeInformation -Encoding UTF8

Write-Output "Wrote $outputPath with $($players.Count) players."
Write-Output "Wrote $summaryPath."
