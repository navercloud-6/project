import {
  buildCityWeatherResponse,
  buildDemoCityObservation,
  cityWeatherLocationById,
  cityWeatherQuerySchema,
  CITY_WEATHER_CACHE_MS,
  type CityWeatherResponse,
} from '@/lib/domain/city-weather';
import { ApplicationError } from '@/lib/domain/errors';
import { createCache } from './cache';
import type { CityWeatherPort } from './ports';

const CITY_WEATHER_CACHE_MAX = 64;

export function createCityWeather(weather: CityWeatherPort) {
  const cache = createCache<CityWeatherResponse>({
    now: weather.now,
    ttlMs: CITY_WEATHER_CACHE_MS,
    maxEntries: CITY_WEATHER_CACHE_MAX,
  });

  return async function fetchCityWeather(cityIdInput?: string) {
    const { cityId } = cityWeatherQuerySchema.parse({ cityId: cityIdInput });
    const city = cityWeatherLocationById.get(cityId)!;
    const mode = weather.demo() ? 'demo' : 'live';
    return cache.getOrLoad(`${mode}:${cityId}`, async () => {
      try {
        const observation =
          mode === 'demo'
            ? buildDemoCityObservation(city, weather.now())
            : await weather.current(city);
        const now = weather.now();
        const age = now - Date.parse(observation.observedAt);
        if (
          mode === 'live' &&
          (age > 3 * 60 * 60 * 1000 || age < -CITY_WEATHER_CACHE_MS)
        ) {
          throw new ApplicationError(
            'UPSTREAM_INVALID',
            '현재 날씨의 자료 시각을 확인할 수 없습니다.',
          );
        }
        return buildCityWeatherResponse(city, observation, mode, now);
      } catch (error) {
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError(
          'UPSTREAM_INVALID',
          '날씨 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    });
  };
}
