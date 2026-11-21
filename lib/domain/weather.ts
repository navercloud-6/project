import { z } from 'zod';
import { places, placeIds } from '@/lib/domain/catalog';
import {
  buildOutfit,
  outfitSchema,
  RAIN_CODES,
  SNOW_CODES,
  type Outfit,
} from '@/lib/domain/outfit';

type RegionMeta = {
  cityId: string | null;
  lat: number;
  lng: number;
  areaNote: string;
  tempOffset: number;
  windOffset: number;
  coastal: boolean;
};

const region = (
  cityId: string | null,
  lat: number,
  lng: number,
  tempOffset: number,
  windOffset: number,
  coastal: boolean,
  areaNote: string,
): RegionMeta => ({
  cityId,
  lat,
  lng,
  tempOffset,
  windOffset,
  coastal,
  areaNote,
});

export const WEATHER_REGIONS: Record<string, RegionMeta> = {
  전체: region(
    null,
    37.275,
    127.009,
    0,
    0,
    false,
    '경기도 대표 기상 기준점(경기도청·수원 중심)',
  ),
  가평군: region(
    '41820',
    37.8315,
    127.5095,
    -1.2,
    0.2,
    false,
    '북한강·자라섬과 산림 계곡이 어우러진 동북부 자연 권역',
  ),
  고양시: region(
    '41280',
    37.6584,
    126.832,
    -0.2,
    0.3,
    false,
    '일산호수공원·행주산성 등 한강 하류 서북부 도심 권역',
  ),
  과천시: region(
    '41290',
    37.4292,
    126.9876,
    -0.3,
    0.1,
    false,
    '관악산·청계산 자락과 국립과천과학관 일대 녹지 권역',
  ),
  광명시: region(
    '41210',
    37.4786,
    126.8646,
    0.1,
    0.1,
    false,
    '광명동굴과 도덕산·안양천이 이어지는 서부 도심 권역',
  ),
  광주시: region(
    '41610',
    37.4294,
    127.255,
    -0.4,
    -0.1,
    false,
    '남한산성·팔당호 주변의 산림·역사 문화 권역',
  ),
  구리시: region(
    '41310',
    37.5943,
    127.1296,
    0.1,
    0.0,
    false,
    '동구릉과 한강시민공원을 품은 중동부 수변 권역',
  ),
  군포시: region(
    '41410',
    37.3616,
    126.9352,
    -0.1,
    0.0,
    false,
    '수리산 도립공원과 반월호수 일대 도심 숲 권역',
  ),
  김포시: region(
    '41570',
    37.6152,
    126.7156,
    -0.5,
    0.9,
    true,
    '한강 하구·대명항과 평화누리길이 이어지는 서해 인접 권역',
  ),
  남양주시: region(
    '41360',
    37.636,
    127.2165,
    -0.4,
    0.0,
    false,
    '팔당 수변·물의정원과 광릉숲이 펼쳐진 동북부 권역',
  ),
  동두천시: region(
    '41250',
    37.9035,
    127.0605,
    -1.0,
    0.2,
    false,
    '소요산과 북부 산악 지대 · 일교차가 큰 내륙 권역',
  ),
  부천시: region(
    '41190',
    37.5034,
    126.766,
    0.2,
    0.2,
    false,
    '한국만화박물관·호수공원이 모인 서부 문화 도심 권역',
  ),
  성남시: region(
    '41130',
    37.4201,
    127.1267,
    0.1,
    -0.1,
    false,
    '분당 중앙공원·율동공원과 판교 일대 도심 권역',
  ),
  수원시: region(
    '41110',
    37.2636,
    127.0286,
    0.0,
    0.0,
    false,
    '수원 화성과 광교호수공원 중심의 경기 남부 도청 권역',
  ),
  시흥시: region(
    '41390',
    37.38,
    126.803,
    -0.4,
    0.9,
    true,
    '갯골생태공원·오이도·거북섬이 이어지는 서해안 수변 권역',
  ),
  안산시: region(
    '41270',
    37.3219,
    126.8309,
    -0.5,
    1.0,
    true,
    '대부도·시화호 해안과 도심 공원이 어우러진 서해 권역',
  ),
  안성시: region(
    '41550',
    37.0079,
    127.2797,
    0.2,
    -0.1,
    false,
    '안성팜랜드·칠장사 등 경기 최남단 내륙 전원 권역',
  ),
  안양시: region(
    '41170',
    37.3943,
    126.9568,
    0.0,
    0.0,
    false,
    '안양예술공원과 삼성산 계곡이 이어지는 도심 근교 권역',
  ),
  양주시: region(
    '41630',
    37.7853,
    127.0458,
    -0.8,
    0.1,
    false,
    '장흥 문화예술밸리·나리농원 일대 북부 내륙 권역',
  ),
  양평군: region(
    '41830',
    37.4917,
    127.4876,
    -0.8,
    0.0,
    false,
    '두물머리·세미원과 용문산이 어우러진 남한강 동부 권역',
  ),
  여주시: region(
    '41670',
    37.2983,
    127.6374,
    -0.3,
    -0.1,
    false,
    '신륵사·세종대왕릉과 남한강 물길이 흐르는 동남부 권역',
  ),
  연천군: region(
    '41800',
    38.0965,
    127.0748,
    -1.4,
    0.3,
    false,
    '한탄강 주상절리·재인폭포가 펼쳐진 경기 최북단 권역',
  ),
  오산시: region(
    '41370',
    37.1498,
    127.0772,
    0.2,
    0.0,
    false,
    '물향기수목원과 독산성 일대 남부 평야 권역',
  ),
  용인시: region(
    '41460',
    37.2411,
    127.1775,
    0.0,
    -0.1,
    false,
    '한국민속촌·에버랜드·자연휴양림이 모인 남부 구릉 권역',
  ),
  의왕시: region(
    '41430',
    37.3449,
    126.9683,
    -0.1,
    0.0,
    false,
    '왕송호수·백운호수와 청계산 자락의 수변 산책 권역',
  ),
  의정부시: region(
    '41150',
    37.7381,
    127.0337,
    -0.6,
    0.1,
    false,
    '도봉산·수락산 북측과 중랑천이 지나는 북부 중심 권역',
  ),
  이천시: region(
    '41500',
    37.2723,
    127.435,
    -0.1,
    -0.2,
    false,
    '설봉공원·도자예술마을이 자리한 동남부 분지 권역',
  ),
  파주시: region(
    '41480',
    37.7599,
    126.78,
    -0.8,
    0.5,
    false,
    '헤이리·출판도시·임진각 일대 임진강 서북부 권역',
  ),
  평택시: region(
    '41220',
    36.9921,
    127.1129,
    0.3,
    0.7,
    true,
    '평택호 관광단지와 서해 남부 평야·해안 권역',
  ),
  포천시: region(
    '41650',
    37.8949,
    127.2003,
    -1.2,
    0.2,
    false,
    '산정호수·포천아트밸리·국립수목원 일대 북부 산림 권역',
  ),
  하남시: region(
    '41450',
    37.5393,
    127.2148,
    0.0,
    0.1,
    false,
    '미사경정공원·검단산과 한강 수변 산책로 권역',
  ),
  화성시: region(
    '41590',
    37.1995,
    126.8312,
    -0.3,
    0.9,
    true,
    '제부도·전곡항·융건릉이 이어지는 서해안·남부 권역',
  ),
};

