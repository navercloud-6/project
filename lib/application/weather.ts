import { buildDemoWeather, weatherQuerySchema } from '@/lib/domain/weather';
import type { WeatherPort } from './ports';
export function createWeather(weather: WeatherPort) {
  return async function fetchSiheungWeather(regionInput = '전체') {
    const { region } = weatherQuerySchema.parse({ region: regionInput });
    if (weather.demo()) return buildDemoWeather(region, weather.now());
    try {
      return await weather.current(region);
    } catch {
      return buildDemoWeather(region, weather.now());
    }
  };
}
