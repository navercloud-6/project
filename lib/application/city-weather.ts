import {
  buildCityWeatherResponse,
  buildDemoCityObservation,
  cityWeatherLocations,
  cityWeatherQuerySchema,
  CITY_WEATHER_CACHE_MS,
  type CityWeatherResponse,
} from '@/lib/domain/city-weather';
import { ApplicationError } from '@/lib/domain/errors';
import type { CityWeatherPort } from './ports';

export function createCityWeather(weather: CityWeatherPort) {
  const cache = new Map<string, CityWeatherResponse>();
  const pending = new Map<string, Promise<CityWeatherResponse>>();

  return async function fetchCityWeather(cityIdInput?: string) {
    const { cityId } = cityWeatherQuerySchema.parse({ cityId: cityIdInput });
    const city = cityWeatherLocations.find((city) => city.id === cityId)!;
    const mode = weather.demo() ? 'demo' : 'live';
    const key = `${mode}:${cityId}`;
    const cached = cache.get(key);
    if (cached && Date.parse(cached.expiresAt) > weather.now()) return cached;
    const running = pending.get(key);
    if (running) return running;
    cache.delete(key);

    const request = (async () => {
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
      const result = buildCityWeatherResponse(city, observation, mode, now);
      cache.set(key, result);
      return result;
    })()
      .catch((error) => {
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError(
          'UPSTREAM_INVALID',
          '날씨 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
