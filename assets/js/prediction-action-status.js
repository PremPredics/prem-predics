// Shared action-required logic for Home Quick Access and League Hub.
// Forced Curse of the Random / Hated outcomes and deleted fixtures count as
// resolved predictions. Only unlocked, unfinished fixtures need user action.
export function hasValidPrediction(row) {
  return row?.home_goals !== null && row?.home_goals !== undefined
    && row?.away_goals !== null && row?.away_goals !== undefined
    && Number.isFinite(Number(row.home_goals))
    && Number.isFinite(Number(row.away_goals));
}
export function unresolvedFixtures(fixtures, primary = [], forced = [], deleted = []) {
  const covered = new Set([...primary, ...forced]
    .filter(hasValidPrediction).map(row => String(row.fixture_id)));
  for (const row of deleted) {
    if (row.fixture_id) covered.add(String(row.fixture_id));
  }
  return fixtures.filter(f => !covered.has(String(f.id)));
}
export async function predictionActionStatus({supabase, readData, userId, league, fixtures, now = Date.now()}) {
  const open = fixtures.filter(f =>
    !['postponed','cancelled','final'].includes(f.status)
    && Number.isFinite(new Date(f.prediction_locks_at).getTime())
    && new Date(f.prediction_locks_at).getTime() > now);
  if (!open.length) return {state:'complete',deadline:null,remaining:0};
  const ids = open.map(f=>f.id);
  const [primary, hated, random, deleted] = await Promise.all([
    readData(() => supabase.from('predictions')
      .select('fixture_id,home_goals,away_goals')
      .eq('competition_id',league.id).eq('user_id',userId)
      .eq('prediction_slot','primary').in('fixture_id',ids)),
    readData(() => supabase.from('curse_hated_forced_predictions')
      .select('fixture_id,home_goals,away_goals')
      .eq('competition_id',league.id).eq('target_user_id',userId)
      .in('fixture_id',ids)),
    readData(() => supabase.from('curse_gambler_rolls')
      .select('fixture_id,home_goals,away_goals')
      .eq('competition_id',league.id).eq('target_user_id',userId)
      .in('fixture_id',ids)),
    readData(() => supabase.from('active_card_effects')
      .select('fixture_id,card_definitions!inner(effect_key)')
      .eq('competition_id',league.id).eq('season_id',league.season_id)
      .eq('target_user_id',userId).eq('status','active')
      .eq('card_definitions.effect_key','curse_deleted_match')
      .in('fixture_id',ids))
  ]);
  const missing = unresolvedFixtures(open,primary,[...hated,...random],deleted);
  const first = missing.map(f=>f.prediction_locks_at)
    .sort((a,b)=>new Date(a)-new Date(b))[0] || null;
  return missing.length
    ? {state:'required',deadline:first,remaining:missing.length}
    : {state:'complete',deadline:null,remaining:0};
}
