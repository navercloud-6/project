import { api } from './client-api';
import {
  cityWeatherQuerySchema,
  cityWeatherResponseSchema,
  type CityWeatherResponse,
} from '@/lib/domain/city-weather';

export function createCityWeatherClient(
  load: (cityId: string) => Promise<unknown> = (cityId) =>
    api(`/api/weather/current?cityId=${encodeURIComponent(cityId)}`),
  now: () => number = Date.now,
) {
  const cache = new Map<string, CityWeatherResponse>();
  const pending = new Map<string, Promise<CityWeatherResponse>>();
  return {
    get(cityId: string): Promise<CityWeatherResponse> {
      cityWeatherQuerySchema.parse({ cityId });
      const cached = cache.get(cityId);
      if (cached && Date.parse(cached.expiresAt) > now())
        return Promise.resolve(cached);
      const running = pending.get(cityId);
      if (running) return running;
      cache.delete(cityId);
      const request = load(cityId)
        .then((raw) => {
          const data = cityWeatherResponseSchema.parse(raw);
          if (data.cityId !== cityId)
            throw new Error('요청한 지역의 날씨와 응답이 일치하지 않습니다.');
          cache.set(cityId, data);
          return data;
        })
        .finally(() => pending.delete(cityId));
      pending.set(cityId, request);
      return request;
    },
  };
}

export const cityWeatherClient = createCityWeatherClient();
