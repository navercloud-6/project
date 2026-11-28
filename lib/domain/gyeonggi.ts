import mapData from '@/data/gyeonggi-map.json';

export const gyeonggiMap = mapData;
export const gyeonggiCities = [...mapData.cities].sort((a, b) =>
  a.name.localeCompare(b.name, 'ko'),
);
export type GyeonggiCity = (typeof gyeonggiCities)[number];
export const gyeonggiCityById = new Map(
  gyeonggiCities.map((city) => [city.id, city]),
);
export const gyeonggiCityByName = new Map(
  gyeonggiCities.map((city) => [city.name, city]),
);

export function placesInCity<T extends { cityId: string }>(
  places: readonly T[],
  cityId: string | null,
): T[] {
  return cityId ? places.filter((place) => place.cityId === cityId) : [];
}
