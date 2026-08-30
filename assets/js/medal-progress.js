export const UC_POINT_MEDAL_THRESHOLDS = Object.freeze([20, 40, 60, 80, 100, 125, 150, 175, 200, 225, 250, 275, 300]);
export const STAR_MAN_GOAL_MEDAL_THRESHOLDS = Object.freeze([1, 3, 5, 8, 12, 15, 20]);

export function nextMedalProgress(currentValue, thresholds, sourceKeys, sourcePrefix) {
  const current = Math.max(0, Number(currentValue) || 0);
  const earned = new Set((sourceKeys || []).map(String));
  const highestEarned = [...thresholds]
    .filter((threshold) => earned.has(`${sourcePrefix}${threshold}`))
    .at(-1) || 0;
  const nextThreshold = thresholds.find((threshold) => threshold > highestEarned) || null;

  if (!nextThreshold) {
    return { current, highestEarned, nextThreshold: null, percentage: 100, complete: true };
  }

  return {
    current,
    highestEarned,
    nextThreshold,
    percentage: Math.max(0, Math.min(100, Math.round((current / nextThreshold) * 100))),
    complete: false,
  };
}
