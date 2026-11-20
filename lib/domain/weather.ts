import { z } from 'zod';
import { places, placeIds } from '@/lib/domain/catalog';

type RegionMeta = {
  lat: number;
  lng: number;
  areaNote: string;
  tempOffset: number;
  windOffset: number;
  coastal: boolean;
};

const region = (
  lat: number,
  lng: number,
  tempOffset: number,
  windOffset: number,
  coastal: boolean,
  areaNote: string,
): RegionMeta => ({ lat, lng, tempOffset, windOffset, coastal, areaNote });

export const WEATHER_REGIONS: Record<string, RegionMeta> = {
  전체: region(
    37.38,
    126.803,
    0,
    0,
    false,
    '경기도 시흥권 대표 기상 기준점(시흥시청·장곡 중심)',
  ),
  '장곡·갯골': region(
    37.3914,
    126.7808,
    -0.3,
    0.5,
    true,
    '내만 갯골 수로와 염전 평야 지대 · 해풍 유입',
  ),
  오이도: region(
    37.3458,
    126.6932,
    -0.8,
    1.4,
    true,
    '서해안 해변·방조제 권역 · 바닷바람과 낙조 명소',
  ),
  배곧: region(
    37.3688,
    126.7124,
    -0.5,
    1.0,
    true,
    '서해 해안 한울공원·생명공원 수변 산책 권역',
  ),
  거북섬: region(
    37.3243,
    126.6805,
    -0.9,
    1.6,
    true,
    '시화호 인공섬·마리나 수변 권역 · 강한 해풍 주의',
  ),
  월곶: region(
    37.3884,
    126.7392,
    -0.4,
    0.9,
    true,
    '월곶포구 해안가·어시장 수변 권역',
  ),
  '정왕·옥구': region(
    37.3532,
    126.7182,
    -0.2,
    0.6,
    true,
    '옥구공원·정왕 도심 녹지 및 전망 권역',
  ),
  '하중·호조벌': region(
    37.4002,
    126.8052,
    0.1,
    0.3,
    false,
    '탁 트인 호조벌 들녘과 연꽃테마파크 일대',
  ),
  물왕: region(
    37.3818,
    126.8365,
    0.3,
    -0.2,
    false,
    '내륙 물왕호수 수변 데크·산책로 권역',
  ),
  은계: region(
    37.4412,
    126.7968,
    0.4,
    -0.3,
    false,
    '북부 도심·은계호수공원 수변 문화 권역',
  ),
  '대야·소래산': region(
    37.4504,
    126.7872,
    -0.4,
    0.2,
    false,
    '소래산 산림욕장·문화유산 구릉 지대',
  ),
};

export const validWeatherRegions = new Set(Object.keys(WEATHER_REGIONS));

export const weatherQuerySchema = z.object({
  region: z
    .string()
    .trim()
    .default('전체')
    .refine(
      (v) => validWeatherRegions.has(v),
      '지원하지 않는 경기 권역입니다.',
    ),
});

const weatherIconSchema = z.enum([
  'sun',
  'cloud-sun',
  'cloud',
  'rain',
  'snow',
  'wind',
]);

export const weatherResponseSchema = z.object({
  region: z.string(),
  areaNote: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }),
  mode: z.enum(['live', 'demo']),
  observedAt: z.string(),
  current: z.object({
    temperature: z.number(),
    apparentTemperature: z.number(),
    humidity: z.number().int().min(0).max(100),
    windSpeed: z.number().min(0),
    precipitation: z.number().min(0),
    weatherCode: z.number().int(),
    condition: z.string(),
    icon: weatherIconSchema,
  }),
  advisory: z.object({
    suitability: z.enum(['outdoor', 'mixed', 'indoor']),
    headline: z.string(),
    detail: z.string(),
  }),
  daily: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        weatherCode: z.number().int(),
        condition: z.string(),
        icon: weatherIconSchema,
        tempMax: z.number(),
        tempMin: z.number(),
        precipitationProbability: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .max(7),
  recommendedPlaceIds: z
    .array(z.string().refine((v) => placeIds.has(v)))
    .min(1)
    .max(4),
});

export type WeatherResponse = z.infer<typeof weatherResponseSchema>;
export type WeatherIcon = z.infer<typeof weatherIconSchema>;

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

export function describeWeatherCode(
  code: number,
  windSpeed = 0,
): { condition: string; icon: WeatherIcon; wet: boolean } {
  if (SNOW_CODES.has(code)) return { condition: '눈', icon: 'snow', wet: true };
  if (RAIN_CODES.has(code))
    return {
      condition: code >= 80 ? '소나기·비' : '비',
      icon: 'rain',
      wet: true,
    };
  if (windSpeed >= 9)
    return { condition: '강풍·구름', icon: 'wind', wet: false };
  if (code === 0) return { condition: '맑음', icon: 'sun', wet: false };
  if (code === 1 || code === 2)
    return { condition: '구름 조금', icon: 'cloud-sun', wet: false };
  return { condition: '흐림', icon: 'cloud', wet: false };
}

