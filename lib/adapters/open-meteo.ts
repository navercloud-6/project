import { z } from 'zod';
import {
  WEATHER_REGIONS,
  describeWeatherCode,
  buildAdvisory,
  buildWeatherOutfit,
  pickRecommendedPlaces,
  weatherResponseSchema,
  type WeatherResponse,
} from '@/lib/domain/weather';
const openMeteoUpstreamSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    precipitation: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()).min(1),
    weather_code: z.array(z.number()).min(1),
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

export async function liveWeather(region: string): Promise<WeatherResponse> {
  const meta = WEATHER_REGIONS[region] ?? WEATHER_REGIONS['전체'];
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(meta.lat));
  url.searchParams.set('longitude', String(meta.lng));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', 'Asia/Seoul');
  url.searchParams.set('forecast_days', '5');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error('Weather upstream failed');
  }
  const raw = openMeteoUpstreamSchema.parse(await response.json());
  const windSpeed = Number(raw.current.wind_speed_10m.toFixed(1));
  const desc = describeWeatherCode(raw.current.weather_code, windSpeed);
  const current = {
    temperature: Number(raw.current.temperature_2m.toFixed(1)),
    apparentTemperature: Number(raw.current.apparent_temperature.toFixed(1)),
    humidity: Math.round(
      Math.min(100, Math.max(0, raw.current.relative_humidity_2m)),
    ),
    windSpeed,
    precipitation: Number(Math.max(0, raw.current.precipitation).toFixed(1)),
    weatherCode: Math.round(raw.current.weather_code),
    condition: desc.condition,
    icon: desc.icon,
  };
  const advisory = buildAdvisory(region, meta, current);
  const count = Math.min(5, raw.daily.time.length);
  const daily = Array.from({ length: count }, (_, i) => {
    const code = Math.round(raw.daily.weather_code[i] ?? 0);
    const d = describeWeatherCode(code);
    const prob = raw.daily.precipitation_probability_max?.[i] ?? 0;
    return {
      date: raw.daily.time[i],
      weatherCode: code,
      condition: d.condition,
      icon: d.icon,
      tempMax: Number(
        (raw.daily.temperature_2m_max[i] ?? current.temperature).toFixed(1),
      ),
      tempMin: Number(
        (raw.daily.temperature_2m_min[i] ?? current.temperature).toFixed(1),
      ),
      precipitationProbability: Math.round(
        Math.min(100, Math.max(0, prob ?? 0)),
      ),
    };
  });

  return weatherResponseSchema.parse({
    region,
    areaNote: meta.areaNote,
    coordinates: { lat: meta.lat, lng: meta.lng },
    mode: 'live',
    observedAt: raw.current.time.replace('T', ' '),
    current,
    advisory,
    daily,
    outfit: buildWeatherOutfit(region, meta, current, daily[0]),
    recommendedPlaceIds: pickRecommendedPlaces(region, advisory.suitability),
  });
}
