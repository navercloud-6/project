import { z } from 'zod';

export const outfitSchema = z.object({
  band: z.string(),
  outer: z.array(z.string()),
  top: z.array(z.string()).min(1),
  bottom: z.array(z.string()).min(1),
  accessories: z.array(z.string()),
  extras: z.array(z.string()),
  summary: z.string(),
  notes: z.array(z.string()),
});

export type Outfit = z.infer<typeof outfitSchema>;

export type OutfitInput = {
  regionName: string;
  coastal: boolean;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  apparentTemperature: number;
  windSpeed: number;
  precipitation: number;
  currentWeatherCode: number;
  todayWeatherCode: number;
};

type Band = {
  max: number;
  label: string;
  outer: string[];
  optionalOuter?: boolean;
  top: string[];
  bottom: string[];
  accessories: string[];
};

// 오늘 최고기온 기준 8구간. 경계는 '이하'로 판정한다(4.5°C → 5~8°C 구간).
const BANDS: Band[] = [
  {
    max: 4,
    label: '4°C 이하',
    outer: ['롱패딩', '두꺼운 코트'],
    top: ['니트', '히트텍'],
    bottom: ['기모 바지'],
    accessories: ['목도리', '장갑'],
  },
  {
    max: 8,
    label: '5~8°C',
    outer: ['코트', '가죽재킷'],
    top: ['니트', '히트텍'],
    bottom: ['두꺼운 면바지', '청바지'],
    accessories: ['목도리'],
  },
  {
    max: 11,
    label: '9~11°C',
    outer: ['트렌치코트', '야상', '점퍼'],
    top: ['니트', '맨투맨'],
    bottom: ['청바지', '면바지'],
    accessories: [],
  },
  {
    max: 16,
    label: '12~16°C',
    outer: ['재킷', '가디건'],
    top: ['맨투맨', '얇은 니트'],
    bottom: ['청바지', '면바지'],
    accessories: [],
  },
  {
    max: 19,
    label: '17~19°C',
    outer: ['얇은 가디건'],
    optionalOuter: true,
    top: ['얇은 니트', '후드티'],
    bottom: ['면바지', '청바지'],
    accessories: [],
  },
  {
    max: 22,
    label: '20~22°C',
    outer: ['얇은 셔츠'],
    optionalOuter: true,
    top: ['긴팔 티셔츠'],
    bottom: ['면바지', '슬랙스'],
    accessories: [],
  },
  {
    max: 27,
    label: '23~27°C',
    outer: [],
    top: ['반팔', '얇은 셔츠'],
    bottom: ['얇은 면바지', '반바지'],
    accessories: [],
  },
  {
    max: Infinity,
    label: '28°C 이상',
    outer: [],
    top: ['민소매', '반팔'],
    bottom: ['반바지', '린넨 바지'],
    accessories: ['모자'],
  },
];

export const RAIN_PROBABILITY_THRESHOLD = 60;
export const STRONG_WIND_THRESHOLD = 8;
export const DIURNAL_RANGE_THRESHOLD = 8;
export const HOT_PACK_THRESHOLD = -5;
export const COLD_MAX_THRESHOLD = 4;
export const COLD_APPARENT_THRESHOLD = 0;
export const HOT_SUNNY_THRESHOLD = 28;
// 해안 바람막이는 반팔 구간(23°C 이상) 전까지만 권한다.
const COASTAL_WINDBREAKER_MAX = 22;
const HEAVY_OUTER_MAX = 8;
export const DIURNAL_LAYER_MIN = 12;

export const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
export const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);
// 강한 비·강한 소나기·뇌우(WMO 코드)
const HEAVY_RAIN_CODES = new Set([65, 67, 82, 95, 96, 99]);
const SUNNY_CODES = new Set([0, 1]);

