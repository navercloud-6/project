import { z } from 'zod';
import { places, placeIds } from '@/lib/domain/catalog';

export const WEATHER_REGIONS: Record<
  string,
  {
    lat: number;
    lng: number;
    areaNote: string;
    tempOffset: number;
    windOffset: number;
    coastal: boolean;
  }
> = {
  전체: {
    lat: 37.38,
    lng: 126.803,
    areaNote: '시흥시청·장곡 중심 대표 기상 기준점',
    tempOffset: 0,
    windOffset: 0,
    coastal: false,
  },
  '장곡·갯골': {
    lat: 37.3914,
    lng: 126.7808,
    areaNote: '내만 갯골 수로와 염전 평야 지대 · 해풍 유입',
    tempOffset: -0.3,
    windOffset: 0.5,
    coastal: true,
  },
  오이도: {
    lat: 37.3458,
    lng: 126.6932,
    areaNote: '서해안 해변·방조제 권역 · 바닷바람과 낙조 명소',
    tempOffset: -0.8,
    windOffset: 1.4,
    coastal: true,
  },
  '하중·호조벌': {
    lat: 37.4002,
    lng: 126.8052,
    areaNote: '탁 트인 호조벌 들녘과 연꽃테마파크 일대',
    tempOffset: 0.1,
    windOffset: 0.3,
    coastal: false,
  },
  거북섬: {
    lat: 37.3243,
    lng: 126.6805,
    areaNote: '시화호 인공섬·마리나 수변 권역 · 강한 해풍 주의',
    tempOffset: -0.9,
    windOffset: 1.6,
    coastal: true,
  },
  배곧: {
    lat: 37.3688,
    lng: 126.7124,
    areaNote: '서해 해안 한울공원·생명공원 수변 산책 권역',
    tempOffset: -0.5,
    windOffset: 1.0,
    coastal: true,
  },
  은계: {
    lat: 37.4412,
    lng: 126.7968,
    areaNote: '북부 도심·은계호수공원 수변 문화 권역',
    tempOffset: 0.4,
    windOffset: -0.3,
    coastal: false,
  },
  물왕: {
    lat: 37.3818,
    lng: 126.8365,
    areaNote: '내륙 물왕호수 수변 데크·산책로 권역',
    tempOffset: 0.3,
    windOffset: -0.2,
    coastal: false,
  },
  '대야·소래산': {
    lat: 37.4504,
    lng: 126.7872,
    areaNote: '소래산 산림욕장·문화유산 구릉 지대',
    tempOffset: -0.4,
    windOffset: 0.2,
    coastal: false,
  },
  월곶: {
    lat: 37.3884,
    lng: 126.7392,
    areaNote: '월곶포구 해안가·어시장 수변 권역',
    tempOffset: -0.4,
    windOffset: 0.9,
    coastal: true,
  },
  '정왕·옥구': {
    lat: 37.3532,
    lng: 126.7182,
    areaNote: '옥구공원·정왕 도심 녹지 및 전망 권역',
    tempOffset: -0.2,
    windOffset: 0.6,
    coastal: true,
  },
};

export const validWeatherRegions = new Set(Object.keys(WEATHER_REGIONS));

