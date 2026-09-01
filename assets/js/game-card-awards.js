export function gameCardSuperMedalAwardCount(memberCount, roundRank) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  const rank = Number(roundRank);

  if (rank === 1) {
    return members <= 3 ? 1 : 2;
  }

  return members >= 7 && rank === 2 ? 1 : 0;
}

export function gameCardSuperMedalAwardSummary(memberCount) {
  const members = Math.min(10, Math.max(2, Number(memberCount) || 2));
  if (members <= 3) return '1st: 1 Super Medal';
  if (members <= 6) return '1st: 2 Super Medals';
  return '1st: 2 Super Medals · 2nd: 1 Super Medal';
}