// 추가 준비물로 권할 수 있는 이름 전체('물'은 다른 낱말에 섞여 검사에서 뺀다).
const EXTRA_ITEMS = [
  '우산',
  '방수 신발',
  '우비',
  '여벌 양말',
  '미끄럼 방지 신발',
  '방수 장갑',
  '귀마개',
  '핫팩',
  '바람막이',
  '끈 있는 모자',
  '얇은 겉옷',
  '선글라스',
  '선크림',
];
/** 옷차림 표와 준비물 규칙에 나오는 모든 옷·준비물 이름. */
export const OUTFIT_VOCABULARY: readonly string[] = [
  ...new Set([
    ...BANDS.flatMap((b) => [
      ...b.outer,
      ...b.top,
      ...b.bottom,
      ...b.accessories,
    ]),
    ...EXTRA_ITEMS,
  ]),
];

export function outfitBand(tempMax: number): Band {
  return BANDS.find((band) => tempMax <= band.max) ?? BANDS[BANDS.length - 1];
}

export const formatNum = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

function hasBatchim(word: string): boolean {
  const trimmed = word.trim();
  const code = trimmed.charCodeAt(trimmed.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export const josa = (word: string, withBatchim: string, without: string) =>
  `${word}${hasBatchim(word) ? withBatchim : without}`;

export function joinKoreanList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  const head = items.slice(0, -1);
  const prev = head[head.length - 1];
  return `${[...head.slice(0, -1), josa(prev, '과', '와')].join(', ')} ${items[items.length - 1]}`;
}

function summarize(band: Band, tempMin: number, tempMax: number): string {
  const lead = `최저 ${formatNum(tempMin)}도, 최고 ${formatNum(tempMax)}도라`;
  const top = band.top[0];
  const bottom = band.bottom[0];
  let wear: string;
  if (band.outer.length > 0 && !band.optionalOuter) {
    wear = `${band.outer[0]}에 ${top}, ${josa(bottom, '을', '를')} 입으세요.`;
  } else if (band.outer.length > 0) {
    wear = `${top}에 ${josa(bottom, '을', '를')} 입고, 쌀쌀하면 ${josa(band.outer[0], '을', '를')} 걸치세요.`;
  } else {
    wear = `${top}에 ${josa(bottom, '을', '를')} 입으세요.`;
  }
  const parts = [`${lead} ${wear}`];
  if (band.accessories.length > 0) {
    parts.push(
      `${josa(joinKoreanList(band.accessories), '을', '를')} 챙기세요.`,
    );
  }
  if (tempMax <= 8) {
    parts.push(`낮에도 ${formatNum(tempMax)}도라 겉옷을 벗기 어렵습니다.`);
  }
  return parts.join(' ');
}

export function buildOutfit(input: OutfitInput): Outfit {
  const band = outfitBand(input.tempMax);
  const extras: string[] = [];
  const notes: string[] = [];
  const add = (items: string[], note: string) => {
    for (const item of items) {
      if (!band.accessories.includes(item) && !extras.includes(item)) {
        extras.push(item);
      }
    }
    notes.push(note);
  };

  const codes = [input.currentWeatherCode, input.todayWeatherCode];
  const snowy = codes.some((code) => SNOW_CODES.has(code));
  const heavyRain = codes.some((code) => HEAVY_RAIN_CODES.has(code));
  const rainy =
    heavyRain ||
    codes.some((code) => RAIN_CODES.has(code)) ||
    input.precipitationProbability >= RAIN_PROBABILITY_THRESHOLD ||
    (input.precipitation > 0 && !snowy);
  const windy = input.windSpeed >= STRONG_WIND_THRESHOLD;
  const range = Number((input.tempMax - input.tempMin).toFixed(1));

  if (rainy) {
    add(
      ['우산', '방수 신발'],
      input.precipitationProbability >= RAIN_PROBABILITY_THRESHOLD
        ? `강수확률이 ${input.precipitationProbability}%라 우산과 방수 신발을 챙기세요.`
        : '비 소식이 있어 우산과 방수 신발을 챙기세요.',
    );
  }
  if (rainy && windy) {
    add(
      ['우비'],
      `비에 바람까지 초속 ${formatNum(input.windSpeed)}m로 강해 우산보다 우비가 편합니다.`,
    );
  }
  if (heavyRain) {
    add(
      ['우비', '방수 신발', '여벌 양말'],
      '강한 비가 예보돼 우비와 방수 신발, 여벌 양말을 준비하세요.',
    );
  }
  if (snowy) {
    add(
      ['미끄럼 방지 신발', '방수 장갑'],
      '눈 소식이 있어 미끄럼 방지 신발과 방수 장갑을 챙기세요.',
    );
  }
  if (
    input.tempMax <= COLD_MAX_THRESHOLD ||
    input.apparentTemperature <= COLD_APPARENT_THRESHOLD
  ) {
    add(
      ['목도리', '장갑', '귀마개'],
      input.tempMax <= COLD_MAX_THRESHOLD
        ? `낮 최고 ${formatNum(input.tempMax)}도로 추워 목도리, 장갑, 귀마개로 보온하세요.`
        : `체감온도가 ${formatNum(input.apparentTemperature)}도로 낮아 목도리, 장갑, 귀마개로 보온하세요.`,
    );
  }
  if (input.tempMin <= HOT_PACK_THRESHOLD) {
    add(
      ['핫팩'],
      `최저 ${formatNum(input.tempMin)}도로 아침저녁이 매우 추워 핫팩을 챙기세요.`,
    );
  }
  // 두꺼운 겉옷 구간(최고 8°C 이하)에는 바람막이를 따로 권하지 않고 방풍 겉옷을 안내한다.
  const heavyOuter = input.tempMax <= HEAVY_OUTER_MAX;
  if (windy) {
    add(
      heavyOuter ? ['끈 있는 모자'] : ['바람막이', '끈 있는 모자'],
      heavyOuter
        ? `바람이 초속 ${formatNum(input.windSpeed)}m로 강해 바람이 잘 들지 않는 겉옷과 끈 있는 모자가 좋습니다.`
        : `바람이 초속 ${formatNum(input.windSpeed)}m로 강해 바람막이와 끈 있는 모자가 좋습니다.`,
    );
  }
  if (input.coastal && input.tempMax <= COASTAL_WINDBREAKER_MAX) {
    add(
      heavyOuter ? [] : ['바람막이'],
      heavyOuter
        ? `${josa(input.regionName, '은', '는')} 해안 권역이라 해풍 때문에 더 춥게 느껴질 수 있어요.`
        : `${josa(input.regionName, '은', '는')} 해안 권역이라 해풍이 있어 바람막이를 챙기세요.`,
    );
  }
  // 일교차 겉옷은 얇은 겉옷으로 체온을 조절할 수 있는 구간(최고 12°C 이상)에서만 권한다.
  if (range >= DIURNAL_RANGE_THRESHOLD && input.tempMax >= DIURNAL_LAYER_MIN) {
    add(
      ['얇은 겉옷'],
      `일교차가 ${formatNum(range)}도로 커서 벗고 입기 쉬운 얇은 겉옷을 하나 더 챙기세요.`,
    );
  }
  if (
    input.tempMax >= HOT_SUNNY_THRESHOLD &&
    !rainy &&
    SUNNY_CODES.has(input.todayWeatherCode)
  ) {
    add(
      ['모자', '선글라스', '선크림', '물'],
      `최고 ${formatNum(input.tempMax)}도의 맑은 날이라 모자, 선글라스, 선크림과 물을 챙기세요.`,
    );
  }

  return outfitSchema.parse({
    band: band.label,
    outer: band.outer,
    top: band.top,
    bottom: band.bottom,
    accessories: band.accessories,
    extras,
    summary: summarize(band, input.tempMin, input.tempMax),
    notes,
  });
}