export function buildAdvisory(
  region: string,
  meta: { coastal: boolean },
  current: {
    temperature: number;
    apparentTemperature: number;
    windSpeed: number;
    precipitation: number;
    weatherCode: number;
  },
): WeatherResponse['advisory'] {
  if (
    describeWeatherCode(current.weatherCode, current.windSpeed).wet ||
    current.precipitation > 0.5
  ) {
    return {
      suitability: 'indoor',
      headline: '비·눈 소식이 있어 실내 전시나 박물관 코스를 먼저 추천해요',
      detail: `${region === '전체' ? '경기(시흥권) 전역' : region}에 강수가 예상됩니다. 우산을 챙기시고 미끄러운 갯벌·방조제 데크 대신 박물관·실내 체험 공간 위주로 동선을 구성해 보세요.`,
    };
  }
  if (
    current.windSpeed >= 8 ||
    current.apparentTemperature <= 2 ||
    current.apparentTemperature >= 32
  ) {
    return {
      suitability: 'mixed',
      headline: meta.coastal
        ? '해안가 바닷바람이 다소 강하니 겉옷을 챙겨 짧게 산책하세요'
        : '일교차와 체감온도를 고려해 실내외 코스를 함께 묶어 보세요',
      detail: `체감온도 ${current.apparentTemperature.toFixed(1)}°C, 풍속 ${current.windSpeed.toFixed(1)}m/s입니다. 해안 전망대는 낮 시간대에 방문하고 실내 휴식처를 함께 담으면 쾌적합니다.`,
    };
  }
  return {
    suitability: 'outdoor',
    headline: meta.coastal
      ? '서해 바닷길과 해안 노을 산책을 즐기기 좋은 날씨예요'
      : '갯골 생태길과 호수공원 산책에 잘 어울리는 온화한 날씨예요',
    detail: `현재 기온 ${current.temperature.toFixed(1)}°C(체감 ${current.apparentTemperature.toFixed(1)}°C), 바람 ${current.windSpeed.toFixed(1)}m/s로 야외 걷기와 사진 촬영에 적합합니다.`,
  };
}

export function pickRecommendedPlaces(
  region: string,
  suitability: 'outdoor' | 'mixed' | 'indoor',
): string[] {
  // Weather observations still cover Siheung, so do not suggest other cities.
  const weatherPlaces = places.filter((p) => p.cityId === '41390');
  const scoped =
    region === '전체'
      ? weatherPlaces
      : weatherPlaces.filter((p) => p.region === region);
  const pool =
    scoped.length >= 2
      ? scoped
      : [...scoped, ...weatherPlaces.filter((p) => p.region !== region)];

  const score = (p: (typeof places)[number]) => {
    const text = `${p.name} ${p.description} ${p.tags.join(' ')}`;
    if (suitability === 'indoor')
      return (
        (/박물관|전시|문화|역사/.test(text) ? 10 : 0) +
        (text.includes('체험') ? 4 : 0)
      );
    const pattern =
      suitability === 'mixed' ? /전망|문화|산책/ : /자연|산책|경관|바다/;
    return (
      (pattern.test(text) ? (suitability === 'mixed' ? 6 : 8) : 0) +
      (p.region === region ? 5 : 0)
    );
  };

  return [
    ...new Set([...pool].sort((a, b) => score(b) - score(a)).map((p) => p.id)),
  ].slice(0, 3);
}

const kstDate = (now: number, daysOffset = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now + daysOffset * 86400000));

const round1 = (value: number) => Number(value.toFixed(1));

export function buildDemoWeather(region: string, now: number): WeatherResponse {
  const meta = WEATHER_REGIONS[region] ?? WEATHER_REGIONS['전체'];
  const temperature = round1(14.2 + meta.tempOffset);
  const windSpeed = round1(Math.max(1.2, 3.1 + meta.windOffset));
  const apparentTemperature = round1(temperature - (meta.coastal ? 0.9 : 0.3));
  const weatherCode = meta.coastal ? 1 : 0;
  const { condition, icon } = describeWeatherCode(weatherCode, windSpeed);
  const current = {
    temperature,
    apparentTemperature,
    humidity: meta.coastal ? 64 : 56,
    windSpeed,
    precipitation: 0,
    weatherCode,
    condition,
    icon,
  };
  const advisory = buildAdvisory(region, meta, current);

  return weatherResponseSchema.parse({
    region,
    areaNote: meta.areaNote,
    coordinates: { lat: meta.lat, lng: meta.lng },
    mode: 'demo',
    observedAt: `${kstDate(now)} 시연 기준`,
    current,
    advisory,
    daily: [weatherCode, 1, 2, 0, 61].map((code, idx) => {
      const d = describeWeatherCode(code, windSpeed);
      return {
        date: kstDate(now, idx),
        weatherCode: code,
        condition: d.condition,
        icon: d.icon,
        tempMax: round1(temperature + 3.2 - idx * 0.4),
        tempMin: round1(temperature - 4.5 - idx * 0.3),
        precipitationProbability: code === 61 ? 65 : idx === 2 ? 25 : 10,
      };
    }),
    recommendedPlaceIds: pickRecommendedPlaces(region, advisory.suitability),
  });
}
