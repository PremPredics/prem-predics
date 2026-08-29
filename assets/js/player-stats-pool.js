export function normalisePlayerSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Øø]/g, 'o').replace(/[Ææ]/g, 'ae').replace(/[Œœ]/g, 'oe')
    .replace(/[Đđ]/g, 'd').replace(/[Þþ]/g, 'th').replace(/[Łł]/g, 'l')
    .toLowerCase().trim();
}

export function matchesPlayerSearch(player, query, extraNames = []) {
  const terms = normalisePlayerSearch(query).split(/\s+/).filter(Boolean);
  const text = normalisePlayerSearch([
    player.display_name, player.first_name, player.last_name, player.surname,
    player.nationality, ...extraNames,
  ].filter(Boolean).join(' '));
  return terms.length > 0 && terms.every((term) => text.includes(term));
}

// Build a separate index for Player Stats; never filter/mutate the shared
// active roster or the full Roster Review collection in place.
export function createPlayerStatsIndex({ seasonId, gameweeks, fixtures, assignments }) {
  const gameweekNumbers = new Map(gameweeks
    .filter((gw) => String(gw.season_id) === String(seasonId))
    .map((gw) => [String(gw.id), Number(gw.number)]));
  const byPlayer = new Map();
  for (const assignment of assignments) {
    if (String(assignment.season_id) !== String(seasonId)) continue;
    const key = String(assignment.player_id);
    const rows = byPlayer.get(key) || [];
    rows.push(assignment);
    byPlayer.set(key, rows);
  }
  function history(playerId) {
    return [...(byPlayer.get(String(playerId)) || [])].sort((a, b) => (
      (gameweekNumbers.get(String(a.starts_gameweek_id)) || 0)
      - (gameweekNumbers.get(String(b.starts_gameweek_id)) || 0)
    ));
  }
  function teamForFixture(player, fixture) {
    if (!player || !fixture || String(fixture.season_id) !== String(seasonId)) return null;
    const number = gameweekNumbers.get(String(fixture.gameweek_id));
    if (!Number.isFinite(number)) return null;
    const teams = new Set((byPlayer.get(String(player.id)) || []).filter((row) => {
      const start = gameweekNumbers.get(String(row.starts_gameweek_id));
      const end = row.ends_gameweek_id == null ? Infinity : gameweekNumbers.get(String(row.ends_gameweek_id));
      return Number.isFinite(start) && start <= number && end >= number;
    }).map((row) => String(row.team_id)));
    // A current team is not proof of historical tenure. Gaps and overlapping
    // assignments to different clubs need review, not an arbitrary latest row.
    if (teams.size !== 1) return null;
    const [teamId] = teams;
    return [String(fixture.home_team_id), String(fixture.away_team_id)].includes(teamId) ? teamId : null;
  }
  const currentTeamIds = new Set(fixtures.filter((f) => String(f.season_id) === String(seasonId))
    .flatMap((f) => [String(f.home_team_id), String(f.away_team_id)]));
  function eligible(player) {
    // Active current-team rows remain findable even if their missing history
    // needs repair. Editing still fails closed without a matching assignment.
    return (player.is_active === true && currentTeamIds.has(String(player.team_id)))
      || fixtures.some((fixture) => teamForFixture(player, fixture));
  }
  return { history, teamForFixture, eligible };
}
