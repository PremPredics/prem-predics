$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$workbookPath = Join-Path $root 'Premier League Predictions 2025-26.xlsx'
$outputPath = Join-Path $root 'supabase\seed-fixtures-2025-26.sql'

$kickoffDates = @{
  1 = '2025-08-16 15:00:00+01'; 2 = '2025-08-23 15:00:00+01'
  3 = '2025-08-30 15:00:00+01'; 4 = '2025-09-13 15:00:00+01'
  5 = '2025-09-20 15:00:00+01'; 6 = '2025-09-27 15:00:00+01'
  7 = '2025-10-04 15:00:00+01'; 8 = '2025-10-18 15:00:00+01'
  9 = '2025-10-25 15:00:00+01'; 10 = '2025-11-01 15:00:00+00'
  11 = '2025-11-08 15:00:00+00'; 12 = '2025-11-22 15:00:00+00'
  13 = '2025-11-29 15:00:00+00'; 14 = '2025-12-03 15:00:00+00'
  15 = '2025-12-06 15:00:00+00'; 16 = '2025-12-13 15:00:00+00'
  17 = '2025-12-20 15:00:00+00'; 18 = '2025-12-26 15:00:00+00'
  19 = '2025-12-30 15:00:00+00'; 20 = '2026-01-03 15:00:00+00'
  21 = '2026-01-07 15:00:00+00'; 22 = '2026-01-17 15:00:00+00'
  23 = '2026-01-24 15:00:00+00'; 24 = '2026-01-31 15:00:00+00'
  25 = '2026-02-07 15:00:00+00'; 26 = '2026-02-14 15:00:00+00'
  27 = '2026-02-21 15:00:00+00'; 28 = '2026-02-28 15:00:00+00'
  29 = '2026-03-04 15:00:00+00'; 30 = '2026-03-14 15:00:00+00'
  31 = '2026-03-21 15:00:00+00'; 32 = '2026-04-04 15:00:00+01'
  33 = '2026-04-11 15:00:00+01'; 34 = '2026-04-18 15:00:00+01'
  35 = '2026-04-25 15:00:00+01'; 36 = '2026-05-02 15:00:00+01'
  37 = '2026-05-09 15:00:00+01'; 38 = '2026-05-24 15:00:00+01'
}