export const validWeatherRegions = new Set(Object.keys(WEATHER_REGIONS));

export function regionForCity(cityId: string | null): string {
  return (
    Object.keys(WEATHER_REGIONS).find(
      (name) => WEATHER_REGIONS[name].cityId === cityId,
    ) ?? '전체'
  );
}

export const weatherQuerySchema = z.object({
  region: z
    .string()
    .trim()
    .default('전체')
    .refine(
      (v) => validWeatherRegions.has(v),
      '지원하지 않는 경기 지역입니다.',
    ),
});

export const weatherIconSchema = z.enum([
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
  outfit: outfitSchema,
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
  regionName: string,
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
      detail: `${regionName === '전체' ? '경기도 전역' : regionName}에 강수가 예상됩니다. 우산을 챙기시고 야외 산책로 대신 박물관·전시관·실내 체험 공간 위주로 동선을 구성해 보세요.`,
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
      detail: `체감온도 ${current.apparentTemperature.toFixed(1)}°C, 풍속 ${current.windSpeed.toFixed(1)}m/s입니다. 야외 명소는 낮 시간대에 방문하고 실내 휴식처를 함께 담으면 쾌적합니다.`,
    };
  }
  return {
    suitability: 'outdoor',
    headline: meta.coastal
      ? '서해안 산책로와 바닷가 노을을 즐기기 좋은 날씨예요'
      : '경기도 공원과 산책로를 걷기 좋은 온화한 날씨예요',
    detail: `현재 기온 ${current.temperature.toFixed(1)}°C(체감 ${current.apparentTemperature.toFixed(1)}°C), 바람 ${current.windSpeed.toFixed(1)}m/s로 야외 걷기와 사진 촬영에 적합합니다.`,
  };
}

