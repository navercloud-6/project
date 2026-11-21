import {
  buildDemoWeather,
  weatherQuerySchema,
  type WeatherResponse,
} from '@/lib/domain/weather';
import { createCache } from './cache';
import type { WeatherPort } from './ports';

const WEATHER_CACHE_MS = 10 * 60 * 1000;
const WEATHER_CACHE_MAX = 64;

export function createWeather(weather: WeatherPort) {
  const cache = createCache<WeatherResponse>({
    now: weather.now,
    ttlMs: WEATHER_CACHE_MS,
    maxEntries: WEATHER_CACHE_MAX,
  });
  return async function fetchWeather(regionInput = '전체') {
    const { region } = weatherQuerySchema.parse({ region: regionInput });
    if (weather.demo()) return buildDemoWeather(region, weather.now());
    try {
      return await cache.getOrLoad(region, () => weather.current(region), {
        shouldCache: (result) => result.mode === 'live',
      });
    } catch {
      return buildDemoWeather(region, weather.now());
    }
  };
}