export const weatherQuerySchema = z.object({
  region: z
    .string()
    .trim()
    .default('전체')
    .refine(
      (v) => validWeatherRegions.has(v),
      '지원하지 않는 시흥 권역입니다.',
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

export function describeWeatherCode(
  code: number,
  windSpeed = 0,
): { condition: string; icon: WeatherIcon; wet: boolean } {
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { condition: '눈', icon: 'snow', wet: true };
  }
  if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(
      code,
    )
  ) {
    return {
      condition: code >= 80 ? '소나기·비' : '비',
      icon: 'rain',
      wet: true,
    };
  }
  if (windSpeed >= 9) {
    return { condition: '강풍·구름', icon: 'wind', wet: false };
  }
  if (code === 0) {
    return { condition: '맑음', icon: 'sun', wet: false };
  }
  if ([1, 2].includes(code)) {
    return { condition: '구름 조금', icon: 'cloud-sun', wet: false };
  }
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
  const { wet } = describeWeatherCode(current.weatherCode, current.windSpeed);
  if (wet || current.precipitation > 0.5) {
    return {
      suitability: 'indoor',
      headline: '비·눈 소식이 있어 실내 전시나 박물관 코스를 먼저 추천해요',
      detail: `${region === '전체' ? '시흥 전역' : region}에 강수가 예상됩니다. 우산을 챙기시고 미끄러운 갯벌·방조제 데크 대신 박물관·실내 체험 공간 위주로 동선을 구성해 보세요.`,
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
  const scoped =
    region === '전체' ? places : places.filter((p) => p.region === region);
  const pool =
    scoped.length >= 2
      ? scoped
      : [...scoped, ...places.filter((p) => p.region !== region)];

  const scorePlace = (p: (typeof places)[number]) => {
    const text = `${p.name} ${p.description} ${p.tags.join(' ')}`;
    if (suitability === 'indoor') {
      return (
        (text.includes('박물관') ||
        text.includes('전시') ||
        text.includes('문화') ||
        text.includes('역사')
          ? 10
          : 0) + (text.includes('체험') ? 4 : 0)
      );
    }
    if (suitability === 'mixed') {
      return (
        (text.includes('전망') || text.includes('문화') || text.includes('산책')
          ? 6
          : 0) + (p.region === region ? 5 : 0)
      );
    }
    return (
      (text.includes('자연') ||
      text.includes('산책') ||
      text.includes('경관') ||
      text.includes('바다')
        ? 8
        : 0) + (p.region === region ? 5 : 0)
    );
  };

  const sorted = [...pool].sort((a, b) => scorePlace(b) - scorePlace(a));
  const uniqueIds: string[] = [];
  for (const item of sorted) {
    if (!uniqueIds.includes(item.id)) uniqueIds.push(item.id);
    if (uniqueIds.length === 3) break;
  }
  return uniqueIds;
}

function kstDateString(now: number, daysOffset = 0): string {
  const base = new Date(now + daysOffset * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

export function buildDemoWeather(region: string, now: number): WeatherResponse {
  const meta = WEATHER_REGIONS[region] ?? WEATHER_REGIONS['전체'];
  const temperature = Number((14.2 + meta.tempOffset).toFixed(1));
  const windSpeed = Number(Math.max(1.2, 3.1 + meta.windOffset).toFixed(1));
  const apparentTemperature = Number(
    (temperature - (meta.coastal ? 0.9 : 0.3)).toFixed(1),
  );
  const humidity = meta.coastal ? 64 : 56;
  const weatherCode = meta.coastal ? 1 : 0;
  const desc = describeWeatherCode(weatherCode, windSpeed);

  const current = {
    temperature,
    apparentTemperature,
    humidity,
    windSpeed,
    precipitation: 0,
    weatherCode,
    condition: desc.condition,
    icon: desc.icon,
  };

  const advisory = buildAdvisory(region, meta, current);
  const dailyCodes = [weatherCode, 1, 2, 0, 61];
  const daily = dailyCodes.map((code, idx) => {
    const d = describeWeatherCode(code, windSpeed);
    return {
      date: kstDateString(now, idx),
      weatherCode: code,
      condition: d.condition,
      icon: d.icon,
      tempMax: Number((temperature + 3.2 - idx * 0.4).toFixed(1)),
      tempMin: Number((temperature - 4.5 - idx * 0.3).toFixed(1)),
      precipitationProbability: code === 61 ? 65 : idx === 2 ? 25 : 10,
    };
  });

  return weatherResponseSchema.parse({
    region,
    areaNote: meta.areaNote,
    coordinates: { lat: meta.lat, lng: meta.lng },
    mode: 'demo',
    observedAt: `${kstDateString(now)} 시연 기준`,
    current,
    advisory,
    daily,
    recommendedPlaceIds: pickRecommendedPlaces(region, advisory.suitability),
  });
}