function Read-ZipText($zip, $name) {
  $entry = $zip.GetEntry($name)
  if ($null -eq $entry) {
    throw "Could not find $name in workbook."
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  try {
    return $reader.ReadToEnd()
  }
  finally {
    $reader.Close()
  }
}

function Column-ToIndex($cellRef) {
  $letters = ([regex]::Match($cellRef, '^[A-Z]+')).Value
  $index = 0
  foreach ($char in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $index
}

function Sql-Text($value) {
  return "'" + ($value -replace "'", "''") + "'"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($workbookPath)
try {
  [xml]$sharedStringsXml = Read-ZipText $zip 'xl/sharedStrings.xml'
  $sharedNamespace = [System.Xml.XmlNamespaceManager]::new($sharedStringsXml.NameTable)
  $sharedNamespace.AddNamespace('d', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

  $sharedStrings = @()
  foreach ($item in $sharedStringsXml.SelectNodes('//d:si', $sharedNamespace)) {
    $parts = @()
    foreach ($textNode in $item.SelectNodes('.//d:t', $sharedNamespace)) {
      $parts += $textNode.InnerText
    }
    $sharedStrings += ($parts -join '')
  }

  function Cell-Value($cell) {
    if ($null -eq $cell.v) {
      return ''
    }
    if ($cell.t -eq 's') {
      return $sharedStrings[[int]$cell.v].Trim()
    }
    return ([string]$cell.v).Trim()
  }

  [xml]$sheetXml = Read-ZipText $zip 'xl/worksheets/sheet2.xml'
  $sheetNamespace = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
  $sheetNamespace.AddNamespace('d', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

  $fixtures = @()
  foreach ($row in $sheetXml.SelectNodes('//d:sheetData/d:row', $sheetNamespace)) {
    $cells = @{}
    foreach ($cell in $row.SelectNodes('d:c', $sheetNamespace)) {
      $cells[(Column-ToIndex $cell.r)] = Cell-Value $cell
    }

    $gameweek = $cells[2]
    $homeTeamName = $cells[3]
    $awayTeamName = $cells[8]

    if ($gameweek -match '^\d+$' -and [int]$gameweek -ge 1 -and [int]$gameweek -le 38 -and $homeTeamName -and $awayTeamName) {
      $fixtures += [pscustomobject]@{
        Gameweek = [int]$gameweek
        HomeTeam = $homeTeamName
        AwayTeam = $awayTeamName
      }
    }
  }
}
finally {
  $zip.Dispose()
}

if ($fixtures.Count -ne 380) {
  throw "Expected 380 fixtures, found $($fixtures.Count)."
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('-- Premier League 2025-26 fixture seed generated from Premier League Predictions 2025-26.xlsx.')
$lines.Add('-- Run after supabase/seed-season-2025-26.sql.')
$lines.Add('--')
$lines.Add('-- Every fixture is temporarily set to 15:00 UK time for its gameweek date.')
$lines.Add('-- Edit kickoff_at later in Supabase/admin tooling; fixture deadlines update automatically.')
$lines.Add('')
$lines.Add('with target_season as (')
$lines.Add('  select id')
$lines.Add('  from public.seasons')
$lines.Add("  where name = 'Premier League 2025-26'")
$lines.Add('  order by created_at desc')
$lines.Add('  limit 1')
$lines.Add('),')
$lines.Add('fixture_seed(gameweek_number, sort_order, home_team_name, away_team_name, kickoff_at) as (')
$lines.Add('  values')

$sortByGameweek = @{}
$values = [System.Collections.Generic.List[string]]::new()
foreach ($fixture in $fixtures) {
  if (-not $sortByGameweek.ContainsKey($fixture.Gameweek)) {
    $sortByGameweek[$fixture.Gameweek] = 0
  }
  $sortByGameweek[$fixture.Gameweek] += 1

  $values.Add((
    '    ({0}, {1}, {2}, {3}, timestamptz {4})' -f
      $fixture.Gameweek,
      $sortByGameweek[$fixture.Gameweek],
      (Sql-Text $fixture.HomeTeam),
      (Sql-Text $fixture.AwayTeam),
      (Sql-Text $kickoffDates[$fixture.Gameweek])
  ))
}

for ($index = 0; $index -lt $values.Count; $index++) {
  if ($index -eq $values.Count - 1) {
    $lines.Add($values[$index])
  }
  else {
    $lines.Add($values[$index] + ',')
  }
}

$lines.Add(')')
$lines.Add('insert into public.fixtures (')
$lines.Add('  season_id,')
$lines.Add('  gameweek_id,')
$lines.Add('  original_gameweek_id,')
$lines.Add('  home_team_id,')
$lines.Add('  away_team_id,')
$lines.Add('  kickoff_at,')
$lines.Add('  sort_order,')
$lines.Add('  status,')
$lines.Add('  admin_note')
$lines.Add(')')
$lines.Add('select')
$lines.Add('  target_season.id,')
$lines.Add('  gw.id,')
$lines.Add('  gw.id,')
$lines.Add('  home_team.id,')
$lines.Add('  away_team.id,')
$lines.Add('  fixture_seed.kickoff_at,')
$lines.Add('  fixture_seed.sort_order,')
$lines.Add("  'scheduled',")
$lines.Add("  'Temporary 15:00 kickoff imported from workbook; update manually when real kickoff time is known.'")
$lines.Add('from fixture_seed')
$lines.Add('cross join target_season')
$lines.Add('join public.gameweeks gw')
$lines.Add('  on gw.season_id = target_season.id')
$lines.Add(' and gw.number = fixture_seed.gameweek_number')
$lines.Add('join public.teams home_team')
$lines.Add('  on home_team.name = fixture_seed.home_team_name')
$lines.Add('join public.teams away_team')
$lines.Add('  on away_team.name = fixture_seed.away_team_name')
$lines.Add('where not exists (')
$lines.Add('  select 1')
$lines.Add('  from public.fixtures existing')
$lines.Add('  where existing.season_id = target_season.id')
$lines.Add('    and existing.gameweek_id = gw.id')
$lines.Add('    and existing.home_team_id = home_team.id')
$lines.Add('    and existing.away_team_id = away_team.id')
$lines.Add(');')
$lines.Add('')
$lines.Add('with target_season as (')
$lines.Add('  select id')
$lines.Add('  from public.seasons')
$lines.Add("  where name = 'Premier League 2025-26'")
$lines.Add('  order by created_at desc')
$lines.Add('  limit 1')
$lines.Add(')')
$lines.Add('select')
$lines.Add('  gw.number as gameweek,')
$lines.Add('  count(f.id) as fixtures,')
$lines.Add('  min(f.kickoff_at) as first_kickoff,')
$lines.Add('  max(f.kickoff_at) as last_kickoff')
$lines.Add('from target_season')
$lines.Add('join public.gameweeks gw on gw.season_id = target_season.id')
$lines.Add('left join public.fixtures f on f.gameweek_id = gw.id')
$lines.Add('group by gw.number')
$lines.Add('order by gw.number;')

Set-Content -LiteralPath $outputPath -Value $lines -Encoding UTF8
Write-Output "Wrote $outputPath with $($fixtures.Count) fixtures."
