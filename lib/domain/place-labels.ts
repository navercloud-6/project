import { z } from 'zod';
import { gyeonggiCities } from './gyeonggi';

export const SETTING_LABELS = ['실내', '야외', '실내·야외'] as const;
export const THEME_LABELS = [
  '호수',
  '바다',
  '산·계곡',
  '공원·숲',
  '박물관·전시',
  '역사·유적',
  '체험·테마',
  '전망·야경',
  '사찰·전통',
  '시장·거리',
  '예술·공연',
  '캠핑·레저',
] as const;
export const COMPANION_LABELS = [
  '아이동반',
  '가족',
  '연인·데이트',
  '혼자·힐링',
  '부모님',
] as const;
export const STYLE_LABELS = [
  '산책',
  '비오는날',
  '사진명소',
  '드라이브',
  '교육·학습',
  '휴식',
  '액티비티',
] as const;

export type SettingLabel = (typeof SETTING_LABELS)[number];
export type ThemeLabel = (typeof THEME_LABELS)[number];
export type CompanionLabel = (typeof COMPANION_LABELS)[number];
export type StyleLabel = (typeof STYLE_LABELS)[number];

export const clovaPlaceLabelSchema = z.object({
  setting: z.enum(SETTING_LABELS),
  themes: z.array(z.enum(THEME_LABELS)).min(1).max(4),
  companions: z.array(z.enum(COMPANION_LABELS)).min(1).max(4),
  styles: z.array(z.enum(STYLE_LABELS)).min(1).max(4),
  keywords: z.array(z.string().trim().min(1).max(20)).max(6),
});

export const placeLabelSchema = clovaPlaceLabelSchema.extend({
  source: z.enum(['clova', 'heuristic', 'manual']),
});

export type PlaceLabel = z.infer<typeof placeLabelSchema>;
export type PlaceLabelMap = Record<string, PlaceLabel>;

export type LabelablePlace = {
  id: string;
  name: string;
  region: string;
  cityId?: string;
  description: string;
  tags: readonly string[];
  labels?: PlaceLabel;
};

const INDOOR_RE =
  /박물관|미술관|전시관|기념관|과학관|도서관|갤러리|아트센터|아쿠아리움|실내|전시장|문학관|역사관|생태관|홍보관|뮤지엄|공연장|극장|체험관|스파|온천|찜질|쇼핑몰|스타필드|아울렛|서점|키즈카페|천문대|아카이브|전시실|관람관|문화회관|예술회관/;
const OUTDOOR_RE =
  /공원|호수|저수지|바다|해변|갯벌|갯골|계곡|폭포|등산|산책로|둘레길|수목원|식물원|휴양림|성곽|유적지|출렁다리|해수욕장|캠핑|야영|항구|포구|능선|숲|강변|하천|광장|마을|정원|길$|섬$|산$|산성/;

const THEME_RULES: readonly [ThemeLabel, RegExp][] = [
  [
    '호수',
    /호수|저수지|호반|물왕|두물머리|청평호|팔당호|산정호수|광교호수|일산호수|백운호수|기흥호수|왕송호수|마장호수|고삼호수|수변|강변|남한강|북한강|한탄강|임진강|수원천|연못|유원지/,
  ],
  [
    '바다',
    /바다|해변|해수욕장|갯벌|갯골|항구|포구|등대|선착장|어촌|오이도|제부도|대부도|전곡항|궁평항|방조제|해안|서해|해양/,
  ],
  [
    '산·계곡',
    /계곡|폭포|등산|봉우리|능선|고개|약수|명산|소요산|축령산|유명산|청계산|관악산|북한산|도봉산|수리산|광교산|용문산|운악산|화악산|천마산|마니산|산성|협곡|주상절리/,
  ],
  [
    '공원·숲',
    /공원|수목원|식물원|정원|숲|생태|습지|둘레길|산책로|자연휴양림|휴양림|치유의숲|잔디|연꽃|단풍|은행나무|메타세쿼이아|화원|들판/,
  ],
  [
    '박물관·전시',
    /박물관|미술관|전시관|기념관|과학관|도서관|갤러리|아트센터|아쿠아리움|천문대|전시장|문학관|역사관|생태관|홍보관|뮤지엄|아카이브|전시실|문화시설/,
  ],
  [
    '역사·유적',
    /유적|문화재|성곽|행궁|왕릉|고택|향교|서원|사적|고인돌|선사|전적지|독립|민속|조선|삼국|유네스코|성지|한옥|역사·문화|역사/,
  ],
  [
    '체험·테마',
    /체험|테마파크|랜드|월드|동물원|목장|농장|팜|승마|도예|도자기|공방|키즈|어린이|워터파크|놀이|에버랜드|민속촌|허브|레일바이크|루지|케이블카|출렁다리/,
  ],
  [
    '전망·야경',
    /전망대|전망|타워|야경|일몰|낙조|스카이워크|조망|등대|노을|불빛|별빛|경관 감상/,
  ],
  ['사찰·전통', /사찰|암자|불상|석탑|대웅전|템플|전통|한옥|서원|향교|성당/],
  [
    '시장·거리',
    /시장|거리|골목|특구|상가|카페거리|문화의거리|벽화|광장|로데오|차이나타운|마을/,
  ],
  [
    '예술·공연',
    /예술|공연|극장|아트|음악|오페라|영화|촬영지|드라마|조각|도예|공예|도자|출판|문학/,
  ],
  [
    '캠핑·레저',
    /캠핑|글램핑|야영|스키|눈썰매|수상레저|카약|서핑|자전거|골프|트레킹|짚라인|레저|래프팅/,
  ],
];

