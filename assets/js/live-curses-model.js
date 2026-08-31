export function effectAppliesToGameweek(effect, activeGameweek, gameweekNumbers) {
  const currentNumber = Number(activeGameweek?.gameweek_number);
  if (!Number.isFinite(currentNumber)) return false;
  const directId = effect?.gameweek_id;
  const startId = effect?.start_gameweek_id || directId;
  const endId = effect?.end_gameweek_id || startId;
  const startNumber = Number(gameweekNumbers?.get(String(startId || '')));
  const endNumber = Number(gameweekNumbers?.get(String(endId || '')));
  if (Number.isFinite(startNumber) && Number.isFinite(endNumber)) {
    return currentNumber >= startNumber && currentNumber <= endNumber;
  }
  return String(directId || startId || '') === String(activeGameweek?.gameweek_id || '');
}

export function currentLiveCurseEffects(effects, activeGameweek, gameweekNumbers) {
  return (effects || []).filter((effect) => {
    const definition = Array.isArray(effect?.card_definitions)
      ? effect.card_definitions[0]
      : effect?.card_definitions;
    const effectKey = effect?.payload?.effect_key || definition?.effect_key || '';
    const status = String(effect?.status || '').toLowerCase();
    const visibleStatus = status === 'active'
      || (status === 'resolved' && effectKey === 'curse_thief');

    return visibleStatus
      && Boolean(effect?.target_user_id)
      && effectAppliesToGameweek(effect, activeGameweek, gameweekNumbers);
  });
}
