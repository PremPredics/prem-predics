const value = (row, key) => Number(row?.[key] || 0);

export const AWARDS = [
  { key: 'nostradamus', title: 'Nostradamus', description: 'Most Correct Scores.', unit: 'correct scores', icon: 'eye' },
  { key: 'copycats', title: 'Copycats', description: 'The pair with the most identical predictions.', unit: 'matching matches', icon: 'copy' },
  { key: 'superman', title: 'Superman', description: 'Most Power Cards played.', unit: 'powers played', icon: 'bolt' },
  { key: 'received', title: 'Why Always Me?', description: 'Most Curses received.', unit: 'curses received', icon: 'shield' },
  { key: 'post', title: 'Hit The Post!', description: 'Most predictions one goal from an exact score.', unit: 'near misses', icon: 'target' },
  { key: 'entertainer', title: 'The Entertainer', description: 'Highest average goals predicted per match.', unit: 'goals per match', icon: 'ball' },
  { key: 'jinx', title: 'The Jinx', description: 'Most Curses played against other members.', unit: 'curses played', icon: 'moon' },
  { key: 'best', title: 'Best Prediction', description: 'The highest-scoring match predicted exactly.', unit: 'match goals', icon: 'diamond' },
  { key: 'world', title: 'Against The World', description: 'Correct when everyone else predicted a different result.', unit: 'lone successes', icon: 'flag' },
  { key: 'passport', title: 'The Passport Collector', description: 'Most nationalities among Star Man picks.', unit: 'nationalities', icon: 'globe' },
  { key: 'starboy', title: 'The Starboy', description: 'Most points earned from Star Man picks.', unit: 'Star Man points', icon: 'star' },
];

export function buildAwards(data) {
  const rows = data.members || [];
  return AWARDS.flatMap((definition, index) => {
    const key = definition.key;
    if (key === 'copycats') {
      const pairs = data.copycats || [];
      const best = Math.max(0, ...pairs.map(p => value(p, 'matches')));
      return best ? [{ ...definition, number: index + 1, value: best, pairs: pairs.filter(p => value(p, 'matches') === best) }] : [];
    }
    const eligible = rows.filter(row => key === 'entertainer' ? value(row, 'prediction_count') > 0
      : key === 'starboy' ? value(row, 'star_pick_count') > 0
      : key === 'best' ? row.best !== null && row.best !== undefined : value(row, key) > 0);
    if (!eligible.length) return [];
    // Compare averages as exact ratios; rounding is presentation only.
    const compare = (a, b) => key === 'entertainer'
      ? value(a, 'predicted_goals') * value(b, 'prediction_count') - value(b, 'predicted_goals') * value(a, 'prediction_count')
      : value(a, key) - value(b, key);
    const leader = eligible.reduce((a, b) => compare(a, b) >= 0 ? a : b);
    return [{ ...definition, number: index + 1, value: key === 'entertainer'
      ? value(leader, 'predicted_goals') / value(leader, 'prediction_count') : value(leader, key),
    holders: eligible.filter(row => compare(row, leader) === 0) }];
  });
}

export function championStandings(members) {
  const rows = [...members].sort((a, b) => value(b, 'wins') - value(a, 'wins')
    || String(a.display_name).localeCompare(String(b.display_name), 'en-GB', { sensitivity: 'base' })
    || String(a.user_id).localeCompare(String(b.user_id)));
  let rank = 0;
  return rows.map((row, index) => {
    if (!index || value(row, 'wins') !== value(rows[index - 1], 'wins')) rank = index + 1;
    return { ...row, rank };
  });
}