const KEYWORD_CANDIDATES = [
  '호수',
  '저수지',
  '수변',
  '바다',
  '갯벌',
  '해변',
  '항구',
  '계곡',
  '폭포',
  '등산',
  '산성',
  '공원',
  '수목원',
  '식물원',
  '정원',
  '숲',
  '습지',
  '둘레길',
  '산책로',
  '박물관',
  '미술관',
  '전시관',
  '기념관',
  '과학관',
  '도서관',
  '천문대',
  '유적',
  '행궁',
  '왕릉',
  '성곽',
  '한옥',
  '서원',
  '향교',
  '사찰',
  '체험',
  '목장',
  '농장',
  '동물원',
  '테마파크',
  '출렁다리',
  '케이블카',
  '전망대',
  '야경',
  '낙조',
  '일몰',
  '도자기',
  '공방',
  '시장',
  '벽화',
  '캠핑',
  '자전거',
  '휴양림',
  '온천',
  '실내',
] as const;

function uniqueLimit<T>(items: T[], limit: number): T[] {
  return [...new Set(items)].slice(0, limit);
}

export function inferHeuristicLabels(place: LabelablePlace): PlaceLabel {
  const nameAndTags = [place.name, ...place.tags].join(' ');
  const text = [
    place.name,
    place.region,
    place.description,
    ...place.tags,
  ].join(' ');

  const indoorName = INDOOR_RE.test(nameAndTags);
  const outdoorName = OUTDOOR_RE.test(nameAndTags);
  const indoorText = indoorName || INDOOR_RE.test(place.description);
  const outdoorText = outdoorName || OUTDOOR_RE.test(place.description);

  let setting: SettingLabel = '야외';
  if (indoorName && !outdoorName) setting = '실내';
  else if (indoorText && outdoorText) setting = '실내·야외';
  else if (indoorText) setting = '실내';

  const themes = THEME_RULES.filter(([, re]) => re.test(text)).map(
    ([theme]) => theme,
  );
  if (!themes.length) {
    themes.push(setting === '실내' ? '박물관·전시' : '공원·숲');
  }
  const hasTheme = (...list: ThemeLabel[]) =>
    list.some((theme) => themes.includes(theme));

  const companions: CompanionLabel[] = [];
  if (
    hasTheme('체험·테마', '박물관·전시', '공원·숲') ||
    /아이|어린이|키즈|체험|가족|동물/.test(text)
  )
    companions.push('아이동반', '가족');
  if (
    hasTheme('호수', '바다', '전망·야경', '예술·공연', '시장·거리', '공원·숲')
  )
    companions.push('연인·데이트');
  if (hasTheme('역사·유적', '사찰·전통', '공원·숲', '산·계곡', '호수'))
    companions.push('부모님');
  if (
    hasTheme('박물관·전시', '사찰·전통', '공원·숲', '호수', '예술·공연') ||
    /산책|조용|사색|휴식|도서관/.test(text)
  )
    companions.push('혼자·힐링');
  if (!companions.length) companions.push('가족', '연인·데이트');

  const styles: StyleLabel[] = [];
  if (setting === '실내' || setting === '실내·야외') styles.push('비오는날');
  if (
    hasTheme('공원·숲', '호수', '바다', '역사·유적', '시장·거리') ||
    /산책|걷기|둘레길/.test(text)
  )
    styles.push('산책');
  if (hasTheme('박물관·전시', '역사·유적', '사찰·전통'))
    styles.push('교육·학습');
  if (hasTheme('호수', '바다', '전망·야경', '공원·숲', '예술·공연'))
    styles.push('사진명소');
  if (hasTheme('체험·테마', '캠핑·레저', '산·계곡')) styles.push('액티비티');
  if (hasTheme('호수', '바다', '산·계곡')) styles.push('드라이브');
  if (hasTheme('공원·숲', '사찰·전통', '호수') || /휴식|치유|힐링/.test(text))
    styles.push('휴식');
  if (!styles.length) styles.push('산책', '휴식');

  const keywords = KEYWORD_CANDIDATES.filter((kw) => text.includes(kw));
  if (setting === '실내' && !keywords.includes('실내')) {
    keywords.unshift('실내');
  }

  return placeLabelSchema.parse({
    setting,
    themes: uniqueLimit(themes, 4),
    companions: uniqueLimit(companions, 4),
    styles: uniqueLimit(styles, 4),
    keywords: uniqueLimit(keywords, 6),
    source: 'heuristic',
  });
}