export function buildWeatherOutfit(
  regionName: string,
  meta: { coastal: boolean },
  current: {
    apparentTemperature: number;
    windSpeed: number;
    precipitation: number;
    weatherCode: number;
  },
  today: {
    tempMax: number;
    tempMin: number;
    precipitationProbability: number;
    weatherCode: number;
  },
): Outfit {
  return buildOutfit({
    regionName: regionName === '전체' ? '경기도' : regionName,
    coastal: meta.coastal,
    tempMax: today.tempMax,
    tempMin: today.tempMin,
    precipitationProbability: today.precipitationProbability,
    apparentTemperature: current.apparentTemperature,
    windSpeed: current.windSpeed,
    precipitation: current.precipitation,
    currentWeatherCode: current.weatherCode,
    todayWeatherCode: today.weatherCode,
  });
}

export function pickRecommendedPlaces(
  regionName: string,
  suitability: 'outdoor' | 'mixed' | 'indoor',
): string[] {
  const cityId = WEATHER_REGIONS[regionName]?.cityId ?? null;
  const scoped = cityId ? places.filter((p) => p.cityId === cityId) : places;
  const pool = scoped.length > 0 ? scoped : places;

  const score = (p: (typeof places)[number]) => {
    const text = `${p.name} ${p.description} ${p.tags.join(' ')}`;
    if (suitability === 'indoor')
      return (
        (/박물관|미술관|전시|문화|역사|과학관/.test(text) ? 10 : 0) +
        (text.includes('체험') ? 4 : 0) +
        (p.image ? 2 : 0)
      );
    const pattern =
      suitability === 'mixed'
        ? /전망|문화|산책|공원|역사/
        : /자연|산책|경관|바다|공원|호수|수목원|숲/;
    return (
      (pattern.test(text) ? (suitability === 'mixed' ? 6 : 8) : 0) +
      (p.image ? 2 : 0)
    );
  };

  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  if (!cityId) {
    const picked: string[] = [];
    const seenCities = new Set<string>();
    for (const p of sorted) {
      if (!seenCities.has(p.cityId)) {
        seenCities.add(p.cityId);
        picked.push(p.id);
        if (picked.length === 3) break;
      }
    }
    return picked;
  }

  return [...new Set(sorted.map((p) => p.id))].slice(0, 3);
}

export const kstDate = (now: number, daysOffset = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now + daysOffset * 86400000));

const round1 = (value: number) => Number(value.toFixed(1));

export function buildDemoWeather(
  regionName: string,
  now: number,
): WeatherResponse {
  const meta = WEATHER_REGIONS[regionName] ?? WEATHER_REGIONS['전체'];
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
  const advisory = buildAdvisory(regionName, meta, current);
  const daily = [weatherCode, 1, 2, 0, 61].map((code, idx) => {
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
  });

  return weatherResponseSchema.parse({
    region: regionName,
    areaNote: meta.areaNote,
    coordinates: { lat: meta.lat, lng: meta.lng },
    mode: 'demo',
    observedAt: `${kstDate(now)} 시연 기준`,
    current,
    advisory,
    daily,
    outfit: buildWeatherOutfit(regionName, meta, current, daily[0]),
    recommendedPlaceIds: pickRecommendedPlaces(
      regionName,
      advisory.suitability,
    ),
  });
}
