export type TravelPreferences = { region: string; prompt: string };
const storageKey = 'tourpass-preferences';

export function loadPreferences(
  storage: Pick<Storage, 'getItem'>,
  regions: readonly string[],
): TravelPreferences | null {
  const stored: unknown = JSON.parse(storage.getItem(storageKey) ?? 'null');
  if (
    !stored ||
    typeof stored !== 'object' ||
    !('prompt' in stored) ||
    typeof stored.prompt !== 'string' ||
    stored.prompt.length > 500 ||
    !('region' in stored) ||
    typeof stored.region !== 'string' ||
    !regions.includes(stored.region)
  )
    return null;
  return { region: stored.region, prompt: stored.prompt };
}

export function storePreferences(
  storage: Pick<Storage, 'setItem'>,
  preferences: TravelPreferences,
) {
  storage.setItem(storageKey, JSON.stringify(preferences));
}