type LabelField = 'setting' | 'themes' | 'companions' | 'styles';

// 단어와 조사 경계를 구분해 '산책'·'안산시'를 '산'으로 해석하지 않는다.
function queryWord(source: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${source})(?=$|[^\\p{L}\\p{N}]|에서|으로|이랑|하고|부터|까지|처럼|보다|랑|와|과|에|의|을|를|은|는|이|가|도|만|하기|할|하기에)`,
    'u',
  );
}

const QUERY_INTENTS: readonly [LabelField, RegExp, readonly string[]][] = (
  [
    ['themes', '호수|저수지|호반|수변|강변', ['호수']],
    ['setting', '실내|안에서|내부|폭염|한파|추울|더울', ['실내', '실내·야외']],
    [
      'setting',
      '비\\s*오는(?:\\s*날)?|비오는날|우천|장마|비올|비',
      ['실내', '실내·야외'],
    ],
    ['setting', '야외|밖에서|탁\\s*트인', ['야외', '실내·야외']],
    ['companions', '아이(?:동반)?|어린이|키즈|초등|유아|아기', ['아이동반']],
    ['companions', '가족', ['가족']],
    [
      'companions',
      '부모님?|효도|어르신|할머니|할아버지|조부모|어머니|아버지|엄마|아빠',
      ['부모님'],
    ],
    ['companions', '데이트|연인|커플|로맨틱', ['연인·데이트']],
    ['companions', '혼자|혼행', ['혼자·힐링']],
    ['styles', '조용(?:한|하게)?|힐링|쉬기|휴식|사색', ['휴식']],
    ['themes', '바다|해변|갯벌|해수욕|항구|포구|서해|해양|섬', ['바다']],
    ['themes', '산|등산|계곡|폭포|트레킹', ['산·계곡']],
    ['themes', '공원|숲|수목원|식물원|정원|꽃|자연', ['공원·숲']],
    ['themes', '박물관|미술관|전시|과학관|도서관|갤러리', ['박물관·전시']],
    ['themes', '역사|유적|문화재|성곽|왕릉', ['역사·유적']],
    ['themes', '체험|놀이|테마|동물|목장|농장|공방', ['체험·테마']],
    ['themes', '야경|노을|일몰|전망|뷰', ['전망·야경']],
    ['themes', '사찰|절|템플|한옥|전통', ['사찰·전통']],
    ['themes', '시장|거리|골목|벽화', ['시장·거리']],
    ['themes', '예술|공연|음악|문화|도자기', ['예술·공연']],
    ['themes', '캠핑|글램핑|레저|자전거', ['캠핑·레저']],
    ['styles', '액티비티', ['액티비티']],
    ['styles', '드라이브|차로', ['드라이브']],
    ['styles', '사진|인생샷|포토|출사', ['사진명소']],
    ['styles', '산책|걷기|둘레길|트레일', ['산책']],
  ] satisfies [LabelField, string, string[]][]
).map(([field, source, labels]) => [field, queryWord(source), labels]);

const QUERY_FILLERS = new Set([
  '여행',
  '추천',
  '관광',
  '관광지',
  '장소',
  '곳',
  '코스',
  '함께',
  '같이',
  '근처',
  '주변',
  '근교',
  '가까운',
  '가볼',
  '가볼만한',
  '가기',
  '좋은',
  '좋을',
  '하기',
  '할만한',
  '찾아줘',
  '알려줘',
  '추천해줘',
  '추천해주세요',
  '가고',
  '싶어',
  '싶어요',
  '경기도',
  '경기',
  '전체',
  '에서',
  '으로',
  '이랑',
  '하고',
  '와',
  '과',
  '에',
  '의',
  '을',
  '를',
  '은',
  '는',
  '이',
  '가',
  '도',
  '만',
  '랑',
  '로',
  '할',
]);

function parsePlaceQuery(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s·]/gu, ' ')
    .trim();
  let remainder = normalized;
  const cities = gyeonggiCities.filter((city) => {
    const pattern = queryWord(`${city.name}|${city.name.slice(0, -1)}`);
    if (!pattern.test(normalized)) return false;
    remainder = remainder.replace(new RegExp(pattern.source, 'gu'), ' ');
    return true;
  });
  const groups = QUERY_INTENTS.filter(([, pattern]) => {
    if (!pattern.test(normalized)) return false;
    remainder = remainder.replace(new RegExp(pattern.source, 'gu'), ' ');
    return true;
  });
  const textGroups = remainder
    .split(/[\s·]+/)
    .map((word) => {
      if (!word || QUERY_FILLERS.has(word)) return [];
      const terms = tokenizeQuery(word);
      return terms.some((term) => QUERY_FILLERS.has(term))
        ? []
        : terms.length
          ? terms
          : [word];
    })
    .filter((terms) => terms.length > 0);
  return { cities, groups, textGroups };
}

const PARTICLE_RE =
  /(?:에서|으로|이랑|하고|부터|까지|처럼|보다|로|랑|와|과|에|의|을|를|은|는|이|가|도|만)$/;

export function tokenizeQuery(query: string): string[] {
  const cleaned = query
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s·]/gu, ' ');
  const raw = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const tokens = new Set<string>();
  for (const word of raw) {
    if (word.length >= 2) tokens.add(word);
    const stem = word.replace(PARTICLE_RE, '');
    if (stem.length >= 2) tokens.add(stem);
    if (
      word === '산' ||
      word === '비' ||
      word === '숲' ||
      word === '절' ||
      word === '섬'
    ) {
      tokens.add(word);
    }
  }
  return [...tokens];
}

export function expandQueryTerms(query: string): string[] {
  return [
    ...new Set(parsePlaceQuery(query).groups.flatMap(([, , terms]) => terms)),
  ];
}

export function placeLabelBadges(place: LabelablePlace): string[] {
  const labels = place.labels;
  if (!labels) return [...place.tags].slice(0, 2);
  return uniqueLimit([labels.setting, ...labels.themes, ...labels.styles], 3);
}

export function placeSearchText(place: LabelablePlace): string {
  const l = place.labels;
  return [
    place.name,
    place.region,
    place.description,
    ...place.tags,
    ...(l
      ? [l.setting, ...l.themes, ...l.companions, ...l.styles, ...l.keywords]
      : []),
  ].join(' ');
}

export function formatPlaceForReranker(place: LabelablePlace): string {
  const l = place.labels;
  const labelPart = l
    ? `구분:${l.setting} | 테마:${l.themes.join(', ')} | 동행:${l.companions.join(', ')} | 방식:${l.styles.join(', ')}${l.keywords.length ? ` | 키워드:${l.keywords.join(', ')}` : ''}`
    : `태그:${place.tags.join(', ')}`;
  return `${place.name} (${place.region}) | ${labelPart} | 소개:${place.description.slice(0, 220)}`;
}

export function scorePlaceMatch(
  place: LabelablePlace,
  query: string,
  parsed = parsePlaceQuery(query),
): number {
  const trimmed = query.trim();
  if (!trimmed) return 0;
  const lower = trimmed.toLowerCase();
  const tokens = tokenizeQuery(trimmed);
  const expanded = new Set(parsed.groups.flatMap(([, , terms]) => terms));
  const labels = place.labels;

  let score = 0;
  const nameLower = place.name.toLowerCase();
  const regionLower = place.region.toLowerCase();
  const descLower = place.description.toLowerCase();

  if (nameLower.includes(lower)) score += 28;
  if (regionLower.includes(lower)) score += 16;

  if (labels) {
    const wantsIndoor = /실내|비\s*오는|우천|장마|비올|비오는/.test(trimmed);
    const wantsOutdoor = /야외|밖에서/.test(trimmed);
    if (wantsIndoor) {
      if (labels.setting === '실내') score += 20;
      else if (labels.setting === '실내·야외') score += 11;
    }
    if (wantsOutdoor) {
      if (labels.setting === '야외') score += 16;
      else if (labels.setting === '실내·야외') score += 10;
    }

    const tokenSet = new Set(tokens);
    for (const term of expanded) {
      if (tokenSet.has(term.toLowerCase())) continue;
      if (labels.themes.includes(term as ThemeLabel)) score += 14;
      if (labels.companions.includes(term as CompanionLabel)) score += 10;
      if (labels.styles.includes(term as StyleLabel)) score += 10;
      if (labels.keywords.some((k) => k === term)) score += 8;
    }
  }

  for (const token of tokens) {
    if (token.length < 2) continue;
    const has = (list: readonly string[]) =>
      list.some((item) => item.toLowerCase().includes(token));
    if (nameLower.includes(token)) score += 32;
    if (regionLower.includes(token)) score += 12;
    if (has(place.tags)) score += 8;
    if (labels) {
      if (labels.setting.toLowerCase().includes(token)) score += 14;
      if (has(labels.themes)) score += 14;
      if (has(labels.companions)) score += 10;
      if (has(labels.styles)) score += 10;
      if (has(labels.keywords)) score += 10;
    }
    if (descLower.includes(token)) score += 4;
  }

  return score;
}

export function matchesPlaceQuery(
  place: LabelablePlace,
  query: string,
): boolean {
  return matchesParsedQuery(place, parsePlaceQuery(query));
}

function matchesParsedQuery(
  place: LabelablePlace,
  parsed: ReturnType<typeof parsePlaceQuery>,
): boolean {
  if (
    parsed.cities.length &&
    !parsed.cities.some((city) =>
      place.cityId ? place.cityId === city.id : place.region === city.name,
    )
  )
    return false;
  const labels = place.labels ?? inferHeuristicLabels(place);
  if (
    !parsed.groups.every(([field, , values]) => {
      const actual = labels[field];
      return values.some((value) =>
        typeof actual === 'string'
          ? actual === value
          : actual.some((label) => label === value),
      );
    })
  )
    return false;
  const text = placeSearchText(place).toLowerCase();
  return parsed.textGroups.every((terms) =>
    terms.some((term) => text.includes(term)),
  );
}

export function searchPlaces<T extends LabelablePlace>(
  places: readonly T[],
  query: string,
  region = '전체',
): T[] {
  const parsed = parsePlaceQuery(query);
  const matched = places.filter(
    (place) =>
      (region === '전체' || place.region === region) &&
      matchesParsedQuery(place, parsed),
  );
  if (!query.trim()) return matched;
  return matched
    .map((place) => ({ place, score: scorePlaceMatch(place, query, parsed) }))
    .sort((a, b) => b.score - a.score)
    .map(({ place }) => place);
}

export const QUICK_SEARCH_CHIPS = [
  { label: '호수', query: '호수' },
  { label: '실내', query: '실내' },
  { label: '비 오는 날', query: '비 오는 날 실내' },
  { label: '아이와 함께', query: '아이와 함께 체험' },
  { label: '바다', query: '바다' },
  { label: '산·계곡', query: '산 계곡' },
  { label: '역사·유적', query: '역사 유적' },
  { label: '조용한 산책', query: '조용한 산책 힐링' },
] as const;
