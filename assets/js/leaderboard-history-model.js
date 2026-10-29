export const rankingFields = [
  'ultimate_champion_points','correct_scores','correct_results','prediction_points',
  'star_man_points','star_man_goals','star_man_assists','star_man_yellows','star_man_reds',
];
export function compareRankingCriteria(a, b) {
  for (const field of rankingFields) {
    const difference = Number(b[field] || 0) - Number(a[field] || 0);
    if (difference) return field === 'star_man_yellows' || field === 'star_man_reds' ? -difference : difference;
  }
  return 0;
}
export function rankRows(rows) {
  let rank = 0, previous = null;
  return [...rows].sort((a,b) => compareRankingCriteria(a,b) ||
    String(a.display_name || '').localeCompare(String(b.display_name || ''),'en-GB',{sensitivity:'base'}))
    .map((row,index) => {
      if (!previous || compareRankingCriteria(previous,row)) rank = index + 1;
      previous = row;
      return {...row,rank};
    });
}
export function buildLeaderboardHistory({gameweeks, fixtures, weeklyStats, members, startsGameweekId, now=Date.now()}) {
  const start = gameweeks.find(gw => String(gw.id) === String(startsGameweekId));
  if (!start) throw new Error('League starting Gameweek is unavailable.');
  const ordered = gameweeks.filter(gw => Number(gw.number) >= Number(start.number)).sort((a,b)=>a.number-b.number);
  const completed = [];
  for (const gw of ordered) {
    const matches = fixtures.filter(f=>String(f.gameweek_id)===String(gw.id) && !['postponed','cancelled'].includes(f.status));
    if (!matches.length) continue;
    if (!matches.every(f=>f.status==='final' && new Date(f.kickoff_at).getTime()<=now &&
      (Array.isArray(f.match_results) ? f.match_results.length>0 : Boolean(f.match_results)))) break;
    completed.push(gw);
  }
  const byWeekUser = new Map(weeklyStats.map(row=>[String(row.gameweek_id)+':'+row.user_id,row]));
  const totals = members.map(m=>({...m,...Object.fromEntries(rankingFields.map(f=>[f,0]))}));
  const weeks = completed.map(gw=>{
    for (const total of totals) {
      const row=byWeekUser.get(String(gw.id)+':'+total.user_id);
      if (!row) throw new Error('Weekly scoring data is incomplete. Please retry.');
      for (const field of rankingFields) {
        const value=Number(row[field]);
        if (!Number.isFinite(value)) throw new Error('Weekly scoring data is incomplete. Please retry.');
        total[field]+=value;
      }
    }
    return {number:Number(gw.number),rows:rankRows(totals)};
  });
  const movements=new Map();
  if(weeks.length>=2) {
    const previous=new Map(weeks.at(-2).rows.map(row=>[row.user_id,row.rank]));
    weeks.at(-1).rows.forEach(row=>movements.set(row.user_id,previous.get(row.user_id)-row.rank));
  }
  return {weeks,movements};
}
