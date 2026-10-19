// Fixtures are displayed in UK football time, including BST/GMT transitions.
export function kickoffLabel(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return 'TBC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('weekday').toUpperCase()} ${part('hour')}:${part('minute')}`;
}
