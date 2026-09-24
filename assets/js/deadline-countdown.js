// Presentation only: deadlines themselves are always checked against exact timestamps.
export function formatDeadlineDuration(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '0h 0m';
  const hours = Math.floor(remainingMs / 3600000);
  if (remainingMs >= 86400000) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  const minutes = Math.max(1, Math.floor(remainingMs / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
