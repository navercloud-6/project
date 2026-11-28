import { z } from 'zod';
import { ApplicationError } from '@/lib/domain/errors';
import {
  cityWeatherObservationSchema,
  type CityWeatherLocation,
  type CityWeatherObservation,
} from '@/lib/domain/city-weather';
import {
  WEATHER_REGIONS,
  describeWeatherCode,
  buildAdvisory,
  buildWeatherOutfit,
  pickRecommendedPlaces,
  weatherResponseSchema,
  type WeatherResponse,
} from '@/lib/domain/weather';

const VALID_WMO_CODES = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);

const currentCityUpstreamSchema = z.object({
  timezone: z.literal('Asia/Seoul'),
  utc_offset_seconds: z.literal(32400),
  current: z.object({
    time: z.iso.datetime({ local: true }),
    temperature_2m: z.number().min(-100).max(70),
    weather_code: z
      .number()
      .int()
      .refine((code) => VALID_WMO_CODES.has(code)),
    wind_speed_10m: z.number().min(0),
  }),
});

const round1 = (value: number) => Number(value.toFixed(1));
const clampPercent = (value: number) =>
  Math.round(Math.min(100, Math.max(0, value)));

function fetchForecast(
  lat: number,
  lng: number,
  params: Record<string, string>,
) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    ...params,
  }).toString();
  return fetch(url.href, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
}

export async function liveCityWeather(
  city: CityWeatherLocation,
): Promise<CityWeatherObservation> {
  let response: Response;
  try {
    response = await fetchForecast(city.coordinates.lat, city.coordinates.lng, {
      current: 'temperature_2m,weather_code,wind_speed_10m',
      forecast_days: '1',
    });
  } catch (error) {
    throw new ApplicationError(
      error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'UPSTREAM_TIMEOUT'
        : 'UNAVAILABLE',
      '날씨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!response.ok)
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '날씨 제공 서비스가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
    );
  const parsed = currentCityUpstreamSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApplicationError(
      'UPSTREAM_INVALID',
      '현재 날씨 응답을 확인할 수 없습니다.',
    );
  const raw = parsed.data.current;
  const description = describeWeatherCode(raw.weather_code, raw.wind_speed_10m);
  const time = raw.time.length === 16 ? `${raw.time}:00` : raw.time;
  return cityWeatherObservationSchema.parse({
    observedAt: `${time}+09:00`,
    current: {
      temperature: round1(raw.temperature_2m),
      weatherCode: raw.weather_code,
      condition: description.condition,
      icon: description.icon,
    },
  });
}
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
  const response = await fetchForecast(meta.lat, meta.lng, {
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '5',
  });
  if (!response.ok) {
    throw new Error('Weather upstream failed');
  }
  const raw = openMeteoUpstreamSchema.parse(await response.json());
  const windSpeed = round1(raw.current.wind_speed_10m);
  const desc = describeWeatherCode(raw.current.weather_code, windSpeed);
  const current = {
    temperature: round1(raw.current.temperature_2m),
    apparentTemperature: round1(raw.current.apparent_temperature),
    humidity: clampPercent(raw.current.relative_humidity_2m),
    windSpeed,
    precipitation: round1(Math.max(0, raw.current.precipitation)),
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
      tempMax: round1(raw.daily.temperature_2m_max[i] ?? current.temperature),
      tempMin: round1(raw.daily.temperature_2m_min[i] ?? current.temperature),
      precipitationProbability: clampPercent(prob ?? 0),
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
