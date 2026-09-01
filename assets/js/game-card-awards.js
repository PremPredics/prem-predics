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

export function gameCardPerformanceKey(standing) {
  return [
    performanceValue(standing?.missed_gameweeks, Number.POSITIVE_INFINITY),
    performanceValue(standing?.exact_predictions),
    performanceValue(standing?.total_difference, Number.POSITIVE_INFINITY),
    performanceValue(standing?.weekly_wins),
    performanceValue(standing?.rank_points, Number.POSITIVE_INFINITY),
  ].join('|');
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
