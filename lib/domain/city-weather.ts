import { z } from 'zod';
import { gyeonggiCities } from '@/lib/domain/gyeonggi';
import {
  describeWeatherCode,
  WEATHER_REGIONS,
  weatherIconSchema,
} from '@/lib/domain/weather';

export const DEFAULT_WEATHER_CITY_ID = '41110';
export const CITY_WEATHER_CACHE_MS = 10 * 60 * 1000;
export const cityWeatherLocations = gyeonggiCities.map(({ id, name }) => {
  const { lat, lng } = WEATHER_REGIONS[name];
  return { id, name, coordinates: { lat, lng } };
});
export type CityWeatherLocation = (typeof cityWeatherLocations)[number];

export const cityWeatherQuerySchema = z.object({
  cityId: z
    .string()
    .default(DEFAULT_WEATHER_CITY_ID)
    .refine(
      (id) => cityWeatherLocations.some((city) => city.id === id),
      '지원하지 않는 경기도 시·군입니다.',
    ),
});

export const cityWeatherObservationSchema = z.object({
  observedAt: z.iso.datetime({ offset: true }),
  current: z.object({
    temperature: z.number().min(-100).max(70),
    weatherCode: z.number().int(),
    condition: z.string().min(1),
    icon: weatherIconSchema,
  }),
});
export type CityWeatherObservation = z.infer<
  typeof cityWeatherObservationSchema
>;

export const cityWeatherResponseSchema = cityWeatherObservationSchema.extend({
  cityId: z.string(),
  cityName: z.string().min(1),
  areaNote: z.string().min(1),
  coordinates: z.object({
    lat: z.number().min(36.8).max(38.4),
    lng: z.number().min(126.3).max(128),
  }),
  mode: z.enum(['live', 'demo']),
  fetchedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  source: z.object({ name: z.string().min(1), url: z.url().optional() }),
});
export type CityWeatherResponse = z.infer<typeof cityWeatherResponseSchema>;

export function buildCityWeatherResponse(
  city: CityWeatherLocation,
  observation: CityWeatherObservation,
  mode: 'live' | 'demo',
  now: number,
): CityWeatherResponse {
  return cityWeatherResponseSchema.parse({
    ...observation,
    cityId: city.id,
    cityName: city.name,
    areaNote: `${city.name} 대표 지점 기준`,
    coordinates: city.coordinates,
    mode,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CITY_WEATHER_CACHE_MS).toISOString(),
    source:
      mode === 'live'
        ? { name: 'Open-Meteo', url: 'https://open-meteo.com/' }
        : { name: '시연 데이터' },
  });
}

export function buildDemoCityObservation(
  city: CityWeatherLocation,
  now: number,
): CityWeatherObservation {
  const seed = Number(city.id) % 7;
  const weatherCode = [0, 1, 3, 61, 71, 2, 0][seed];
  const { condition, icon } = describeWeatherCode(weatherCode);
  return {
    observedAt: new Date(now).toISOString(),
    current: { temperature: 8 + seed, weatherCode, condition, icon },
  };
}
