export function gameCardSuperMedalAwardCount(memberCount, roundRank) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  const rank = Number(roundRank);

  if (rank === 1) {
    return members <= 3 ? 1 : 2;
  }

  return members >= 7 && rank === 2 ? 1 : 0;
}

function performanceValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function compareMainLeagueCriteria(a, b) {
  return (
    performanceValue(b?.ultimate_champion_points) - performanceValue(a?.ultimate_champion_points)
    || performanceValue(b?.correct_scores) - performanceValue(a?.correct_scores)
    || performanceValue(b?.correct_results) - performanceValue(a?.correct_results)
    || performanceValue(b?.prediction_points) - performanceValue(a?.prediction_points)
    || performanceValue(b?.star_man_points) - performanceValue(a?.star_man_points)
    || performanceValue(b?.star_man_goals) - performanceValue(a?.star_man_goals)
    || performanceValue(b?.star_man_assists) - performanceValue(a?.star_man_assists)
    || performanceValue(a?.star_man_yellows) - performanceValue(b?.star_man_yellows)
    || performanceValue(a?.star_man_reds) - performanceValue(b?.star_man_reds)
  );
}

export function gameCardMainLeaguePositions(rows = []) {
  const ordered = rows
    .filter((row) => row?.user_id)
    .slice()
    .sort((a, b) => (
      compareMainLeagueCriteria(a, b)
      || String(a.user_id).localeCompare(String(b.user_id))
    ));
  const positions = {};
  let displayedPosition = 0;
  let previous = null;

  ordered.forEach((row, index) => {
    if (!previous || compareMainLeagueCriteria(previous, row) !== 0) {
      displayedPosition = index + 1;
    }
    positions[String(row.user_id)] = displayedPosition;
    previous = row;
  });

  return positions;
}

export function compareGameCardPerformance(a, b) {
  return (
    performanceValue(a?.missed_gameweeks, Number.POSITIVE_INFINITY)
      - performanceValue(b?.missed_gameweeks, Number.POSITIVE_INFINITY)
    || performanceValue(b?.exact_predictions) - performanceValue(a?.exact_predictions)
    || performanceValue(a?.total_difference, Number.POSITIVE_INFINITY)
      - performanceValue(b?.total_difference, Number.POSITIVE_INFINITY)
    || performanceValue(b?.weekly_wins) - performanceValue(a?.weekly_wins)
    || performanceValue(a?.rank_points, Number.POSITIVE_INFINITY)
      - performanceValue(b?.rank_points, Number.POSITIVE_INFINITY)
  );
}

export function gameCardPerformanceKey(standing) {
  return [
    performanceValue(standing?.missed_gameweeks, Number.POSITIVE_INFINITY),
    performanceValue(standing?.exact_predictions),
    performanceValue(standing?.total_difference, Number.POSITIVE_INFINITY),
    performanceValue(standing?.weekly_wins),
    performanceValue(standing?.rank_points, Number.POSITIVE_INFINITY),
  ].join('|');
}

export function gameCardLiveOrderedStandings(memberCount, standings = [], mainLeaguePositions = {}) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  const eligible = standings.filter((standing) => standing?.user_id).slice();
  const performanceOrdered = eligible.slice().sort((a, b) => (
    compareGameCardPerformance(a, b)
    || String(a.user_id).localeCompare(String(b.user_id))
  ));
  const bestPerformanceKey = gameCardPerformanceKey(performanceOrdered[0]);
  const bestPerformancePlayers = performanceOrdered.filter(
    (standing) => gameCardPerformanceKey(standing) === bestPerformanceKey,
  );
  const sharesTwoMedalPool = members >= 4
    && members <= 6
    && bestPerformancePlayers.length === 2;

  return eligible
    .sort((a, b) => {
      const performanceOrder = compareGameCardPerformance(a, b);
      if (performanceOrder) return performanceOrder;

      const sharedBestPair = sharesTwoMedalPool
        && gameCardPerformanceKey(a) === bestPerformanceKey
        && gameCardPerformanceKey(b) === bestPerformanceKey;
      if (!sharedBestPair) {
        const leaguePositionOrder = performanceValue(
          mainLeaguePositions[String(a.user_id)],
          Number.POSITIVE_INFINITY,
        ) - performanceValue(
          mainLeaguePositions[String(b.user_id)],
          Number.POSITIVE_INFINITY,
        );
        if (leaguePositionOrder) return leaguePositionOrder;
      }

      return performanceValue(a?.random_tiebreak_rank, Number.POSITIVE_INFINITY)
        - performanceValue(b?.random_tiebreak_rank, Number.POSITIVE_INFINITY)
        || String(a.user_id).localeCompare(String(b.user_id));
    })
    .map((standing, index) => ({
      ...standing,
      round_rank: index + 1,
      live_league_position: mainLeaguePositions[String(standing.user_id)] ?? null,
    }));
}

export function gameCardSuperMedalAwardCounts(memberCount, standings = []) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  const ordered = standings
    .filter((standing) => standing?.user_id && Number.isFinite(Number(standing.round_rank)))
    .slice()
    .sort((a, b) => (
      Number(a.round_rank) - Number(b.round_rank)
      || String(a.user_id).localeCompare(String(b.user_id))
    ));
  const awards = {};
  const first = ordered[0];

  if (!first) return awards;

  if (members <= 3) {
    awards[String(first.user_id)] = 1;
    return awards;
  }

  if (members <= 6) {
    const bestPerformanceKey = gameCardPerformanceKey(first);
    const bestPerformancePlayers = ordered.filter(
      (standing) => gameCardPerformanceKey(standing) === bestPerformanceKey,
    );

    if (bestPerformancePlayers.length === 2) {
      bestPerformancePlayers.forEach((standing) => {
        awards[String(standing.user_id)] = 1;
      });
    } else {
      awards[String(first.user_id)] = 2;
    }
    return awards;
  }

  awards[String(first.user_id)] = 2;
  if (ordered[1]) awards[String(ordered[1].user_id)] = 1;
  return awards;
}

export function gameCardSuperMedalAwardSummary(memberCount) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  if (members <= 3) return '1st: 1 Super Medal';
  if (members <= 6) return '1st: 2 Super Medals · exact two-way tie: 1 each';
  return '1st: 2 Super Medals · 2nd: 1 Super Medal';
}
